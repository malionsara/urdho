import { requireEnv } from '../env';
import { createDb, type Db } from './client';

let shared: Db | undefined;

/** The app's database, from DATABASE_URL. One pool per process, reused across requests. */
export function getDb(): Db {
  shared ??= createDb(requireEnv('DATABASE_URL')).db;
  return shared;
}
