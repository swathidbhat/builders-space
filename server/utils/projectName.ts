import { existsSync, statSync } from 'fs';
import { logCaught } from '../log';

/**
 * Converts Cursor/Claude Code encoded directory names to human-readable project names.
 *
 * "Users-alice-Documents-GitHub-infinity-canvas" -> "infinity-canvas"
 */
export function extractProjectName(dirName: string): string {
  const cleaned = dirName.startsWith('-') ? dirName.slice(1) : dirName;

  const knownParents = ['Users', 'Documents', 'GitHub', 'CODE', 'Downloads', 'Desktop', 'home'];
  const userRoots = ['Users', 'home'];

  const segments = cleaned.split('-');
  let lastKnownIdx = -1;

  for (let i = 0; i < segments.length; i++) {
    if (knownParents.includes(segments[i])) {
      lastKnownIdx = i;

      if (
        userRoots.includes(segments[i]) &&
        i + 1 < segments.length &&
        !knownParents.includes(segments[i + 1])
      ) {
        lastKnownIdx = i + 1;
        i++;
      }
    }
  }

  if (lastKnownIdx >= 0 && lastKnownIdx < segments.length - 1) {
    return segments.slice(lastKnownIdx + 1).join('-');
  }

  return segments[segments.length - 1];
}

export type PathExists = (path: string) => boolean;

function directoryExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch (err) {
    logCaught('projectPath', err, path);
    return false;
  }
}

/**
 * Decode a Claude/Cursor project directory name.
 *
 * Those tools replace `/` with `-`, so `my-app` and a real slash are ambiguous.
 * When a candidate exists on disk, prefer the longest directory name at each
 * step. That keeps `my-app` intact instead of turning it into `my/app`, and
 * still finds `/Users/alice/work/my-app` when `work-my-app` is not a directory.
 * If nothing exists, fall back to splitting only well-known parent folder names
 * and leaving the rest hyphenated.
 *
 * Callers that have a session `cwd` should use that and not this decoder.
 */
export function resolveEncodedProjectPath(
  dirName: string,
  exists: PathExists = directoryExists,
): string {
  const probed = probeEncodedPath(dirName, exists);
  if (probed) return probed;
  return legacyDirNameToPath(dirName);
}

/** @deprecated Prefer resolveEncodedProjectPath. Kept as the name watchers used. */
export function dirNameToPath(dirName: string, exists?: PathExists): string {
  return resolveEncodedProjectPath(dirName, exists);
}

function probeEncodedPath(dirName: string, exists: PathExists): string | null {
  const cleaned = dirName.startsWith('-') ? dirName.slice(1) : dirName;
  const segments = cleaned.split('-').filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  let parent = '';
  let index = 0;
  if ((segments[0] === 'Users' || segments[0] === 'home') && segments.length >= 2) {
    parent = `/${segments[0]}/${segments[1]}`;
    index = 2;
  } else {
    return null;
  }

  const resolved = resolveRemainder(parent, segments.slice(index), exists);
  if (resolved && exists(resolved)) return resolved;
  return null;
}

function resolveRemainder(parent: string, segments: string[], exists: PathExists): string | null {
  if (segments.length === 0) return exists(parent) ? parent : null;

  for (let len = segments.length; len >= 1; len--) {
    const name = segments.slice(0, len).join('-');
    const candidate = `${parent}/${name}`;
    if (!exists(candidate)) continue;
    if (len === segments.length) return candidate;
    const rest = resolveRemainder(candidate, segments.slice(len), exists);
    if (rest) return rest;
  }
  return null;
}

function legacyDirNameToPath(dirName: string): string {
  const cleaned = dirName.startsWith('-') ? dirName.slice(1) : dirName;

  const pathRoots = ['Users', 'home'];
  const pathDirs = ['Documents', 'GitHub', 'CODE', 'Downloads', 'Desktop'];

  const segments = cleaned.split('-');
  const pathParts: string[] = [];
  let i = 0;

  while (i < segments.length) {
    const seg = segments[i];

    if (pathRoots.includes(seg) || pathDirs.includes(seg)) {
      pathParts.push(seg);
      i++;
    } else if (i === 1 && pathRoots.includes(segments[0])) {
      pathParts.push(seg);
      i++;
    } else {
      pathParts.push(segments.slice(i).join('-'));
      break;
    }
  }

  return '/' + pathParts.join('/');
}
