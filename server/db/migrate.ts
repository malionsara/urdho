import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { requireEnv } from '../env';
import { createDb } from './client';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

export async function runMigrations(url: string) {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

// `pnpm db:migrate`, also run by every Vercel build (`pnpm deploy:build`). On Neon, schema changes go
// through the direct connection (DATABASE_URL_UNPOOLED), not the connection pooler the app uses.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runMigrations(process.env.DATABASE_URL_UNPOOLED || requireEnv('DATABASE_URL'));
  console.log('Migrations applied.');
}
