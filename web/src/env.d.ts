/** The local demo staff password on `pnpm dev`; always empty in production builds (vite.config.ts). */
declare const __DEMO_STAFF_PASSWORD__: string;

interface Window {
  /** The guest menu request index.html starts before the app loads (see web/src/guest/api.ts). */
  __urdhoScan?: { url: string; response: Promise<Response> };
}
