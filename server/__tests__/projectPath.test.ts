import { describe, it, expect } from 'vitest';
import { resolveEncodedProjectPath, dirNameToPath } from '../utils/projectName';

const encoded = '-Users-alice-work-my-app';

describe('resolveEncodedProjectPath', () => {
  it('keeps a hyphenated folder name when that directory exists', () => {
    const exists = (path: string) => path === '/Users/alice/work-my-app';
    expect(resolveEncodedProjectPath(encoded, exists)).toBe('/Users/alice/work-my-app');
    expect(resolveEncodedProjectPath(encoded, exists)).not.toBe('/Users/alice/work/my/app');
  });

  it('finds work/my-app without splitting my-app into my/app', () => {
    const existing = new Set([
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
      '/Users/alice/Documents',
      '/Users/alice/Documents/my-app',
      '/Users/alice/Documents/my',
      '/Users/alice/Documents/my/app',
    ]);
    expect(resolveEncodedProjectPath(name, (path) => existing.has(path))).toBe('/Users/alice/Documents/my-app');
  });

  it('falls back to known parent folders and keeps a hyphenated tail when nothing exists', () => {
    const missing = () => false;
    expect(dirNameToPath('-Users-alice-Documents-GitHub-my-app', missing))
      .toBe('/Users/alice/Documents/GitHub/my-app');
    expect(dirNameToPath(encoded, missing)).toBe('/Users/alice/work-my-app');
    expect(dirNameToPath(encoded, missing)).not.toContain('/my/app');
  });
});
