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
writeFileSync(
  join(claudeDir, 'sess-checkout.jsonl'),
  [
    JSON.stringify({
      type: 'user',
      sessionId: 'sess-checkout',
      cwd: project,
      timestamp: now,
      slug: 'lumen-lab',
      message: { role: 'user', content: 'verify the stripe webhook signature' },
    }),
    JSON.stringify({
      type: 'assistant',
      sessionId: 'sess-checkout',
      cwd: project,
      timestamp: now,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Checking the signature helper.' }],
      },
    }),
  ].join('\n') + '\n',
);

const eventsDir = join(home, '.builders-space', 'events');
mkdirSync(eventsDir, { recursive: true, mode: 0o700 });
writeFileSync(
  join(eventsDir, 'status-checkout.json'),
  JSON.stringify({
    hook_event_name: 'Stop',
    status: 'error',
    error_message:
      'TypeError: Cannot read properties of undefined (reading "signature") at verifyStripeSignature (src/webhooks/stripe.ts:42:17)',
    session_id: 'sess-checkout',
    cwd: project,
    source: 'claude',
  }),
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
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env,
  stdio: 'inherit',
});
const tokenPath = join(home, '.builders-space', 'auth-token');

for (let i = 0; i < 100 && !existsSync(tokenPath); i++) {
  await delay(100);
}
if (!existsSync(tokenPath)) {
  console.error('e2e server did not publish a launch token');
  server.kill('SIGTERM');
  process.exit(1);
}

const runtimePath = join(process.cwd(), 'e2e', '.runtime.json');

function writeRuntime(pid) {
  writeFileSync(runtimePath, JSON.stringify({ home, pid }));
}

writeRuntime(server.pid);

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
// The restart test kills the API on purpose. Vite has to stay up so the page can
// re-read the new launch token without a manual reload.
server.on('exit', () => {
  writeRuntime(null);
});
client.on('exit', (code) => {
  if (code) process.exit(code ?? 1);
});
