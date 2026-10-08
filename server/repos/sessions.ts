import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { GuestVenue } from '../../shared/types';
import { guestSessionToken, newQrToken, sha256 } from '../auth/crypto';
import type { Db } from '../db/client';
import { diningTable, guestOrder, serviceCall, tableSession, venue } from '../db/schema';
import { isUniqueViolation } from '../http';

/*
 * Tables and their sessions. A session groups everything ordered at a table until staff close it.
 * Every function takes venueId first, except findTableByCode: a scan is how the venue becomes known.
 */

/** A session nobody ordered or called in closes itself after this long (spec: 2 hours). */
const EMPTY_SESSION_HOURS = 2;

export interface ScannedTable {
  venue: GuestVenue & { timezone: string; openingHours: (typeof venue.$inferSelect)['openingHours'] };
  table: { id: string; number: number };
}

/** Resolves a QR code. The code only opens its own venue's table: slug and token must match. */
export async function findTableByCode(db: Db, slug: string, qrToken: string): Promise<ScannedTable | undefined> {
  const [row] = await db
    .select({
      venue: {
        id: venue.id,
        slug: venue.slug,
        name: venue.name,
        logoUrl: venue.logoUrl,
        coverUrl: venue.coverUrl,
        brandColor: venue.brandColor,
        languages: venue.languages,
        defaultLanguage: venue.defaultLanguage,
        timezone: venue.timezone,
        openingHours: venue.openingHours,
      },
      table: { id: diningTable.id, number: diningTable.number },
    })
    .from(diningTable)
    .innerJoin(venue, eq(venue.id, diningTable.venueId))
    .where(and(eq(venue.slug, slug), eq(diningTable.qrToken, qrToken), eq(venue.status, 'active')));
  return row;
}

/**
 * Joins the table's open session, or opens one. Everyone who scans the same table gets the same
 * token, derived from the session id with the server secret.
 */
export async function openOrJoinSession(db: Db, venueId: string, tableId: string, secret: string): Promise<{ sessionId: string; token: string }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [open] = await tx
          .select({
            id: tableSession.id,
            stale: sql<boolean>`${tableSession.openedAt} < now() - ${sql.raw(`interval '${EMPTY_SESSION_HOURS} hours'`)}
              AND NOT EXISTS (SELECT 1 FROM ${guestOrder} WHERE ${guestOrder.sessionId} = ${tableSession.id})
              AND NOT EXISTS (SELECT 1 FROM ${serviceCall} WHERE ${serviceCall.sessionId} = ${tableSession.id})`,
          })
          .from(tableSession)
          .where(and(eq(tableSession.venueId, venueId), eq(tableSession.tableId, tableId), eq(tableSession.status, 'open')))
          .for('update');

        if (open && !open.stale) return { sessionId: open.id, token: guestSessionToken(secret, open.id) };
        if (open) {
          await tx.update(tableSession).set({ status: 'closed', closedAt: sql`now()` }).where(eq(tableSession.id, open.id));
        }
        const id = randomUUID();
        const token = guestSessionToken(secret, id);
        await tx.insert(tableSession).values({ id, venueId, tableId, tokenHash: sha256(token) });
        return { sessionId: id, token };
      });
    } catch (error) {
      // Two phones scanned the same table at the same moment and both tried to open a session:
      // the database let one win; the other joins it on the second try.
      if (attempt === 0 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
}

/** The session behind a guest's cookie, if it belongs to this table. */
export async function findGuestSession(db: Db, venueId: string, tableId: string, token: string) {
  const [row] = await db
    .select({ id: tableSession.id, status: tableSession.status })
    .from(tableSession)
    .where(and(eq(tableSession.venueId, venueId), eq(tableSession.tableId, tableId), eq(tableSession.tokenHash, sha256(token))));
  return row;
}

/* QR codes ------------------------------------------------------------------ */

export async function listQrTables(db: Db, venueId: string) {
  return db
    .select({ id: diningTable.id, number: diningTable.number, label: diningTable.label, qrToken: diningTable.qrToken })
    .from(diningTable)
    .where(eq(diningTable.venueId, venueId))
    .orderBy(asc(diningTable.number));
}

export async function addTable(db: Db, venueId: string) {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ number: sql<number>`coalesce(max(${diningTable.number}) + 1, 1)` })
      .from(diningTable)
      .where(eq(diningTable.venueId, venueId));
    const [row] = await tx
      .insert(diningTable)
      .values({ venueId, number: next!.number, qrToken: newQrToken() })
      .returning({ id: diningTable.id, number: diningTable.number, label: diningTable.label, qrToken: diningTable.qrToken });
    return row!;
  });
}

/** A new code for a table: printed cards with the old one stop working at once. */
export async function resetQrToken(db: Db, venueId: string, tableId: string) {
  const [row] = await db
    .update(diningTable)
    .set({ qrToken: newQrToken() })
    .where(and(eq(diningTable.venueId, venueId), eq(diningTable.id, tableId)))
    .returning({ id: diningTable.id, number: diningTable.number, label: diningTable.label, qrToken: diningTable.qrToken });
  return row;
}
