import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { createBuildersServer, PORT } from './createServer';
import { logCaught } from './log';

const runtime = createBuildersServer({ startWatchers: true, publishToken: true });

runtime.listen(PORT, ['127.0.0.1', '::1']).then((port) => {
  console.log(`\n  Builders Space server running on http://127.0.0.1:${port}`);
  console.log(`  IPv6 loopback: http://[::1]:${port} (when that address is available)`);
  console.log(`  Socket.IO: ws://127.0.0.1:${port}\n`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  ANTHROPIC_API_KEY not set — humanizer will use basic fallback. Add it to .env\n');
  }
}).catch((err) => {
  logCaught('server', err, 'failed to listen');
  process.exit(1);
});

process.on('SIGINT', () => {
  void runtime.close().finally(() => process.exit(0));
});
