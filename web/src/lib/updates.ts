/*
 * After a deploy, a device that opened Urdho before may still run the previous version (the offline
 * cache serves it), and that version's code files are gone from the site. When one fails to load,
 * the app fetches the new version and reloads: at most once a minute, so a real outage can't turn
 * into a reload loop.
 */

const RELOADED_AT = 'urdho-reloaded-at';
let reloading = false;

/** A code or style file loaded on demand didn't arrive. Each browser words it differently. */
export function isMissingFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|Failed to load module script/i.test(message);
}

/** Whether a reload may happen now; remembers it when it may. */
function mayReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    return true;
  } catch {
    // Without storage we can't tell a first try from a loop: leave it to the reload button.
    return false;
  }
}

/**
 * Gets the new version and reloads. Returns false when that isn't allowed right now (a reload
 * just happened); the caller then shows the error instead.
 */
export function reloadForNewVersion(): boolean {
  if (reloading) return true;
  if (!mayReload()) return false;
  reloading = true;
  void (async () => {
    const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
    if (registration) {
      await registration.update().catch(() => undefined);
      const incoming = registration.installing ?? registration.waiting;
      if (incoming) {
        const takeOver = new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        // Versions built before skipWaiting was switched on wait for this message to take over.
        const nudge = () => incoming.state === 'installed' && incoming.postMessage({ type: 'SKIP_WAITING' });
        nudge();
        incoming.addEventListener('statechange', nudge);
        await Promise.race([takeOver, new Promise((resolve) => setTimeout(resolve, 10_000))]);
      }
    }
    location.reload();
  })();
  return true;
}
