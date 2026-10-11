import { and, eq, inArray, lt, ne, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { guestOrder, loginFailure, staffSession, tableSession } from '../db/schema';

/*
 * Deleting what the privacy notice says isn't kept (server/retention.ts runs these every night).
 * Every function takes venueId first, except failed sign-ins, which belong to no venue.
 *
 * Orders are deleted with their lines (the foreign keys cascade). The table visit they belonged
 * to stays, with its payment totals and waiter calls: none of those hold anything about a
 * person, and payments only ever change through the payment provider.
 */

const ago = (unit: 'days' | 'months', n: number) => sql`now() - make_interval(${sql.raw(unit)} => ${n})`;

/** Clears the guest's name and note on orders older than `days`. Returns how many orders changed. */
export async function forgetGuestDetails(db: Db, venueId: string, days: number): Promise<number> {
  const rows = await db
    .update(guestOrder)
    .set({ guestName: '', note: '' })
    .where(and(eq(guestOrder.venueId, venueId), lt(guestOrder.createdAt, ago('days', days)), or(ne(guestOrder.guestName, ''), ne(guestOrder.note, ''))))
    .returning({ id: guestOrder.id });
  return rows.length;
}

/** Deletes orders older than the given age from tables that have since been paid or closed. */
export async function deleteOldOrders(db: Db, venueId: string, olderThan: { days?: number; months?: number }): Promise<number> {
  const cutoff = olderThan.months !== undefined ? ago('months', olderThan.months) : ago('days', olderThan.days ?? 0);
  const closedSessions = db
    .select({ id: tableSession.id })
    .from(tableSession)
    .where(and(eq(tableSession.venueId, venueId), eq(tableSession.status, 'closed')));
  const rows = await db
    .delete(guestOrder)
    .where(and(eq(guestOrder.venueId, venueId), lt(guestOrder.createdAt, cutoff), inArray(guestOrder.sessionId, closedSessions)))
    .returning({ id: guestOrder.id });
  return rows.length;
}

/** Sign-ins that have run out (they last 30 days): the device would be asked to sign in again anyway. */
export async function deleteExpiredStaffSessions(db: Db, venueId: string): Promise<number> {
  const rows = await db
    .delete(staffSession)
    .where(and(eq(staffSession.venueId, venueId), lt(staffSession.expiresAt, sql`now()`)))
    .returning({ id: staffSession.id });
  return rows.length;
}

/** Failed sign-ins older than a day. Each sign-in attempt clears them too; this catches quiet days. */
export async function deleteOldLoginFailures(db: Db): Promise<number> {
  const rows = await db.delete(loginFailure).where(lt(loginFailure.createdAt, ago('days', 1))).returning({ id: loginFailure.id });
  return rows.length;
}
