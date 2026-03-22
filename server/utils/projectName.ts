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

      if (userRoots.includes(segments[i]) && i + 1 < segments.length && !knownParents.includes(segments[i + 1])) {
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

/**
 * Reconstructs filesystem path from encoded directory name.
 */
export function dirNameToPath(dirName: string): string {
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
