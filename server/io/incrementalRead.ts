import { createHash } from 'crypto';
import { closeSync, fstatSync, openSync, readSync, statSync } from 'fs';
import { logCaught } from '../log';

const TAIL_BYTES = 64;
const HEAD_BYTES = 4096;

/** Byte offset remembered between scans of an append-only session log. */
export interface ByteCursor {
  size: number;
  mtimeMs: number;
  /** SHA-256 of the whole file. A same-length rewrite that keeps the tail still changes this. */
  digest: string;
  /** SHA-256 of the first 4KB, so a same-mtime rewrite of the head is not missed. */
  head: string;
  /** Last bytes at `size`, so an append can resume without rereading the prefix. */
  tail: Buffer;
  /** Trailing partial line, kept until a newline arrives. */
  remainder: string;
}

export type IncrementalRead =
  | { mode: 'unchanged'; cursor: ByteCursor }
  | { mode: 'append' | 'reset'; cursor: ByteCursor; lines: string[]; chunk: string };

export interface FoldCache<T> {
  cursor: ByteCursor;
  value: T;
}

function readAt(filePath: string, start: number, length: number): Buffer | null {
  if (length <= 0) return Buffer.alloc(0);
  let fd: number | undefined;
  try {
    fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const n = readSync(fd, buf, offset, length - offset, start + offset);
      if (n <= 0) break;
      offset += n;
    }
    return buf.subarray(0, offset);
  } catch (err) {
    logCaught('incrementalRead', err, filePath);
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function hashFile(filePath: string): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, 'r');
    const hash = createHash('sha256');
    const buf = Buffer.alloc(64 * 1024);
    let position = 0;
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, position);
      if (n <= 0) break;
      hash.update(buf.subarray(0, n));
      position += n;
    }
    return hash.digest('hex');
  } catch (err) {
    logCaught('incrementalRead', err, filePath);
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function tailOf(filePath: string, size: number): Buffer | null {
  const start = Math.max(0, size - TAIL_BYTES);
  return readAt(filePath, start, size - start);
}

/** Hash of the first bytes. When `size` is at most HEAD_BYTES this is the whole file. */
function headDigest(filePath: string, size: number): string | null {
  const length = Math.min(size, HEAD_BYTES);
  const buf = readAt(filePath, 0, length);
  if (!buf || buf.length !== length) return null;
  return createHash('sha256').update(buf).digest('hex');
}

function splitLines(text: string): { lines: string[]; remainder: string } {
  const endsWithNl = text.endsWith('\n');
  const parts = text.split('\n');
  const remainder = endsWithNl ? '' : (parts.pop() ?? '');
  if (endsWithNl) parts.pop();
  return { lines: parts, remainder };
}

/**
 * Read a session log from the previous offset.
 * Unchanged files return no lines. Growth past a matching tail returns only
 * new lines. A rewrite or shrink reads the file again from the start.
 * Same size and the same tail is unchanged only when the content hash agrees.
 * Files up to 4KB compare a head hash at the same mtime, so a same-millisecond
 * rewrite of the first line is still a reset. Larger files compare the full SHA-256.
 */
export function readIncremental(filePath: string, previous?: ByteCursor): IncrementalRead | null {
  let size: number;
  let mtimeMs: number;
  try {
    const stat = statSync(filePath);
    size = stat.size;
    mtimeMs = stat.mtimeMs;
  } catch (err) {
    logCaught('incrementalRead', err, filePath);
    return null;
  }

  if (previous && previous.size === size && previous.mtimeMs === mtimeMs && size <= HEAD_BYTES) {
    const tail = tailOf(filePath, size);
    const head = tail && tail.equals(previous.tail) ? headDigest(filePath, size) : null;
    if (tail && head && head === previous.head) {
      return { mode: 'unchanged', cursor: previous };
    }
  }

  if (previous && previous.size === size) {
    const tail = tailOf(filePath, size);
    if (tail && tail.equals(previous.tail)) {
      const digest = hashFile(filePath);
      if (digest && digest === previous.digest) {
        return { mode: 'unchanged', cursor: { ...previous, mtimeMs } };
      }
    }
  }

  let start = 0;
  let mode: 'append' | 'reset' = 'reset';
  let prefix = '';
  if (previous && size > previous.size) {
    const checkStart = Math.max(0, previous.size - TAIL_BYTES);
    const previousTail = readAt(filePath, checkStart, previous.size - checkStart);
    if (previousTail && previousTail.equals(previous.tail)) {
      start = previous.size;
      prefix = previous.remainder;
      mode = 'append';
    }
  }

  const chunkBuf = readAt(filePath, start, size - start);
  if (!chunkBuf) return null;
  const chunk = chunkBuf.toString('utf8');
  const { lines, remainder } = splitLines(prefix + chunk);
  const tail = tailOf(filePath, size);
  const digest = hashFile(filePath);
  const head = headDigest(filePath, size);
  if (!tail || !digest || !head) return null;

  return {
    mode,
    lines,
    chunk,
    cursor: { size, mtimeMs, digest, head, tail: Buffer.from(tail), remainder },
  };
}

/** First line only, capped so a multi-megabyte rollout is not loaded for its header. */
export function readFirstLine(filePath: string, maxBytes = 65_536): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, 'r');
    const size = fstatSync(fd).size;
    const toRead = Math.min(size, maxBytes);
    if (toRead === 0) return '';
    const buf = Buffer.alloc(toRead);
    let offset = 0;
    while (offset < toRead) {
      const n = readSync(fd, buf, offset, toRead - offset, offset);
      if (n <= 0) break;
      offset += n;
      const nl = buf.subarray(0, offset).indexOf(0x0a);
      if (nl !== -1) return buf.subarray(0, nl).toString('utf8');
    }
    return buf.subarray(0, offset).toString('utf8');
  } catch (err) {
    logCaught('readFirstLine', err, filePath);
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Apply only new JSONL lines to `value`. A replaced file starts the fold over.
 * Returns null when the file cannot be read.
 */
export function foldAppendOnly<T>(
  filePath: string,
  cache: Map<string, FoldCache<T>>,
  create: () => T,
  applyLine: (value: T, line: string) => void,
): T | null {
  const cached = cache.get(filePath);
  const read = readIncremental(filePath, cached?.cursor);
  if (!read) {
    cache.delete(filePath);
    return null;
  }
  if (read.mode === 'unchanged') {
    if (cached && cached.cursor !== read.cursor) {
      cache.set(filePath, { cursor: read.cursor, value: cached.value });
    }
    return cached ? cached.value : null;
  }

  const value = read.mode === 'append' && cached ? cached.value : create();
  for (const line of read.lines) {
    if (!line) continue;
    applyLine(value, line);
  }
  cache.set(filePath, { cursor: read.cursor, value });
  return value;
}
