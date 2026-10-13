import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { CLIENT_PORT } from './shared/config.ts';
import { peerRejection } from './server/peerUser.ts';
import { slimThreePlugin } from './vite/slimThreePlugin.ts';

function readLaunchToken(): string {
  const tokenPath = path.join(homedir(), '.builders-space', 'auth-token');
  if (!existsSync(tokenPath)) return '';
  return readFileSync(tokenPath, 'utf-8').trim();
}

/** Inject the per-launch token into the dashboard page. Not served as its own URL. */
function buildersAuthPlugin(): Plugin {
  return {
    name: 'builders-space-auth',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const deny = (error: string) => {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error }));
        };
        if (!req.socket) {
          deny('Peer user not allowed');
          return;
        }
        void peerRejection(req.socket).then(
          (rejection) => {
            if (!rejection) {
              next();
              return;
            }
            deny(rejection);
          },
          () => deny('Peer user not allowed'),
        );
      });
    },
    async transformIndexHtml(html) {
      const started = Date.now();
      let token = readLaunchToken();
      while (!token && Date.now() - started < 3000) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        token = readLaunchToken();
      }
      const tag = `<script>window.__BUILDERS_SPACE_TOKEN__=${JSON.stringify(token)};</script>`;
      return html.replace('</head>', `  ${tag}\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), slimThreePlugin(), buildersAuthPlugin()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-core',
              test: /node_modules[\\/]three[\\/]build[\\/]three\.core/,
              priority: 30,
              includeDependenciesRecursively: false,
            },
            {
              name: 'three-renderer',
              test: /node_modules[\\/]three[\\/]build[\\/]three\.module/,
              priority: 30,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  optimizeDeps: {
    rolldownOptions: {
      plugins: [slimThreePlugin()],
    },
  },
  server: {
    host: '127.0.0.1',
    port: CLIENT_PORT,
    cors: false,
  },
});
