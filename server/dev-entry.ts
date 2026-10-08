import { createApp } from './app';
import { getDb } from './db/default';

/** Loaded by the Vite dev server (vite.config.ts), which hands it every /api request. */
export default createApp({ db: getDb() });
