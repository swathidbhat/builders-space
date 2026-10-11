import { execFile } from 'child_process';
import { PROCESS_SCAN_TIMEOUT_MS } from '../../shared/config';
import { logCaught } from '../log';

const MAX_PIDS = 64;

export function pidsMatching(psOutput: string, needle: string, limit = MAX_PIDS): string[] {
  const pids: string[] = [];
  for (const line of psOutput.split('\n')) {
    if (!line.includes(needle) || line.includes('grep')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const pid = parts[1];
    if (!/^\d+$/.test(pid)) continue;
    pids.push(pid);
    if (pids.length >= limit) break;
  }
  return pids;
}

/** First cwd path from `lsof -Fn` output. */
export function cwdFromLsof(output: string): string | null {
  for (const line of output.split('\n')) {
    if (!line.startsWith('n/')) continue;
    const path = line.slice(1).replace(/\/+$/, '');
    return path || null;
  }
  return null;
}

/**
 * Workspace paths and pids mentioned on `ps` lines for Cursor.
 * The editor often keeps the project on its command line (`cursor /path`,
 * `--folder-uri file:///path`) rather than as the process cwd.
 */
export function cursorPathsFromPs(psOutput: string): { pids: string[]; paths: string[] } {
  const pids: string[] = [];
  const paths: string[] = [];
  for (const line of psOutput.split('\n')) {
    if (!/cursor/i.test(line) || line.includes('grep')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const pid = parts[1];
    if (/^\d+$/.test(pid) && pids.length < MAX_PIDS) pids.push(pid);
    for (const token of parts) {
      const path = workspacePathToken(token);
      if (path) paths.push(path);
    }
  }
  return { pids, paths };
}

function workspacePathToken(token: string): string | null {
  let value = token.replace(/^['"]|['"]$/g, '');
  if (value.startsWith('file://')) {
    try {
      value = decodeURIComponent(value.slice('file://'.length));
    } catch {
      return null;
    }
  }
  if (!value.startsWith('/')) return null;
  if (value.includes('.app/')) return null;
  if (/\/cursor$/i.test(value)) return null;
  if (value.includes('node_modules')) return null;
  const stripped = value.replace(/\/+$/, '');
  return stripped.length > 0 ? stripped : null;
}

export function sameCwdSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function execText(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: PROCESS_SCAN_TIMEOUT_MS, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

/**
 * Directories a Cursor process is working in: cwd from lsof, plus workspace
 * paths on the command line. There is no per-chat process the way `claude` has.
 */
export async function cursorLiveCwds(): Promise<Set<string>> {
  let psOutput: string;
  try {
    psOutput = await execText('ps', ['aux']);
  } catch (err) {
    logCaught('process', err, 'ps aux');
    return new Set();
  }

  const { pids, paths } = cursorPathsFromPs(psOutput);
  const cwds = new Set(paths);
  await Promise.all(
    pids.map(async (pid) => {
      try {
        const output = await execText('lsof', ['-p', pid, '-a', '-d', 'cwd', '-Fn']);
        const cwd = cwdFromLsof(output);
        if (cwd) cwds.add(cwd);
      } catch {
        // The process exited, or lsof has no cwd to report.
      }
    }),
  );
  return cwds;
}

/**
 * Working directories of processes whose command line contains `needle`.
 * `ps` and `lsof` run asynchronously and time out; the scan path only reads the result.
 */
export async function runningCwds(needle: string): Promise<Set<string>> {
  const cwds = new Set<string>();
  let psOutput: string;
  try {
    psOutput = await execText('ps', ['aux']);
  } catch (err) {
    logCaught('process', err, 'ps aux');
    return cwds;
  }

  await Promise.all(
    pidsMatching(psOutput, needle).map(async (pid) => {
      try {
        const output = await execText('lsof', ['-p', pid, '-a', '-d', 'cwd', '-Fn']);
        const cwd = cwdFromLsof(output);
        if (cwd) cwds.add(cwd);
      } catch {
        // The process exited, or lsof has no cwd to report.
      }
    }),
  );
  return cwds;
}
