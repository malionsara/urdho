import { fileURLToPath } from 'node:url';
import devServer from '@hono/vite-dev-server';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => {
  const dev = command === 'serve';
  if (dev) {
    try {
      process.loadEnvFile();
    } catch {
      // No .env: the dashboard's one-tap demo sign-in is simply hidden.
    }
  }

  return {
    root: 'web',
    plugins: [
      react(),
      // In development the API runs inside Vite: /api/* goes to Hono, everything else to the web app.
      devServer({
        entry: fileURLToPath(new URL('./server/dev-entry.ts', import.meta.url)),
        exclude: [/^(?!\/api(\/|$)).*/],
        injectClientScript: false,
      }),
      VitePWA({
        // The install manifest is staff-only: web/public/staff.webmanifest, linked by the dashboard,
        // so guests are never offered to install the staff app.
        manifest: false,
        injectRegister: 'script-defer',
        // New versions take over on their own. The open page is not reloaded: a reload in the middle
        // of service would silence the order chime until someone taps "start service" again.
        registerType: 'autoUpdate',
        workbox: {
          // A new version takes over as soon as it has installed, open pages included. Without
          // these it waits until every tab of the app is closed, which on a staff tablet is never.
          skipWaiting: true,
          clientsClaim: true,
          // The guest app shell, for fast repeat visits on a weak connection. Fonts: Latin subsets
          // only. The staff dashboard stays out, so guests' phones never download it; staff devices
          // cache it the first time it loads (below).
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          globIgnores: ['**/*{cyrillic,greek,vietnamese}*', '**/StaffApp-*', '**/quick-start.html', '**/sw-old-address.js'],
          // Retires the offline copy on the old urdho.vercel.app address; does nothing anywhere else.
          importScripts: ['sw-old-address.js'],
          navigateFallback: '/index.html',
          // The API, and the printable staff sheet, which is a page of its own and not part of the app.
          navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/quick-start/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // Built files carry a content hash in their name, so a cached copy is never stale.
              urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
              handler: 'CacheFirst',
              options: { cacheName: 'assets', expiration: { maxEntries: 60 } },
            },
            {
              // Dish photos, logos and covers: file names change whenever the picture does.
              urlPattern: ({ request, url }) => request.destination === 'image' && !url.pathname.startsWith('/api/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    define: {
      // The local demo password, for one-tap demo sign-in on the dev server only. Production builds
      // get an empty string, so no password ever ships in the app.
      __DEMO_STAFF_PASSWORD__: JSON.stringify(dev ? (process.env.DEMO_STAFF_PASSWORD ?? '') : ''),
    },
    resolve: {
      alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
    },
    build: { outDir: '../dist', emptyOutDir: true },
    server: { port: Number(process.env.PORT) || 5173, strictPort: true },
  };
});
