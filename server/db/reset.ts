import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { isLocalDatabase, requireEnv } from '../env';
import { createDb } from './client';
import { runMigrations } from './migrate';
import { seedDemoVenue } from './seed';

/** Drops every table, type and migration record. Refuses anything but a database on this machine. */
export async function dropEverything(url: string) {
  if (!isLocalDatabase(url)) throw new Error(`Refusing to wipe ${new URL(url).hostname}: only local databases can be reset.`);
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await pool.end();
  }
}

// `pnpm db:reset`: a clean local database with the demo venue.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = requireEnv('DATABASE_URL');
  await dropEverything(url);
  await runMigrations(url);
  const { db, pool } = createDb(url);
  try {
    await seedDemoVenue(db);
  } finally {
    await pool.end();
  }
  console.log('Database reset: migrations applied and the demo venue seeded.');
}
