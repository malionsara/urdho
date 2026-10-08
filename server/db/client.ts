import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

/** One connection pool and the Drizzle client on top of it. The same driver serves Docker and Neon. */
export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
