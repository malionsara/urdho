import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

/**
 * Neon's addresses say sslmode=require. pg 8 already checks the server certificate fully for that;
 * pg 9 will weaken "require" to the libpq meaning. Asking for verify-full keeps the full check either way.
 */
export function withFullCertificateCheck(url: string): string {
  const parsed = new URL(url);
  const mode = parsed.searchParams.get('sslmode');
  if (mode === 'prefer' || mode === 'require' || mode === 'verify-ca') parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}

/** One connection pool and the Drizzle client on top of it. The same driver serves Docker and Neon. */
export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: withFullCertificateCheck(url), max: 10 });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
