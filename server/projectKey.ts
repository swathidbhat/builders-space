import { platform } from 'os';

/**
 * Identity for a project directory.
 * Linux paths are case-sensitive, so /tmp/CaseApp and /tmp/caseapp stay apart.
 * macOS and Windows fold case, because those filesystems do.
 */
export function projectKey(path: string, osPlatform: NodeJS.Platform = platform()): string {
  const stripped = path.replace(/\/+$/, '');
  const key = stripped.length > 0 ? stripped : '/';
  if (osPlatform === 'darwin' || osPlatform === 'win32') return key.toLowerCase();
  return key;
}
