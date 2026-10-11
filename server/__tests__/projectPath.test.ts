import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { resolveEncodedProjectPath, dirNameToPath, extractProjectName } from '../utils/projectName';

const encoded = '-Users-alice-work-my-app';

describe('resolveEncodedProjectPath', () => {
  it('keeps a hyphenated folder name when that directory exists', () => {
    const exists = (path: string) =>
      path === '/Users' || path === '/Users/alice' || path === '/Users/alice/work-my-app';
    expect(resolveEncodedProjectPath(encoded, exists)).toBe('/Users/alice/work-my-app');
    expect(resolveEncodedProjectPath(encoded, exists)).not.toBe('/Users/alice/work/my/app');
  });

  it('finds work/my-app without splitting my-app into my/app', () => {
    const existing = new Set([
      '/Users',
      '/Users/alice',
      '/Users/alice/work',
      '/Users/alice/work/my-app',
      '/Users/alice/work/my',
      '/Users/alice/work/my/app',
    ]);
    const resolved = resolveEncodedProjectPath(encoded, (path) => existing.has(path));
    expect(resolved).toBe('/Users/alice/work/my-app');
  });

  it('does not turn Documents/my-app into Documents/my/app when both exist', () => {
    const name = '-Users-alice-Documents-my-app';
    const existing = new Set([
      '/Users',
      '/Users/alice',
      '/Users/alice/Documents',
      '/Users/alice/Documents/my-app',
      '/Users/alice/Documents/my',
      '/Users/alice/Documents/my/app',
    ]);
    expect(resolveEncodedProjectPath(name, (path) => existing.has(path))).toBe(
      '/Users/alice/Documents/my-app',
    );
  });

  it('falls back to known parent folders and keeps a hyphenated tail when nothing exists', () => {
    const missing = () => false;
    expect(dirNameToPath('-Users-alice-Documents-GitHub-my-app', missing)).toBe(
      '/Users/alice/Documents/GitHub/my-app',
    );
    expect(dirNameToPath(encoded, missing)).toBe('/Users/alice/work-my-app');
    expect(dirNameToPath(encoded, missing)).not.toContain('/my/app');
  });

  it('resolves /opt, /tmp, and /Volumes when those directories exist', () => {
    const opt = new Set(['/opt', '/opt/work', '/opt/work/my-app']);
    expect(resolveEncodedProjectPath('-opt-work-my-app', (path) => opt.has(path))).toBe(
      '/opt/work/my-app',
    );

    const tmp = new Set(['/tmp', '/tmp/lumen-lab']);
    expect(resolveEncodedProjectPath('-tmp-lumen-lab', (path) => tmp.has(path))).toBe(
      '/tmp/lumen-lab',
    );

    const volumes = new Set(['/Volumes', '/Volumes/DevDisk', '/Volumes/DevDisk/my-app']);
    expect(resolveEncodedProjectPath('-Volumes-DevDisk-my-app', (path) => volumes.has(path))).toBe(
      '/Volumes/DevDisk/my-app',
    );
  });

  it('keeps the hyphenated fallback when the search finds no directory', () => {
    const missing = () => false;
    expect(resolveEncodedProjectPath('-opt-work-my-app', missing)).toBe('/opt-work-my-app');
    expect(resolveEncodedProjectPath('-tmp-lumen-lab', missing)).toBe('/tmp-lumen-lab');
  });

  it('resolves a real directory created under /tmp', () => {
    const dir = mkdtempSync(join('/tmp', 'bs-path-'));
    try {
      const encoded = `-${dir.slice(1).replaceAll('/', '-')}`;
      expect(resolveEncodedProjectPath(encoded)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extractProjectName', () => {
  it('keeps the tail after known parent folders and a username', () => {
    expect(extractProjectName('-Users-alice-Documents-GitHub-infinity-canvas')).toBe(
      'infinity-canvas',
    );
    expect(extractProjectName('home-ada-CODE-widgets')).toBe('widgets');
    expect(extractProjectName('just-a-name')).toBe('name');
    expect(extractProjectName('-Downloads')).toBe('Downloads');
  });

  it('uses the real filesystem when no exists callback is passed', () => {
    expect(resolveEncodedProjectPath('-Users-nobody-missing-project-xyz')).toMatch(/^\//);
  });
});
