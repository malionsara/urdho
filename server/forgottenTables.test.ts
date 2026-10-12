import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { diningTable, guestOrder, menuItem, orderItem, serviceCall, tableSession } from './db/schema';
import { closeForgottenTables, FORGOTTEN_TABLE_HOURS } from './forgottenTables';
import { pilotStats } from './repos/operator';
import { connectTestDb, makeVenue } from './test/db';

const db = connectTestDb();
const ago = (minutes: number) => sql`now() - make_interval(mins => ${minutes})`;
const IDLE = FORGOTTEN_TABLE_HOURS * 60;

type TestVenue = Awaited<ReturnType<typeof makeVenue>>;

/** Table `number` of the venue (table 1 comes with it), with a session opened `openedAgo` minutes ago. */
async function openTable(v: TestVenue, number: number, openedAgo: number) {
  let tableId = v.tableId;
  if (number !== 1) {
    const [t] = await db.insert(diningTable).values({ venueId: v.venueId, number, qrToken: `${v.slug}-t${number}` }).returning({ id: diningTable.id });
    tableId = t!.id;
  }
  const [s] = await db.insert(tableSession).values({ venueId: v.venueId, tableId, tokenHash: randomUUID(), openedAt: ago(openedAgo) }).returning({ id: tableSession.id });
  return { tableId, sessionId: s!.id };
}

/** An order of two 300 L dishes, placed and last moved on the board the given minutes ago. */
async function orderAt(v: TestVenue, sessionId: string, placedAgo: number, movedAgo = placedAgo, status: 'served' | 'cancelled' = 'served') {
  const [dish] = await db.insert(menuItem).values({ venueId: v.venueId, categoryId: v.categoryId, priceLek: 300 }).returning({ id: menuItem.id });
  const [order] = await db
    .insert(guestOrder)
    .values({ venueId: v.venueId, sessionId, clientRef: randomUUID(), status, createdAt: ago(placedAgo), statusChangedAt: ago(movedAgo) })
    .returning({ id: guestOrder.id });
  await db.insert(orderItem).values({ venueId: v.venueId, orderId: order!.id, itemId: dish!.id, itemName: { sq: 'Byrek' }, position: 0, qty: 2, unitPriceLek: 300 });
}

const statusOf = async (sessionId: string) => (await db.select({ status: tableSession.status }).from(tableSession).where(eq(tableSession.id, sessionId)))[0]?.status;

describe('the nightly close of forgotten tables', () => {
  it(`closes a table untouched for ${FORGOTTEN_TABLE_HOURS} hours and reports its unpaid bill`, async () => {
    const v = await makeVenue(db, 'Kafe Harruar');
    const { sessionId } = await openTable(v, 1, 300);
    await orderAt(v, sessionId, 280, IDLE + 10);

    const result = await closeForgottenTables(db);
    expect(await statusOf(sessionId)).toBe('closed');
    expect(result.unpaid.find((u) => u.venue === 'Kafe Harruar')).toEqual({ venue: 'Kafe Harruar', tables: [{ tableNumber: 1, billLek: 600 }] });

    // The morning summary names it, on the service day the table opened.
    const stats = (await pilotStats(db, 2)).venues.find((s) => s.venue.id === v.venueId);
    expect(stats?.leftOpen).toEqual([{ tableNumber: 1, billLek: 600 }]);
  });

  it('leaves tables alone while anything happened there lately: a scan, an order, the kitchen, a call', async () => {
    const v = await makeVenue(db, 'Busy');
    const scanned = await openTable(v, 1, IDLE - 10);
    const ordered = await openTable(v, 2, 300);
    await orderAt(v, ordered.sessionId, IDLE - 10);
    const cooking = await openTable(v, 3, 300);
    await orderAt(v, cooking.sessionId, 280, 30);
    const calling = await openTable(v, 4, 300);
    await orderAt(v, calling.sessionId, 280);
    await db.insert(serviceCall).values({ venueId: v.venueId, sessionId: calling.sessionId, tableId: calling.tableId, createdAt: ago(20) });

    await closeForgottenTables(db);
    for (const t of [scanned, ordered, cooking, calling]) expect(await statusOf(t.sessionId)).toBe('open');
  });

  it("closes tables where nobody ordered, or every order was cancelled, without reporting a bill", async () => {
    const v = await makeVenue(db, 'Quiet');
    const scanned = await openTable(v, 1, IDLE + 10);
    const cancelled = await openTable(v, 2, 300);
    await orderAt(v, cancelled.sessionId, 280, 250, 'cancelled');

    const result = await closeForgottenTables(db);
    expect(await statusOf(scanned.sessionId)).toBe('closed');
    expect(await statusOf(cancelled.sessionId)).toBe('closed');
    expect(result.unpaid.find((u) => u.venue === 'Quiet')).toBeUndefined();
    expect((await pilotStats(db, 2)).venues.find((s) => s.venue.id === v.venueId)?.leftOpen).toEqual([]);
  });

  it('answers the forgotten call, and finds nothing more to do when run again', async () => {
    const v = await makeVenue(db, 'Twice');
    const { sessionId, tableId } = await openTable(v, 1, 300);
    await db.insert(serviceCall).values({ venueId: v.venueId, sessionId, tableId, createdAt: ago(IDLE + 5) });

    expect((await closeForgottenTables(db)).closed).toBeGreaterThanOrEqual(1);
    const [call] = await db.select({ acknowledgedAt: serviceCall.acknowledgedAt }).from(serviceCall).where(eq(serviceCall.sessionId, sessionId));
    expect(call?.acknowledgedAt).not.toBeNull();
    expect(await closeForgottenTables(db)).toEqual({ closed: 0, unpaid: [] });
  });
});
