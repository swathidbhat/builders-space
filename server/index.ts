import { loadLocalEnv } from './loadEnv';
import { usableAnthropicKey } from './anthropicKey';
import { createBuildersServer, PORT } from './createServer';
import { logCaught } from './log';

loadLocalEnv();

const runtime = createBuildersServer({ startWatchers: true, publishToken: true });

runtime
  .listen(PORT, ['127.0.0.1', '::1'])
  .then((port) => {
    console.log(`\n  Builders Space server running on http://127.0.0.1:${port}`);
    console.log(`  IPv6 loopback: http://[::1]:${port} (when that address is available)`);
    console.log(`  Socket.IO: ws://127.0.0.1:${port}\n`);
    if (!usableAnthropicKey()) {
      console.warn(
        '  ANTHROPIC_API_KEY is missing or still the example placeholder — humanizer will use basic fallback. Add a real key to .env\n',
      );
    }
  })
  .catch((err) => {
    logCaught('server', err, 'failed to listen');
    process.exit(1);
  });

function shutdown() {
  void runtime.close().finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
