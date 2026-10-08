import { requireEnv } from '../env';
import { createDb } from './client';

let shared: ReturnType<typeof createDb> | undefined;

/** The app's database and its connection pool, from DATABASE_URL. One per process, reused across requests. */
export function getDatabase() {
  shared ??= createDb(requireEnv('DATABASE_URL'));
  return shared;
}
