import { HEALTH_CHECK_SLUG } from '../shared/schemas';
import type { Db } from './db/client';
import { venue } from './db/schema';
import { deleteExpiredStaffSessions, deleteOldLoginFailures, deleteOldOrders, forgetGuestDetails } from './repos/retention';

/*
 * How long Urdho keeps what, as the privacy notice says (docs/privacy-notice.html). Vercel runs
 * applyRetention every night after the service day ends (vercel.json "crons", /api/cron/retention).
 * Change a period here and deploy; the next night's run applies it.
 */
export const RETENTION = {
  /** The name a guest typed for the order, and the note to the kitchen. */
  guestDetailsDays: 90,
  /** Orders and their lines, for the venue's own history. */
  orderMonths: 24,
  /** The health check's own orders (urdho-check): only today's run matters. */
  healthCheckOrderDays: 7,
};

export interface RetentionResult {
  venues: number;
  guestDetailsCleared: number;
  ordersDeleted: number;
  staffSessionsDeleted: number;
  loginFailuresDeleted: number;
}

/** One pass over every venue. Safe to run again: a second run the same night finds nothing. */
export async function applyRetention(db: Db): Promise<RetentionResult> {
  const venues = await db.select({ id: venue.id, slug: venue.slug }).from(venue);
  const result: RetentionResult = { venues: venues.length, guestDetailsCleared: 0, ordersDeleted: 0, staffSessionsDeleted: 0, loginFailuresDeleted: 0 };
  // Venue by venue, each step one statement: a failure midway leaves every venue consistent, and
  // the next night's run picks up where this one stopped.
  for (const v of venues) {
    result.guestDetailsCleared += await forgetGuestDetails(db, v.id, RETENTION.guestDetailsDays);
    result.ordersDeleted += await deleteOldOrders(db, v.id, v.slug === HEALTH_CHECK_SLUG ? { days: RETENTION.healthCheckOrderDays } : { months: RETENTION.orderMonths });
    result.staffSessionsDeleted += await deleteExpiredStaffSessions(db, v.id);
  }
  result.loginFailuresDeleted = await deleteOldLoginFailures(db);
  return result;
}
