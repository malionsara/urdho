import { createApp } from './app';
import { getDb } from './db/default';
import { requireEnv } from './env';
import { storageFromEnv } from './photos';

/** Loaded by the Vite dev server (vite.config.ts), which hands it every /api request. */
export default createApp({ db: getDb(), storage: storageFromEnv(), guestSecret: requireEnv('GUEST_SESSION_SECRET') });
