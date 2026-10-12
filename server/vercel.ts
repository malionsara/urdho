import { attachDatabasePool, waitUntil } from '@vercel/functions';
import { sendTelegram, serverErrorAlerts, telegramConfig } from './alerts';
import { createApp } from './app';
import { getDatabase } from './db/default';
import { requireEnv } from './env';
import { blobStorage } from './photos';

/*
 * The API as one Vercel Function. `pnpm build` bundles this file into server/dist/vercel.js, which
 * api/index.js hands to Vercel; vercel.json sends every /api/* request there.
 */

const { db, pool } = getDatabase();
// Closes idle database connections before Vercel suspends the function, so none are left dangling.
attachDatabasePool(pool);

// Photos must go to Vercel Blob here: a function's disk is read-only and forgets everything.
const storage = blobStorage(requireEnv('BLOB_READ_WRITE_TOKEN'));
const telegram = telegramConfig();
// The address guests use (urdho.al): Vercel sets it to the project's shortest production domain.
const siteHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const app = createApp({
  db,
  storage,
  guestSecret: requireEnv('GUEST_SESSION_SECRET'),
  operatorToken: process.env.OPERATOR_TOKEN || undefined,
  // Bugs go to the team's Telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID); waitUntil sends after the response.
  onUnexpectedError: serverErrorAlerts(telegram, { defer: waitUntil }),
  // The scheduled jobs (vercel.json "crons"), which Vercel calls with CRON_SECRET.
  cronSecret: process.env.CRON_SECRET || undefined,
  notify: telegram && ((text) => sendTelegram(telegram, text)),
  // The morning health check goes through the public address, like a guest's phone.
  healthCheck: siteHost ? { baseUrl: `https://${siteHost}`, site: true } : undefined,
});

export default { fetch: (request: Request) => app.fetch(request) };
