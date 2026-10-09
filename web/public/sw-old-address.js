/*
 * Urdho moved from urdho.vercel.app to urdho.al, and the old address now redirects everything except
 * the offline worker's own files (vercel.json). A device that saved the app at the old address keeps
 * opening its offline copy, which can no longer reach the API there. sw.js imports this file first
 * (vite.config.ts): at the old address only, the new worker skips the usual setup, removes itself
 * and its caches, and reloads its open pages, which then follow the redirect to urdho.al.
 */
if (self.location.hostname === 'urdho.vercel.app') {
  self.addEventListener('install', (event) => {
    // Nothing to cache here; the rest of sw.js would try and fail on the redirected files.
    event.stopImmediatePropagation();
    self.skipWaiting();
  });
  self.addEventListener('activate', (event) => {
    event.stopImmediatePropagation();
    event.waitUntil(
      (async () => {
        await self.registration.unregister();
        await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
        const pages = await self.clients.matchAll({ type: 'window' });
        await Promise.all(pages.map((page) => page.navigate(page.url).catch(() => undefined)));
      })(),
    );
  });
  // Requests go straight to the network, and so to the redirect.
  self.addEventListener('fetch', (event) => event.stopImmediatePropagation());
}
