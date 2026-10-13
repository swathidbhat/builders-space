import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function listeners(): number[] {
  try {
    const out = execFileSync('lsof', ['-t', '-iTCP:3002', '-sTCP:LISTEN'], { encoding: 'utf8' });
    return out
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function stop(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

/** The disconnect test replaces the API. Stop that process so 3002 is free. */
export default async function globalTeardown(): Promise<void> {
  try {
    const runtime = JSON.parse(readFileSync('e2e/.runtime.json', 'utf8')) as {
      pid?: number | null;
    };
    if (runtime.pid) stop(runtime.pid);
  } catch {
    // no runtime file
  }
  for (const pid of listeners()) stop(pid);

  const deadline = Date.now() + 2_000;
  while (listeners().length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const left = listeners();
  if (left.length > 0) {
    throw new Error(`API still listening on 3002 after e2e (pid ${left.join(', ')})`);
  }
}
