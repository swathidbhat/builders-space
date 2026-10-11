import { existsSync, readFileSync } from 'fs';
import { logCaught } from '../../log';
import { fileHasOurHook } from './match';
import { fireHookScript, statusHookScript } from './paths';
import type { ToolStatus } from './types';

export function statusFromToolDir(toolDir: string, configFiles: string[]): ToolStatus {
  if (!existsSync(toolDir)) return 'not_installed';
  if (!existsSync(statusHookScript()) && !existsSync(fireHookScript())) return 'available';

  for (const filePath of configFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      if (fileHasOurHook(content)) return 'configured';
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') logCaught('hookSetup', err, filePath);
    }
  }

  return 'available';
}
