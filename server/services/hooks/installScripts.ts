import { chmodSync, writeFileSync } from 'fs';
import { fireHookScript, statusHookScript } from './paths';
import { FIRE_HOOK_SCRIPT_CONTENT, STATUS_HOOK_SCRIPT_CONTENT } from './scripts';

export function installHookScripts(): void {
  writeFileSync(fireHookScript(), FIRE_HOOK_SCRIPT_CONTENT, { mode: 0o755 });
  chmodSync(fireHookScript(), 0o755);
  writeFileSync(statusHookScript(), STATUS_HOOK_SCRIPT_CONTENT, { mode: 0o755 });
  chmodSync(statusHookScript(), 0o755);
}
