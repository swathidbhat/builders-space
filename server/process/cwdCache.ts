import { PROCESS_REFRESH_MS } from '../../shared/config';
import { runningCwds, sameCwdSet } from './runningCwds';

/**
 * Background process-list snapshot. `current()` is synchronous so a file scan
 * never waits on `ps` or `lsof`.
 */
export class CwdCache {
  private cwds = new Set<string>();
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly needle: string,
    private readonly onUpdate: () => void,
  ) {}

  current(): Set<string> {
    return this.cwds;
  }

  start(): void {
    this.stop();
    const generation = this.generation;
    const tick = () => {
      void runningCwds(this.needle)
        .then((next) => {
          if (generation !== this.generation) return;
          if (sameCwdSet(this.cwds, next)) return;
          this.cwds = next;
          this.onUpdate();
        })
        .catch(() => {
          // runningCwds already logs ps failures and returns an empty set.
        });
    };
    tick();
    this.timer = setInterval(tick, PROCESS_REFRESH_MS);
    this.timer.unref?.();
  }

  stop(): void {
    this.generation += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
