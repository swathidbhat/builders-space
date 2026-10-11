import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';

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
  plugins: [react(), buildersAuthPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    cors: false,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:3002',
        ws: true,
      },
    },
  },
});
