import { watch, type FSWatcher } from 'chokidar';
import { logCaught } from '../log';
import { FALLBACK_SCAN_MS, MISSING_DIR_RETRY_MS, WATCH_DEBOUNCE_MS } from '../../shared/config';

export { FALLBACK_SCAN_MS, MISSING_DIR_RETRY_MS, WATCH_DEBOUNCE_MS };

export interface JsonlWatch {
  ready: Promise<void>;
  close: () => Promise<void>;
}

/**
 * Watch a directory tree for .jsonl files.
 * Chokidar v4 does not expand globs, so the root is a real directory and
 * non-jsonl files are ignored. Directories are never ignored, or recursion stops.
 */
export function watchJsonlTree(root: string, onSignal: () => void, label: string): JsonlWatch {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        onSignal();
      } catch (err) {
        logCaught(label, err, 'scan after file change');
      }
    }, WATCH_DEBOUNCE_MS);
  };

  const watcher: FSWatcher = watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    ignored: (filePath, stats) => Boolean(stats?.isFile() && !filePath.endsWith('.jsonl')),
  });

  watcher.on('add', schedule);
  watcher.on('change', schedule);
  watcher.on('unlink', schedule);
  watcher.on('error', (err) => logCaught(label, err, 'file watch error'));

  const ready = new Promise<void>((resolve) => {
    watcher.once('ready', () => resolve());
  });

  return {
    ready,
    async close() {
      if (timer) clearTimeout(timer);
      timer = null;
      await watcher.close();
    },
  };
}
