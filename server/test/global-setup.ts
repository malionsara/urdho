import pg from 'pg';
import { requireEnv } from '../env';
import { runMigrations } from '../db/migrate';
import { dropEverything } from '../db/reset';

/** Rebuilds the test database from the migrations once per `pnpm test` run. */
export default async function setup() {
  const url = testDatabaseUrl();
  await assertReachable(url);
  await dropEverything(url);
  await runMigrations(url);
}

export function testDatabaseUrl(): string {
  const url = requireEnv('TEST_DATABASE_URL');
  // The suite wipes this database: never let it point at real data.
  if (!new URL(url).pathname.endsWith('_test')) throw new Error(`TEST_DATABASE_URL must name a database ending in _test, got ${new URL(url).pathname}`);
  return url;
}

async function assertReachable(url: string) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
  } catch (error) {
    // A refused connection arrives with an empty message but a code, e.g. ECONNREFUSED.
    const reason = (error as NodeJS.ErrnoException).code ?? (error as Error).message;
    throw new Error(`Can't reach the test database at ${new URL(url).host} (${reason}). Start PostgreSQL with: pnpm db:up`, { cause: error });
  } finally {
    await client.end().catch(() => {});
  }
}
