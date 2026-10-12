import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
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

function ago(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const BILLING_TASK = 'migrate the payments dashboard off the legacy charge path';
const BILLING_QUESTION =
  'The old charge path still has callers in checkout, including the receipt mailer and the nightly reconciliation job. Should I delete it anyway, or keep it behind a flag until those callers move?';
const CURSOR_JSONL_QUESTION =
  'From the Cursor transcript: should the receipt mailer stay on the old charge path?';
const CURSOR_TXT_QUESTION = 'From the Cursor notes: keep the flag until checkout moves?';
const CODEX_QUESTION = 'From Codex: delete the legacy charge path, or leave the flag?';

function claudeProject(cwd, sessionId, task, iso, finished, reply) {
  const dirName = `-${cwd.replace(/^\//, '').replace(/\//g, '-')}`;
  const dir = join(home, '.claude', 'projects', dirName);
  mkdirSync(dir, { recursive: true });
  const assistant = finished
    ? { type: 'text', text: reply || 'Finished the pass.' }
    : { type: 'tool_use', name: 'Read', input: { file_path: `${cwd}/README.md` } };
  writeFileSync(
    join(dir, `${sessionId}.jsonl`),
    [
      JSON.stringify({
        type: 'user',
        sessionId,
        cwd,
        timestamp: iso,
        message: { role: 'user', content: task },
      }),
      JSON.stringify({
        type: 'assistant',
        sessionId,
        cwd,
        timestamp: iso,
        message: { role: 'assistant', content: [assistant] },
      }),
    ].join('\n') + '\n',
  );
}

const extraProjects = [
  {
    cwd: '/tmp/stripe-webhook-gateway-for-checkout-retries',
    sessionId: 'sess-stripe-gateway',
    task: 'retry checkout webhooks with a long project name',
    iso: ago(30),
    finished: true,
    error: 'Error: webhook secret missing',
  },
  {
    cwd: '/tmp/billing-question-backfill',
    sessionId: 'sess-billing',
    task: BILLING_TASK,
    iso: ago(14),
    finished: true,
    reply: BILLING_QUESTION,
  },
  {
    cwd: '/tmp/live-ingest-worker',
    sessionId: 'sess-ingest',
    task: 'tail the ingest worker logs',
    iso: now,
    finished: false,
  },
  {
    cwd: '/tmp/design-system-v2',
    sessionId: 'sess-design',
    task: 'publish the token update',
    iso: ago(180),
    finished: false,
  },
  {
    cwd: '/tmp/api-gateway',
    sessionId: 'sess-gateway',
    task: 'trace the gateway timeout',
    iso: now,
    finished: false,
  },
  {
    cwd: '/tmp/ml-pipeline-training-run',
    sessionId: 'sess-ml',
    task: 'check the training metrics',
    iso: ago(200),
    finished: false,
  },
  {
    cwd: '/tmp/old-blog',
    sessionId: 'sess-blog',
    task: 'archive the old posts',
    iso: ago(240),
    finished: true,
    reply: 'Should I delete the drafts, or keep them?',
  },
  {
    cwd: '/tmp/projects-side-quest-tracker-with-an-unreasonably-long-name',
    sessionId: 'sess-sidequest',
    task: 'Is the side quest list ready to ship?',
    iso: ago(20),
    finished: true,
  },
  {
    cwd: '/tmp/checkout-notifications',
    sessionId: 'sess-notify',
    task: 'send the receipt email',
    iso: now,
    finished: false,
  },
];

for (const extra of extraProjects) {
  claudeProject(extra.cwd, extra.sessionId, extra.task, extra.iso, extra.finished, extra.reply);
  if (extra.error) {
    writeFileSync(
      join(eventsDir, `status-${extra.sessionId}.json`),
      JSON.stringify({
        hook_event_name: 'Stop',
        status: 'error',
        error_message: extra.error,
        session_id: extra.sessionId,
        cwd: extra.cwd,
        source: 'claude',
      }),
    );
  }
}

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

const billingWhen = new Date(Date.now() - 12 * 60_000);
const billingCursor = join(
  home,
  '.cursor',
  'projects',
  '-tmp-billing-question-backfill',
  'agent-transcripts',
);
mkdirSync(join(billingCursor, 'billing-turn'), { recursive: true });
const billingJsonl = join(billingCursor, 'billing-turn', 'billing.jsonl');
writeFileSync(
  billingJsonl,
  [
    JSON.stringify({
      role: 'user',
      cwd: '/tmp/billing-question-backfill',
      message: { content: [{ type: 'text', text: BILLING_TASK }] },
    }),
    JSON.stringify({
      role: 'assistant',
      message: { content: [{ type: 'text', text: CURSOR_JSONL_QUESTION }] },
    }),
  ].join('\n') + '\n',
);
utimesSync(billingJsonl, billingWhen, billingWhen);
const billingTxt = join(billingCursor, 'billing.txt');
writeFileSync(billingTxt, `<user_query>\n${BILLING_TASK}\n</user_query>\n${CURSOR_TXT_QUESTION}\n`);
utimesSync(billingTxt, billingWhen, billingWhen);

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
const billingCodex = join(codexDir, 'rollout-2026-10-11T02-00-00-billing.jsonl');
writeFileSync(
  billingCodex,
  [
    JSON.stringify({
      timestamp: billingWhen.toISOString(),
      type: 'session_meta',
      payload: { id: 'codex-billing', cwd: '/tmp/billing-question-backfill' },
    }),
    JSON.stringify({
      timestamp: billingWhen.toISOString(),
      type: 'event_msg',
      payload: { type: 'user_message', message: BILLING_TASK },
    }),
    JSON.stringify({
      timestamp: billingWhen.toISOString(),
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: 'psql -c "select id from charges"' }),
      },
    }),
    JSON.stringify({
      timestamp: billingWhen.toISOString(),
      type: 'event_msg',
      payload: { type: 'agent_message', message: CODEX_QUESTION },
    }),
  ].join('\n') + '\n',
);
utimesSync(billingCodex, billingWhen, billingWhen);

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
  try {
    const current = JSON.parse(readFileSync(runtimePath, 'utf8'));
    if (current.pid) process.kill(current.pid, 'SIGTERM');
  } catch {
    // The API is already gone.
  }
  server.kill('SIGTERM');
  client.kill('SIGTERM');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
// The restart test kills the API on purpose. Vite has to stay up so the page can
// re-read the new launch token without a manual reload.
server.on('exit', () => {
  try {
    const current = JSON.parse(readFileSync(runtimePath, 'utf8'));
    if (current.pid === server.pid) writeRuntime(null);
  } catch {
    writeRuntime(null);
  }
});
client.on('exit', (code) => {
  if (code) process.exit(code ?? 1);
});
