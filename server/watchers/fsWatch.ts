import { watch, type FSWatcher } from 'chokidar';
import { logCaught } from '../log';
import { FALLBACK_SCAN_MS, MISSING_DIR_RETRY_MS, WATCH_DEBOUNCE_MS } from '../../shared/config';

export { FALLBACK_SCAN_MS, MISSING_DIR_RETRY_MS, WATCH_DEBOUNCE_MS };

export interface JsonlWatch {
  ready: Promise<void>;
  close: () => Promise<void>;
}

export interface FsChange {
  event: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
}

const SESSION_EXTENSIONS = ['.jsonl', '.txt'];

/**
 * Watch a directory tree for session logs.
 * Chokidar does not expand globs, so the root is a real directory and
 * unrelated files are ignored. Directories are never ignored, or recursion stops.
 * `.txt` is included because Cursor still parses those transcripts.
 * Directory add and remove are signals too, so a new project or a deleted one
 * does not wait for the fallback rescan.
 */
export function watchJsonlTree(
  root: string,
  onSignal: (changes: FsChange[]) => void,
  label: string,
): JsonlWatch {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let batch: FsChange[] = [];

  const schedule = (change: FsChange) => {
    batch.push(change);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const changes = batch;
      batch = [];
      try {
        onSignal(changes);
      } catch (err) {
        logCaught(label, err, 'scan after file change');
      }
    }, WATCH_DEBOUNCE_MS);
  };

  const watcher: FSWatcher = watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    ignored: (filePath, stats) =>
      Boolean(stats?.isFile() && !SESSION_EXTENSIONS.some((ext) => filePath.endsWith(ext))),
  });

  watcher.on('add', (filePath) => schedule({ event: 'add', path: filePath }));
  watcher.on('addDir', (filePath) => schedule({ event: 'addDir', path: filePath }));
  watcher.on('change', (filePath) => schedule({ event: 'change', path: filePath }));
  watcher.on('unlink', (filePath) => schedule({ event: 'unlink', path: filePath }));
  watcher.on('unlinkDir', (filePath) => schedule({ event: 'unlinkDir', path: filePath }));
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
