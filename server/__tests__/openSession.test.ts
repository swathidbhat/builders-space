import { mkdirSync, mkdtempSync, realpathSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect } from 'vitest';
import { buildOpenSessionCommand, runCommand } from '../openSession';
import type { AgentInfo } from '../types';

function agent(overrides: Partial<AgentInfo> & Pick<AgentInfo, 'source'>): AgentInfo {
  return {
    id: 'agent-1',
    sessionId: 'abc123',
    status: 'waiting',
    statusSource: 'inferred',
    ...overrides,
  };
}

describe('buildOpenSessionCommand', () => {
  it('passes a malicious directory only as an argv element, not inside the AppleScript source', () => {
    const parent = mkdtempSync(join(tmpdir(), 'bs-open-'));
    const evilName = 'proj" & (do shell script "id") & "';
    const evil = join(parent, evilName);
    mkdirSync(evil);
    const resolved = realpathSync(evil);

    const built = buildOpenSessionCommand(
      agent({
        source: 'claude-code',
        sessionId: 'abc123',
        status: 'waiting',
        sessionMeta: { projectPath: evil, cwd: evil, sessionId: 'abc123' },
      }),
    );

    expect('error' in built).toBe(false);
    if ('error' in built) return;
    expect(built.spec.file).toBe('osascript');
    const script = built.spec.args[1];
    expect(script).toContain('on run argv');
    expect(script).toContain('quoted form of dir');
    expect(script).not.toContain(evilName);
    expect(script).not.toContain('do shell script');
    expect(script).not.toContain(resolved);
    expect(built.spec.args).toEqual(['-e', script, '--', resolved, 'abc123']);
  });

  it('rejects a session id that could change the shell command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bs-open-'));
    const built = buildOpenSessionCommand(
      agent({
        source: 'codex',
        sessionId: 'abc; id',
        status: 'done',
        sessionMeta: { projectPath: dir, cwd: dir, sessionId: 'abc; id' },
      }),
    );
    expect(built).toEqual({ error: 'Invalid session id' });
  });

  it('opens Cursor with an argv array and does not interpolate the path into a shell string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bs-open-'));
    const resolved = realpathSync(dir);
    const built = buildOpenSessionCommand(
      agent({
        source: 'cursor',
        status: 'waiting',
        sessionMeta: { projectPath: `${dir}'; rm -rf /` },
      }),
    );
    expect(built).toEqual({ error: 'Project path is not an existing directory' });

    const ok = buildOpenSessionCommand(
      agent({
        source: 'cursor',
        status: 'waiting',
        sessionMeta: { projectPath: dir },
      }),
    );
    expect(ok).toEqual({
      resumed: false,
      spec: { file: 'open', args: ['-a', 'Cursor', '--', resolved] },
    });
  });

  it('runs a command from an argv list and rejects a failing one', async () => {
    await expect(runCommand('true', [])).resolves.toBeUndefined();
    await expect(runCommand('false', [])).rejects.toThrow();
  });
});
