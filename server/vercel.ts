import { attachDatabasePool } from '@vercel/functions';
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
const app = createApp({ db, storage, guestSecret: requireEnv('GUEST_SESSION_SECRET') });

export default { fetch: (request: Request) => app.fetch(request) };
