import { chmodSync, existsSync, mkdirSync } from 'fs';
import { logCaught } from '../../log';
import { appDir, backupsDir, eventsDir, hooksDir } from './paths';

export function ensureAppDirs(): void {
  for (const dir of [appDir(), hooksDir(), eventsDir(), backupsDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(dir, 0o700);
    } catch (err) {
      logCaught('hookSetup', err, `chmod ${dir}`);
    }
  }
}
