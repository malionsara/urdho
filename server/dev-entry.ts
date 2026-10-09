import { createApp } from './app';
import { getDatabase } from './db/default';
import { requireEnv } from './env';
import { storageFromEnv } from './photos';

/** Loaded by the Vite dev server (vite.config.ts), which hands it every /api request. */
export default createApp({
  db: getDatabase().db,
  storage: storageFromEnv(),
  guestSecret: requireEnv('GUEST_SESSION_SECRET'),
  operatorToken: process.env.OPERATOR_TOKEN || undefined,
});
