import { afterAll } from 'vitest';
import { createDb } from '../db/client';
import { diningTable, menuCategory, venue } from '../db/schema';
import { testDatabaseUrl } from './global-setup';

/** A Drizzle client on the test database, closed after the file's tests. */
export function connectTestDb() {
  const { db, pool } = createDb(testDatabaseUrl());
  afterAll(() => pool.end());
  return db;
}

type Db = ReturnType<typeof connectTestDb>;

let counter = 0;

/** A fresh venue with one table and one category, unique per call so tests never collide. */
export async function makeVenue(db: Db, name = 'Test') {
  const slug = `test-${Date.now().toString(36)}-${(counter++).toString(36)}`;
  const [v] = await db
    .insert(venue)
    .values({ name, slug, openingHours: [] })
    .returning({ id: venue.id });
  const [t] = await db
    .insert(diningTable)
    .values({ venueId: v!.id, number: 1, qrToken: `${slug}-t1` })
    .returning({ id: diningTable.id });
  const [c] = await db.insert(menuCategory).values({ venueId: v!.id }).returning({ id: menuCategory.id });
  return { venueId: v!.id, slug, tableId: t!.id, categoryId: c!.id };
}

/** Postgres error codes the constraints raise. */
export const PG = {
  foreignKey: '23503',
  unique: '23505',
  check: '23514',
  invalidEnum: '22P02',
} as const;

/** Runs a query that must fail, and returns the Postgres error code it failed with. */
export async function errorCode(query: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await query;
  } catch (error) {
    // Drizzle wraps driver errors; the Postgres code sits on the cause.
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  throw new Error('Expected the query to fail, but it succeeded');
}
