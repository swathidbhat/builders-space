import { describe, expect, it } from 'vitest';
import { projectKey } from '../projectKey';

describe('projectKey', () => {
  it('keeps case on Linux and folds it on macOS and Windows', () => {
    expect(projectKey('/tmp/CaseApp', 'linux')).toBe('/tmp/CaseApp');
    expect(projectKey('/tmp/caseapp', 'linux')).toBe('/tmp/caseapp');
    expect(projectKey('/tmp/CaseApp/', 'linux')).toBe('/tmp/CaseApp');
    expect(projectKey('/tmp/CaseApp', 'darwin')).toBe('/tmp/caseapp');
    expect(projectKey('/tmp/CaseApp', 'win32')).toBe('/tmp/caseapp');
  });
});
