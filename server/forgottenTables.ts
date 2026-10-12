import type { Db } from './db/client';
import { venue } from './db/schema';
import { closeForgottenSessions, type ForgottenTable } from './repos/orders';

/*
 * Tables staff forgot to mark paid. Vercel runs this every night after the bars close (vercel.json
 * "crons", /api/cron/close-tables): any table untouched for FORGOTTEN_TABLE_HOURS closes, so the
 * next guests start a new bill. Bills still unpaid show up in the morning summary.
 */
export const FORGOTTEN_TABLE_HOURS = 2;

export interface ForgottenTablesResult {
  closed: number;
  /** Bills that were never marked paid, per venue. */
  unpaid: { venue: string; tables: ForgottenTable[] }[];
}

/** One pass over every venue. A second run finds nothing more to close. */
export async function closeForgottenTables(db: Db): Promise<ForgottenTablesResult> {
  const venues = await db.select({ id: venue.id, name: venue.name }).from(venue);
  const result: ForgottenTablesResult = { closed: 0, unpaid: [] };
  for (const v of venues) {
    const { closed, unpaid } = await closeForgottenSessions(db, v.id, FORGOTTEN_TABLE_HOURS);
    result.closed += closed;
    if (unpaid.length > 0) result.unpaid.push({ venue: v.name, tables: unpaid });
  }
  return result;
}
