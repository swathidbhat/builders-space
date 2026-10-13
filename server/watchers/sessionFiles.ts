import { readdirSync } from 'fs';
import { join, relative, sep } from 'path';
import { logCaught } from '../log';

/** Session logs the watchers read. Directories stay visible so recursion continues. */
export function isSessionFile(name: string, extensions: readonly string[]): boolean {
  return extensions.some((ext) => name.endsWith(ext));
}

/** One directory tree. Callers use this for the first scan and the slow fallback, not for every save. */
export function collectSessionFiles(
  root: string,
  extensions: readonly string[],
  label: string,
): string[] {
  const files: string[] = [];
  walk(root, extensions, files, label);
  return files;
}

function walk(dir: string, extensions: readonly string[], files: string[], label: string): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    logCaught(label, err, `reading ${dir}`);
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, extensions, files, label);
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
