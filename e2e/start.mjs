import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const home = mkdtempSync(join(tmpdir(), 'bs-e2e-'));
const now = new Date().toISOString();
const project = '/tmp/lumen-lab';

const claudeDir = join(home, '.claude', 'projects', '-tmp-lumen-lab');
mkdirSync(claudeDir, { recursive: true });
writeFileSync(
  join(claudeDir, 'sess.jsonl'),
  [
    JSON.stringify({
      type: 'user',
      sessionId: 'sess-lumen',
      cwd: project,
      timestamp: now,
      slug: 'lumen-lab',
      message: { role: 'user', content: 'paint the dashboard' },
    }),
    JSON.stringify({
      type: 'assistant',
      sessionId: 'sess-lumen',
      cwd: project,
      timestamp: now,
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/lumen-lab/src/App.tsx' } },
        ],
      },
    }),
  ].join('\n') + '\n',
);

const cursorDir = join(
  home,
  '.cursor',
  'projects',
  '-tmp-lumen-lab',
  'agent-transcripts',
  'agent-lumen',
);
mkdirSync(cursorDir, { recursive: true });
writeFileSync(
  join(cursorDir, 'agent-lumen.jsonl'),
  [
    JSON.stringify({
      role: 'user',
      cwd: project,
      message: { content: [{ type: 'text', text: 'add the status HUD' }] },
    }),
    JSON.stringify({
      role: 'assistant',
      message: { content: [{ type: 'text', text: 'Updated the HUD counters.' }] },
    }),
  ].join('\n') + '\n',
);

const codexDir = join(home, '.codex', 'sessions', '2026', '10', '11');
mkdirSync(codexDir, { recursive: true });
writeFileSync(
  join(codexDir, 'rollout-2026-10-11T01-00-00-lumen.jsonl'),
  [
    JSON.stringify({
      timestamp: now,
      type: 'session_meta',
      payload: { id: 'codex-lumen', cwd: project },
    }),
    JSON.stringify({
      timestamp: now,
      type: 'event_msg',
      payload: { type: 'user_message', message: 'check the tests' },
    }),
    JSON.stringify({
      timestamp: now,
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: 'npm test' }),
      },
    }),
  ].join('\n') + '\n',
);

const env = { ...process.env, HOME: home };
const server = spawn('npx', ['tsx', 'server/index.ts'], { env, stdio: 'inherit' });
const tokenPath = join(home, '.builders-space', 'auth-token');

for (let i = 0; i < 100 && !existsSync(tokenPath); i++) {
  await delay(100);
}
if (!existsSync(tokenPath)) {
  console.error('e2e server did not publish a launch token');
  server.kill('SIGTERM');
  process.exit(1);
}

const client = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
  env,
  stdio: 'inherit',
});

function shutdown() {
  server.kill('SIGTERM');
  client.kill('SIGTERM');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
server.on('exit', (code) => {
  if (code) process.exit(code ?? 1);
});
client.on('exit', (code) => {
  if (code) process.exit(code ?? 1);
});
