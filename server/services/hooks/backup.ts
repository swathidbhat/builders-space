import { copyFileSync } from 'fs';
import { join } from 'path';
import { backupsDir } from './paths';

export function backupFile(filePath: string, backupName: string): void {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(backupsDir(), `${ts}_${backupName}`);
  copyFileSync(filePath, dest);
}
