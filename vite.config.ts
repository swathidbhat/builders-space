import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 5174 is claimed by another local project. `strictPort` makes a clash
    // fail loudly instead of silently landing on the next free port, which
    // otherwise leaves the preview pane pointed at whatever owns 5175.
    port: 5175,
    strictPort: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true,
      },
    },
  },
});
