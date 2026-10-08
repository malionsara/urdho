import { randomUUID } from 'node:crypto';
import { and, count, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { DEMO_SLUG, SEED_TABLES } from '../../shared/demo';
import { errorCode, makeVenue, PG, connectTestDb } from '../test/db';
import {
  diningTable,
  guestOrder,
  menuCategory,
  menuItem,
  optionGroup,
  orderItem,
  serviceCall,
  staffUser,
  tableSession,
  translation,
  venue,
} from './schema';
import { hidePublicTableCodes, seedDemoVenue } from './seed';

const db = connectTestDb();

const openSession = (venueId: string, tableId: string) =>
  db.insert(tableSession).values({ venueId, tableId, tokenHash: randomUUID() }).returning({ id: tableSession.id });

const dish = (venueId: string, categoryId: string, priceLek = 500) =>
  db.insert(menuItem).values({ venueId, categoryId, priceLek }).returning({ id: menuItem.id });

describe('tenancy, enforced by the database itself', () => {
  it("won't file a dish under another venue's category", async () => {
    const a = await makeVenue(db, 'A');
    const b = await makeVenue(db, 'B');
    expect(await errorCode(dish(b.venueId, a.categoryId))).toBe(PG.foreignKey);
  });

  it("won't hang an option group off another venue's dish", async () => {
    const a = await makeVenue(db, 'A');
    const b = await makeVenue(db, 'B');
    const [aDish] = await dish(a.venueId, a.categoryId);
    expect(await errorCode(db.insert(optionGroup).values({ venueId: b.venueId, itemId: aDish!.id }))).toBe(PG.foreignKey);
  });

  it("won't put an order into another venue's table session", async () => {
    const a = await makeVenue(db, 'A');
    const b = await makeVenue(db, 'B');
    const [aSession] = await openSession(a.venueId, a.tableId);
    expect(await errorCode(db.insert(guestOrder).values({ venueId: b.venueId, sessionId: aSession!.id, clientRef: 'x' }))).toBe(PG.foreignKey);
  });

  it("won't let an order line point at another venue's dish", async () => {
    const a = await makeVenue(db, 'A');
    const b = await makeVenue(db, 'B');
    const [aDish] = await dish(a.venueId, a.categoryId);
    const [bSession] = await openSession(b.venueId, b.tableId);
    const [bOrder] = await db.insert(guestOrder).values({ venueId: b.venueId, sessionId: bSession!.id, clientRef: 'x' }).returning({ id: guestOrder.id });
    expect(
      await errorCode(db.insert(orderItem).values({ venueId: b.venueId, orderId: bOrder!.id, itemId: aDish!.id, itemName: { sq: 'X' }, qty: 1, unitPriceLek: 100 })),
    ).toBe(PG.foreignKey);
  });

  it("won't ring a waiter call to another venue's table", async () => {
    const a = await makeVenue(db, 'A');
    const b = await makeVenue(db, 'B');
    const [bSession] = await openSession(b.venueId, b.tableId);
    expect(await errorCode(db.insert(serviceCall).values({ venueId: b.venueId, sessionId: bSession!.id, tableId: a.tableId }))).toBe(PG.foreignKey);
  });

  it('removes everything a venue owns when the venue is deleted, and nothing else', async () => {
    const a = await makeVenue(db, 'A');
    const b = await makeVenue(db, 'B');
    await dish(a.venueId, a.categoryId);
    await dish(b.venueId, b.categoryId);
    await db.delete(venue).where(eq(venue.id, a.venueId));
    const [aLeft] = await db.select({ n: count() }).from(menuItem).where(eq(menuItem.venueId, a.venueId));
    const [bLeft] = await db.select({ n: count() }).from(menuItem).where(eq(menuItem.venueId, b.venueId));
    expect(aLeft!.n).toBe(0);
    expect(bLeft!.n).toBe(1);
  });
});

describe('service rules', () => {
  it('keeps one open session per table; a new one can open after the last closes', async () => {
    const v = await makeVenue(db);
    const [first] = await openSession(v.venueId, v.tableId);
    expect(await errorCode(openSession(v.venueId, v.tableId))).toBe(PG.unique);

    await db.update(tableSession).set({ status: 'closed', closedAt: sql`now()` }).where(eq(tableSession.id, first!.id));
    await expect(openSession(v.venueId, v.tableId)).resolves.toHaveLength(1);
  });

  it('refuses a closed session without a closing time', async () => {
    const v = await makeVenue(db);
    const [s] = await openSession(v.venueId, v.tableId);
    expect(await errorCode(db.update(tableSession).set({ status: 'closed' }).where(eq(tableSession.id, s!.id)))).toBe(PG.check);
  });

  it('treats a retried order (same client_ref, same session) as a duplicate', async () => {
    const v = await makeVenue(db);
    const [s] = await openSession(v.venueId, v.tableId);
    const place = () => db.insert(guestOrder).values({ venueId: v.venueId, sessionId: s!.id, clientRef: 'phone-key-1' });
    await place();
    expect(await errorCode(place())).toBe(PG.unique);
  });

  it('keeps one unanswered waiter call per table session', async () => {
    const v = await makeVenue(db);
    const [s] = await openSession(v.venueId, v.tableId);
    const call = () => db.insert(serviceCall).values({ venueId: v.venueId, sessionId: s!.id, tableId: v.tableId });
    await call();
    expect(await errorCode(call())).toBe(PG.unique);

    await db.update(serviceCall).set({ acknowledgedAt: sql`now()` }).where(eq(serviceCall.sessionId, s!.id));
    await expect(call()).resolves.toBeDefined();
  });
});

describe('data rules', () => {
  it('refuses negative prices', async () => {
    const v = await makeVenue(db);
    expect(await errorCode(dish(v.venueId, v.categoryId, -100))).toBe(PG.check);
  });

  it('refuses a default language the venue does not offer', async () => {
    expect(
      await errorCode(db.insert(venue).values({ name: 'X', slug: `x-${Date.now()}`, openingHours: [], languages: ['en'], defaultLanguage: 'sq' })),
    ).toBe(PG.check);
  });

  it('only accepts the 14 EU allergen codes', async () => {
    const v = await makeVenue(db);
    const bogus = sql`'{milk,chocolate}'::allergen[]`;
    expect(await errorCode(db.execute(sql`insert into menu_item (venue_id, category_id, price_lek, allergens) values (${v.venueId}, ${v.categoryId}, 100, ${bogus})`))).toBe(
      PG.invalidEnum,
    );
  });

  it('refuses an option group that requires more choices than it allows', async () => {
    const v = await makeVenue(db);
    const [d] = await dish(v.venueId, v.categoryId);
    expect(await errorCode(db.insert(optionGroup).values({ venueId: v.venueId, itemId: d!.id, minSelect: 2, maxSelect: 1 }))).toBe(PG.check);
  });

  it('gives each email one staff account, whatever the capitalisation', async () => {
    const a = await makeVenue(db, 'A');
    const b = await makeVenue(db, 'B');
    const email = `arta-${Date.now()}@demo.al`;
    await db.insert(staffUser).values({ venueId: a.venueId, name: 'Arta', email, passwordHash: 'x', role: 'owner' });
    expect(
      await errorCode(db.insert(staffUser).values({ venueId: b.venueId, name: 'Arta', email: email.toUpperCase(), passwordHash: 'x', role: 'owner' })),
    ).toBe(PG.unique);
  });
});

describe('demo seed', () => {
  it('creates the demo venue with every dish named in Albanian and English, and replaces it when run again', async () => {
    await seedDemoVenue(db);
    const { venueId } = await seedDemoVenue(db);

    const venues = await db.select({ id: venue.id }).from(venue).where(eq(venue.slug, DEMO_SLUG));
    expect(venues).toEqual([{ id: venueId }]);

    const [categories] = await db.select({ n: count() }).from(menuCategory).where(eq(menuCategory.venueId, venueId));
    const items = await db.select({ id: menuItem.id }).from(menuItem).where(eq(menuItem.venueId, venueId));
    expect(categories!.n).toBe(3);
    expect(items).toHaveLength(12);

    const names = await db
      .select({ entityId: translation.entityId, lang: translation.lang })
      .from(translation)
      .where(and(eq(translation.venueId, venueId), eq(translation.entityType, 'menu_item'), eq(translation.field, 'name')));
    for (const { id } of items) {
      expect(names.filter((n) => n.entityId === id).map((n) => n.lang).sort()).toEqual(['en', 'sq']);
    }
  });

  it('keeps the public table codes on this machine, and replaces them with private ones elsewhere', async () => {
    const codes = async (venueId: string) =>
      (await db.select({ code: diningTable.qrToken }).from(diningTable).where(eq(diningTable.venueId, venueId))).map((t) => t.code);
    const isPublic = (code: string) => SEED_TABLES.some((t) => t.qrToken === code);

    const local = await seedDemoVenue(db);
    expect((await codes(local.venueId)).every(isPublic)).toBe(true);
    expect(await hidePublicTableCodes(db, local.venueId)).toBe(6);
    const replaced = await codes(local.venueId);
    expect(replaced.some(isPublic)).toBe(false);
    expect(await hidePublicTableCodes(db, local.venueId)).toBe(0);
    expect(await codes(local.venueId)).toEqual(replaced);

    const remote = await seedDemoVenue(db, { privateTableCodes: true });
    expect((await codes(remote.venueId)).some(isPublic)).toBe(false);
  });
});
