import { existsSync, readFileSync, writeFileSync } from 'fs';
import { logCaught } from '../../log';
import { manifestPath } from './paths';
import type { HookManifest } from './types';

const EMPTY_MANIFEST: HookManifest = { createdFiles: [], codexFeatureFlagAdded: false };

export function readManifest(): HookManifest {
  try {
    if (!existsSync(manifestPath())) return { ...EMPTY_MANIFEST, createdFiles: [] };
    const raw = JSON.parse(readFileSync(manifestPath(), 'utf-8')) as Partial<HookManifest>;
    return {
      createdFiles: Array.isArray(raw.createdFiles)
        ? raw.createdFiles.filter((entry): entry is string => typeof entry === 'string')
        : [],
      codexFeatureFlagAdded: Boolean(raw.codexFeatureFlagAdded),
    };
  } catch (err) {
    logCaught('hookSetup', err, 'reading hook manifest');
    return { ...EMPTY_MANIFEST, createdFiles: [] };
  }
}

export function writeManifest(manifest: HookManifest): void {
  writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
}

export function noteCreated(manifest: HookManifest, filePath: string): void {
  if (!manifest.createdFiles.includes(filePath)) manifest.createdFiles.push(filePath);
}
