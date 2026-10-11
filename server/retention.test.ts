import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { diningTable, guestOrder, loginFailure, menuItem, orderItem, payment, staffSession, tableSession, venue } from './db/schema';
import { prepareHealthCheck } from './repos/operator';
import { applyRetention, RETENTION } from './retention';
import { makeVenueWithStaff } from './test/api';
import { connectTestDb, makeVenue } from './test/db';

const db = connectTestDb();

/** A table visit `age` ago, closed (paid) unless `open`, with one order of one line. */
async function visit(v: { venueId: string; tableId: string; categoryId: string }, age: string, { open = false, guestName = 'Arta', note = 'pa qepë' } = {}) {
  const at = sql`now() - ${age}::interval`;
  const [session] = await db
    .insert(tableSession)
    .values({ venueId: v.venueId, tableId: v.tableId, tokenHash: randomUUID(), status: open ? 'open' : 'closed', openedAt: at, closedAt: open ? null : at })
    .returning({ id: tableSession.id });
  const [dish] = await db.insert(menuItem).values({ venueId: v.venueId, categoryId: v.categoryId, priceLek: 300 }).returning({ id: menuItem.id });
  const [order] = await db
    .insert(guestOrder)
    .values({ venueId: v.venueId, sessionId: session!.id, clientRef: randomUUID(), guestName, note, createdAt: at })
    .returning({ id: guestOrder.id });
  await db.insert(orderItem).values({ venueId: v.venueId, orderId: order!.id, itemId: dish!.id, itemName: { sq: 'Byrek' }, position: 0, qty: 1, unitPriceLek: 300 });
  if (!open) await db.insert(payment).values({ venueId: v.venueId, sessionId: session!.id, method: 'cash', amountLek: 300, status: 'confirmed', confirmedAt: at });
  return { sessionId: session!.id, orderId: order!.id };
}

const orderRow = async (id: string) => (await db.select({ guestName: guestOrder.guestName, note: guestOrder.note }).from(guestOrder).where(eq(guestOrder.id, id)))[0];

describe('the nightly deletion', () => {
  it(`clears guests' names and notes after ${RETENTION.guestDetailsDays} days, and nothing else`, async () => {
    const v = await makeVenue(db, 'Names');
    const old = await visit(v, `${RETENTION.guestDetailsDays + 1} days`);
    const recent = await visit(v, `${RETENTION.guestDetailsDays - 1} days`);
    await applyRetention(db);
    expect(await orderRow(old.orderId)).toEqual({ guestName: '', note: '' });
    expect(await orderRow(recent.orderId)).toEqual({ guestName: 'Arta', note: 'pa qepë' });
    expect(await db.select().from(orderItem).where(eq(orderItem.orderId, old.orderId))).toHaveLength(1);
  });

  it(`deletes orders and their lines after ${RETENTION.orderMonths} months, keeping the visit and its payment`, async () => {
    const v = await makeVenue(db, 'Orders');
    const [secondTable] = await db.insert(diningTable).values({ venueId: v.venueId, number: 2, qrToken: `${v.slug}-t2` }).returning({ id: diningTable.id });
    const expired = await visit(v, `${RETENTION.orderMonths} months 1 day`);
    const stillOpen = await visit({ ...v, tableId: secondTable!.id }, `${RETENTION.orderMonths} months 1 day`, { open: true });
    const kept = await visit(v, `${RETENTION.orderMonths - 1} months`);
    await applyRetention(db);

    expect(await orderRow(expired.orderId)).toBeUndefined();
    expect(await db.select().from(orderItem).where(eq(orderItem.orderId, expired.orderId))).toEqual([]);
    expect(await db.select({ id: tableSession.id }).from(tableSession).where(eq(tableSession.id, expired.sessionId))).toHaveLength(1);
    expect(await db.select({ id: payment.id }).from(payment).where(eq(payment.sessionId, expired.sessionId))).toHaveLength(1);
    // A table still open is never touched, however old; nor is anything younger than the limit.
    expect(await orderRow(stillOpen.orderId)).toBeDefined();
    expect(await orderRow(kept.orderId)).toBeDefined();
  });

  it(`clears the health check's own orders after ${RETENTION.healthCheckOrderDays} days, not a restaurant's`, async () => {
    await prepareHealthCheck(db);
    const [check] = await db.select({ id: venue.id }).from(venue).where(eq(venue.slug, 'urdho-check'));
    const [checkTable] = await db.select({ id: diningTable.id }).from(diningTable).where(eq(diningTable.venueId, check!.id));
    const [checkItem] = await db.select({ categoryId: menuItem.categoryId }).from(menuItem).where(eq(menuItem.venueId, check!.id));
    const checkOrder = await visit({ venueId: check!.id, tableId: checkTable!.id, categoryId: checkItem!.categoryId }, `${RETENTION.healthCheckOrderDays + 1} days`);
    const restaurant = await makeVenue(db, 'Restaurant');
    const restaurantOrder = await visit(restaurant, `${RETENTION.healthCheckOrderDays + 1} days`);
    await applyRetention(db);
    expect(await orderRow(checkOrder.orderId)).toBeUndefined();
    expect(await orderRow(restaurantOrder.orderId)).toBeDefined();
  });

  it('removes sign-ins that have run out and failed sign-ins older than a day', async () => {
    const v = await makeVenueWithStaff(db, 'Sessions');
    const sessions = await db
      .insert(staffSession)
      .values([
        { venueId: v.venueId, staffUserId: v.owner.id, tokenHash: randomUUID(), expiresAt: sql`now() - interval '1 minute'` },
        { venueId: v.venueId, staffUserId: v.owner.id, tokenHash: randomUUID(), expiresAt: sql`now() + interval '29 days'` },
      ])
      .returning({ id: staffSession.id });
    const failures = await db
      .insert(loginFailure)
      .values([
        { email: 'old@example.test', ip: '203.0.113.9', createdAt: sql`now() - interval '25 hours'` },
        { email: 'new@example.test', ip: '203.0.113.9' },
      ])
      .returning({ id: loginFailure.id });
    await applyRetention(db);
    expect((await db.select({ id: staffSession.id }).from(staffSession).where(inArray(staffSession.id, sessions.map((s) => s.id)))).map((s) => s.id)).toEqual([sessions[1]!.id]);
    expect((await db.select({ id: loginFailure.id }).from(loginFailure).where(inArray(loginFailure.id, failures.map((f) => f.id)))).map((f) => f.id)).toEqual([failures[1]!.id]);
  });

  it('finds nothing more to do when run again the same night', async () => {
    const v = await makeVenue(db, 'Twice');
    await visit(v, `${RETENTION.orderMonths} months 1 day`);
    await visit(v, `${RETENTION.guestDetailsDays + 1} days`);
    const first = await applyRetention(db);
    expect(first.ordersDeleted).toBeGreaterThanOrEqual(1);
    expect(first.guestDetailsCleared).toBeGreaterThanOrEqual(1);
    expect(await applyRetention(db)).toMatchObject({ guestDetailsCleared: 0, ordersDeleted: 0, staffSessionsDeleted: 0, loginFailuresDeleted: 0 });
  });
});
