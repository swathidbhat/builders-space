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
