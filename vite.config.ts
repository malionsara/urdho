import { fileURLToPath } from 'node:url';
import devServer from '@hono/vite-dev-server';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [
    react(),
    // In development the API runs inside Vite: /api/* goes to Hono, everything else to the web app.
    devServer({
      entry: fileURLToPath(new URL('./server/dev-entry.ts', import.meta.url)),
      exclude: [/^(?!\/api(\/|$)).*/],
      injectClientScript: false,
    }),
  ],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
});
