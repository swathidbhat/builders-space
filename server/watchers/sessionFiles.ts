import { readdir } from 'fs/promises';
import { join, relative, sep } from 'path';
import { logCaught } from '../log';

/** Session logs the watchers read. Directories stay visible so recursion continues. */
export function isSessionFile(name: string, extensions: readonly string[]): boolean {
  return extensions.some((ext) => name.endsWith(ext));
}

/**
 * One directory tree, read off the Node thread.
 * Callers use this for the first scan and the slow fallback, not for every save.
 * A wide tree yields so the loop can serve a request during startup.
 */
export async function collectSessionFiles(
  root: string,
  extensions: readonly string[],
  label: string,
): Promise<string[]> {
  const files: string[] = [];
  await walk(root, extensions, files, label, { n: 0 });
  return files;
}

async function walk(
  dir: string,
  extensions: readonly string[],
  files: string[],
  label: string,
  progress: { n: number },
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    logCaught(label, err, `reading ${dir}`);
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    progress.n += 1;
    if (progress.n % 24 === 0) await new Promise((resolve) => setImmediate(resolve));
    if (entry.isDirectory()) await walk(fullPath, extensions, files, label, progress);
    else if (isSessionFile(entry.name, extensions)) files.push(fullPath);
  }
}

/** First path segment under `root`, used to rescan one project directory. */
export function topDir(root: string, filePath: string): string | null {
  const rel = relative(root, filePath);
  if (!rel || rel.startsWith('..') || rel === '') return null;
  const segment = rel.split(sep)[0];
  return segment || null;
}
