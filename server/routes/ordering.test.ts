import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { MenuItemInput } from '../../shared/schemas';
import { diningTable, guestOrder, payment, tableSession, venue } from '../db/schema';
import { ORDER_LIMIT } from '../repos/orders';
import { makeVenueWithStaff, testApi } from '../test/api';
import { connectTestDb } from '../test/db';

const db = connectTestDb();
const { app, call, login } = testApi(db);

const qofteInput = (categoryId: string): MenuItemInput => ({
  categoryId,
  name: { sq: 'Qofte të fshira', en: 'Qofte' },
  description: {},
  priceLek: 600,
  photoUrl: null,
  available: true,
  suggestInBasket: false,
  tags: [],
  allergens: [],
  optionGroups: [
    {
      name: { sq: 'Porcioni', en: 'Portion' },
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: { sq: '6 copë', en: '6 pieces' }, priceDeltaLek: 0, available: true },
        { name: { sq: '10 copë', en: '10 pieces' }, priceDeltaLek: 350, available: true },
      ],
    },
    {
      name: { sq: 'Shto', en: 'Add' },
      minSelect: 0,
      maxSelect: 2,
      options: [
        { name: { sq: 'Patate', en: 'Chips' }, priceDeltaLek: 200, available: true },
        { name: { sq: 'Pilaf', en: 'Rice' }, priceDeltaLek: 150, available: false },
      ],
    },
  ],
});

const byrekInput = (categoryId: string): MenuItemInput => ({
  ...qofteInput(categoryId),
  name: { sq: 'Byrek me spinaq', en: 'Spinach byrek' },
  priceLek: 250,
  optionGroups: [],
});

/** A venue with staff, a menu (qofte with options, byrek) and a second table. */
async function setup(label = 'A') {
  const v = await makeVenueWithStaff(db, label);
  const manager = (await login(v.manager.email)).cookie;
  const waiter = (await login(v.waiter.email)).cookie;
  const category = await call('POST', '/api/staff/menu/categories', { cookie: manager, body: { name: { sq: 'Gatime' } } });
  const categoryId = category.body?.category.id as string;
  const qofte = (await call('POST', '/api/staff/menu/items', { cookie: manager, body: qofteInput(categoryId) })).body?.item;
  const byrek = (await call('POST', '/api/staff/menu/items', { cookie: manager, body: byrekInput(categoryId) })).body?.item;
  const [table2] = await db.insert(diningTable).values({ venueId: v.venueId, number: 2, qrToken: `${v.slug}-t2` }).returning();
  return {
    ...v,
    manager,
    waiter,
    categoryId,
    qofte,
    byrek,
    table1: `/api/guest/${v.slug}/t/${v.slug}-t1`,
    table2: `/api/guest/${v.slug}/t/${table2!.qrToken}`,
    portion: { six: qofte.optionGroups[0].options[0].id, ten: qofte.optionGroups[0].options[1].id },
    extras: { chips: qofte.optionGroups[1].options[0].id, rice: qofte.optionGroups[1].options[1].id },
  };
}

/** A phone scanning a table: returns the cookie it keeps and the menu it shows. */
async function scan(tablePath: string) {
  const res = await call('POST', `${tablePath}/scan`);
  return { ...res, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

const order = (tablePath: string, cookie: string, lines: { itemId: string; qty: number; optionIds: string[] }[], extra: Record<string, unknown> = {}) =>
  call('POST', `${tablePath}/orders`, { cookie, body: { clientRef: randomUUID(), guestName: '', note: '', lines, ...extra } });

describe('every guest route except scanning needs the table session', () => {
  // Read from the app itself, so guest routes added later are covered too.
  const routes = [
    ...new Map(
      app.routes
        .filter((r) => r.method !== 'ALL' && r.path.startsWith('/api/guest/') && !r.path.endsWith('/scan'))
        .map((r) => [`${r.method} ${r.path}`, r]),
    ).values(),
  ];

  it('finds the guest routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(3);
  });

  it.each(routes.map((r) => [r.method, r.path]))('%s %s answers 401 without the session cookie', async (method, path) => {
    const v = await setup();
    const url = path.replace(':slug', v.slug).replace(':qrToken', `${v.slug}-t1`).replace(/:\w+/g, randomUUID());
    const res = await call(method, url, { body: method === 'GET' ? undefined : {} });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'no_session' } });
  });
});

describe('guests scanning a table', () => {
  it('get the menu and a cookie that only this table receives', async () => {
    const v = await setup();
    const res = await scan(v.table1);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ venue: { id: v.venueId, slug: v.slug }, table: { number: 1 }, orderingOpen: true });
    expect(res.body?.categories[0].items.map((i: { id: string }) => i.id)).toEqual([v.qofte.id, v.byrek.id]);
    expect(res.body?.venue).not.toHaveProperty('openingHours');

    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain(`Path=${v.table1}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('share one session with everyone else at the table', async () => {
    const v = await setup();
    const first = await scan(v.table1);
    const second = await scan(v.table1);
    expect(second.cookie).toBe(first.cookie);
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from table_session where venue_id = ${v.venueId}`)).rows as [{ n: number }];
    expect(n).toBe(1);
  });

  it('see sold-out dishes greyed out, but not hidden categories', async () => {
    const v = await setup();
    await call('PATCH', `/api/staff/menu/items/${v.byrek.id}/availability`, { cookie: v.manager, body: { available: false } });
    const menu = (await scan(v.table1)).body!;
    expect(menu.categories[0].items.find((i: { id: string }) => i.id === v.byrek.id).available).toBe(false);

    await call('PATCH', `/api/staff/menu/categories/${v.categoryId}`, { cookie: v.manager, body: { active: false } });
    expect((await scan(v.table1)).body?.categories).toEqual([]);
  });

  it('get "code no longer active" for an unknown code, or a code from another venue', async () => {
    const a = await setup('A');
    const b = await setup('B');
    expect((await call('POST', `/api/guest/${a.slug}/t/made-up/scan`)).body).toEqual({ error: { code: 'table_invalid' } });
    expect((await call('POST', `/api/guest/${a.slug}/t/${b.slug}-t1/scan`)).status).toBe(404);
  });
});

describe('guests ordering', () => {
  it('pay prices worked out by the server, with names copied onto the order', async () => {
    const v = await setup();
    const { cookie } = await scan(v.table1);
    const res = await order(v.table1, cookie, [
      // A price sent by the phone is ignored.
      { itemId: v.qofte.id, qty: 2, optionIds: [v.portion.ten, v.extras.chips], priceLek: 1 } as never,
      { itemId: v.byrek.id, qty: 1, optionIds: [] },
    ]);
    expect(res.status).toBe(201);

    const placed = (await call('GET', `${v.table1}/orders/${res.body?.orderId}`, { cookie })).body!;
    expect(placed.status).toBe('new');
    expect(placed.lines).toEqual([
      { itemName: { sq: 'Qofte të fshira', en: 'Qofte' }, optionNames: [{ sq: '10 copë', en: '10 pieces' }, { sq: 'Patate', en: 'Chips' }], qty: 2, lineTotalLek: 2300 },
      { itemName: { sq: 'Byrek me spinaq', en: 'Spinach byrek' }, optionNames: [], qty: 1, lineTotalLek: 250 },
    ]);
    expect(placed.totalLek).toBe(2550);
    expect(placed.sessionTotalLek).toBe(2550);
  });

  it('get the same order back when the phone retries, never a second one', async () => {
    const v = await setup();
    const { cookie } = await scan(v.table1);
    const body = { clientRef: 'phone-key-123', guestName: '', note: '', lines: [{ itemId: v.byrek.id, qty: 1, optionIds: [] }] };
    const first = await call('POST', `${v.table1}/orders`, { cookie, body });
    const retry = await call('POST', `${v.table1}/orders`, { cookie, body });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body?.orderId).toBe(first.body?.orderId);
    const orders = await db.select().from(guestOrder).where(eq(guestOrder.venueId, v.venueId));
    expect(orders).toHaveLength(1);
  });

  it('add every order at the table to one running bill', async () => {
    const v = await setup();
    const phone1 = await scan(v.table1);
    const phone2 = await scan(v.table1);
    await order(v.table1, phone1.cookie, [{ itemId: v.byrek.id, qty: 2, optionIds: [] }]);
    const second = await order(v.table1, phone2.cookie, [{ itemId: v.qofte.id, qty: 1, optionIds: [v.portion.six] }]);
    const placed = (await call('GET', `${v.table1}/orders/${second.body?.orderId}`, { cookie: phone2.cookie })).body!;
    expect(placed.totalLek).toBe(600);
    expect(placed.sessionTotalLek).toBe(1100);
  });

  it('are told when a dish sold out or left the menu since they opened it', async () => {
    const a = await setup('A');
    const b = await setup('B');
    const { cookie } = await scan(a.table1);
    await call('PATCH', `/api/staff/menu/items/${a.byrek.id}/availability`, { cookie: a.manager, body: { available: false } });
    const soldOut = await order(a.table1, cookie, [{ itemId: a.byrek.id, qty: 1, optionIds: [] }]);
    expect(soldOut.status).toBe(409);
    expect(soldOut.body).toEqual({ error: { code: 'menu_changed', details: { unavailable: [a.byrek.id] } } });

    const otherVenue = await order(a.table1, cookie, [{ itemId: b.byrek.id, qty: 1, optionIds: [] }]);
    expect(otherVenue.body?.error.details).toEqual({ unavailable: [b.byrek.id] });
  });

  it('must follow each option group: required choices, real options, nothing sold out', async () => {
    const v = await setup();
    const b = await setup('B');
    const { cookie } = await scan(v.table1);
    const codes = async (optionIds: string[]) =>
      (await order(v.table1, cookie, [{ itemId: v.qofte.id, qty: 1, optionIds }])).body?.error.details.map((d: { code: string }) => d.code);

    expect(await codes([])).toEqual(['too-few']);
    expect(await codes([v.portion.six, v.portion.ten])).toEqual(['too-many']);
    expect(await codes([v.portion.six, v.extras.rice])).toEqual(['unavailable']);
    expect(await codes([v.portion.six, b.portion.ten])).toEqual(['unknown_option']);
  });

  it('need the session from scanning this very table', async () => {
    const v = await setup();
    expect((await order(v.table1, '', [{ itemId: v.byrek.id, qty: 1, optionIds: [] }])).body).toEqual({ error: { code: 'no_session' } });
    const table1 = await scan(v.table1);
    // Browsers wouldn't send table 1's cookie to table 2's address; the server refuses it anyway.
    expect((await order(v.table2, table1.cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }])).status).toBe(401);
  });

  it("can read the menu but not order outside opening hours", async () => {
    const v = await setup();
    const closedAllWeek = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: false, from: '08:00', to: '23:00' }));
    await db.update(venue).set({ openingHours: closedAllWeek }).where(eq(venue.id, v.venueId));
    const scanned = await scan(v.table1);
    expect(scanned.body?.orderingOpen).toBe(false);
    expect((await order(v.table1, scanned.cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }])).body).toEqual({ error: { code: 'venue_closed' } });
  });

  it(`are limited to ${ORDER_LIMIT.orders} orders per table every ${ORDER_LIMIT.minutes} minutes`, async () => {
    const v = await setup();
    const { cookie } = await scan(v.table1);
    for (let i = 0; i < ORDER_LIMIT.orders; i++) {
      expect((await order(v.table1, cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }])).status).toBe(201);
    }
    expect((await order(v.table1, cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }])).body).toEqual({ error: { code: 'too_many_orders' } });
  });

  it('ring the waiter once, however often they tap', async () => {
    const v = await setup();
    const { cookie } = await scan(v.table1);
    expect((await call('POST', `${v.table1}/calls`, { cookie })).status).toBe(204);
    expect((await call('POST', `${v.table1}/calls`, { cookie })).status).toBe(204);
    const board = (await call('GET', '/api/staff/board', { cookie: v.waiter })).body!;
    expect(board.calls).toHaveLength(1);
    expect(board.calls[0]).toMatchObject({ tableNumber: 1 });
  });
});

describe('staff running service', () => {
  it('move orders along the board, and the guest sees each step', async () => {
    const v = await setup();
    const { cookie } = await scan(v.table1);
    const first = (await order(v.table1, cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }], { guestName: 'Arta', note: 'Pa kripë' })).body?.orderId;
    const second = (await order(v.table1, cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }])).body?.orderId;

    const board = (await call('GET', '/api/staff/board', { cookie: v.waiter })).body!;
    expect(board.orders.map((o: { id: string; firstInSession: boolean }) => [o.id, o.firstInSession])).toEqual([
      [first, true],
      [second, false],
    ]);
    expect(board.orders[0]).toMatchObject({ tableNumber: 1, status: 'new', guestName: 'Arta', note: 'Pa kripë', totalLek: 250 });

    const statusSeenByGuest = async () => (await call('GET', `${v.table1}/orders/${first}`, { cookie })).body?.status;
    expect((await call('PATCH', `/api/staff/orders/${first}`, { cookie: v.waiter, body: { status: 'preparing' } })).status).toBe(204);
    expect(await statusSeenByGuest()).toBe('preparing');
    await call('PATCH', `/api/staff/orders/${first}`, { cookie: v.waiter, body: { status: 'served' } });
    expect(await statusSeenByGuest()).toBe('served');

    const backwards = await call('PATCH', `/api/staff/orders/${first}`, { cookie: v.waiter, body: { status: 'preparing' } });
    expect(backwards.body).toEqual({ error: { code: 'invalid_transition', details: { from: 'served', to: 'preparing' } } });
  });

  it('cancel an order, which then leaves the bill', async () => {
    const v = await setup();
    const { cookie } = await scan(v.table1);
    const keep = (await order(v.table1, cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }])).body?.orderId;
    const drop = (await order(v.table1, cookie, [{ itemId: v.qofte.id, qty: 1, optionIds: [v.portion.six] }])).body?.orderId;
    await call('PATCH', `/api/staff/orders/${drop}`, { cookie: v.waiter, body: { status: 'preparing' } });
    expect((await call('PATCH', `/api/staff/orders/${drop}`, { cookie: v.waiter, body: { status: 'cancelled' } })).status).toBe(204);
    expect((await call('GET', `${v.table1}/orders/${keep}`, { cookie })).body?.sessionTotalLek).toBe(250);
  });

  it('answer a waiter call, which leaves the board', async () => {
    const v = await setup();
    const { cookie } = await scan(v.table1);
    await call('POST', `${v.table1}/calls`, { cookie });
    const callId = (await call('GET', '/api/staff/board', { cookie: v.waiter })).body?.calls[0].id;
    expect((await call('POST', `/api/staff/calls/${callId}/acknowledge`, { cookie: v.waiter })).status).toBe(204);
    expect((await call('GET', '/api/staff/board', { cookie: v.waiter })).body?.calls).toEqual([]);
  });

  it('take payment and close the table: the old cookie stops working and the next guests start fresh', async () => {
    const v = await setup();
    const guest = await scan(v.table1);
    const paidOrder = (await order(v.table1, guest.cookie, [{ itemId: v.qofte.id, qty: 2, optionIds: [v.portion.ten] }])).body?.orderId;
    await call('POST', `${v.table1}/calls`, { cookie: guest.cookie });

    const tables = (await call('GET', '/api/staff/tables', { cookie: v.waiter })).body?.tables;
    const t1 = tables.find((t: { table: { number: number } }) => t.table.number === 1);
    expect(t1).toMatchObject({ billLek: 1900, openCall: true });
    expect(tables.find((t: { table: { number: number } }) => t.table.number === 2)).toMatchObject({ session: null, billLek: 0 });
    // A table only scanned at doesn't count: the board watches tables with a bill or a call.
    await scan(v.table2);
    expect((await call('GET', '/api/staff/board', { cookie: v.waiter })).body?.openTables).toBe(1);

    const paid = await call('POST', `/api/staff/sessions/${t1.session.id}/pay`, { cookie: v.waiter, body: { method: 'card' } });
    expect(paid.status).toBe(200);
    expect(paid.body?.amountLek).toBe(1900);
    const [recorded] = await db.select().from(payment).where(eq(payment.sessionId, t1.session.id));
    expect(recorded).toMatchObject({ provider: 'cash', method: 'card', amountLek: 1900, status: 'confirmed' });

    expect((await order(v.table1, guest.cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }])).body).toEqual({ error: { code: 'session_closed' } });
    const after = (await call('GET', '/api/staff/tables', { cookie: v.waiter })).body?.tables.find((t: { table: { number: number } }) => t.table.number === 1);
    expect(after).toMatchObject({ session: null, billLek: 0, openCall: false });
    expect((await call('GET', '/api/staff/board', { cookie: v.waiter })).body?.calls).toEqual([]);
    expect((await call('GET', '/api/staff/board', { cookie: v.waiter })).body?.openTables).toBe(0);

    const nextGuests = await scan(v.table1);
    expect(nextGuests.cookie).not.toBe(guest.cookie);
    // The same phone may load the menu again (and get the new session) before it checks its order.
    const closed = { error: { code: 'session_closed' } };
    expect((await call('GET', `${v.table1}/orders/${paidOrder}`, { cookie: guest.cookie })).body).toEqual(closed);
    expect((await call('GET', `${v.table1}/orders/${paidOrder}`, { cookie: nextGuests.cookie })).body).toEqual(closed);
    expect((await call('GET', `${v.table2}/orders/${paidOrder}`, { cookie: (await scan(v.table2)).cookie })).status).toBe(404);
    const fresh = await order(v.table1, nextGuests.cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }]);
    expect((await call('GET', `${v.table1}/orders/${fresh.body?.orderId}`, { cookie: nextGuests.cookie })).body?.sessionTotalLek).toBe(250);

    expect((await call('POST', `/api/staff/sessions/${t1.session.id}/pay`, { cookie: v.waiter, body: { method: 'cash' } })).body).toEqual({ error: { code: 'session_closed' } });
  });

  it("won't take payment for nothing, but can clear a table where guests only called", async () => {
    const v = await setup();
    const { cookie } = await scan(v.table1);
    await call('POST', `${v.table1}/calls`, { cookie });
    const t1 = (await call('GET', '/api/staff/tables', { cookie: v.waiter })).body?.tables[0];
    expect((await call('POST', `/api/staff/sessions/${t1.session.id}/pay`, { cookie: v.waiter, body: { method: 'cash' } })).body).toEqual({ error: { code: 'nothing_to_pay' } });
    expect((await call('POST', `/api/staff/sessions/${t1.session.id}/close`, { cookie: v.waiter })).status).toBe(204);

    const guest = await scan(v.table1);
    await order(v.table1, guest.cookie, [{ itemId: v.byrek.id, qty: 1, optionIds: [] }]);
    const open = (await call('GET', '/api/staff/tables', { cookie: v.waiter })).body?.tables[0];
    expect((await call('POST', `/api/staff/sessions/${open.session.id}/close`, { cookie: v.waiter })).body).toEqual({ error: { code: 'unpaid_bill' } });
  });

  it('let a session nobody used expire after two hours', async () => {
    const v = await setup();
    const old = await scan(v.table1);
    await db.update(tableSession).set({ openedAt: sql`now() - interval '3 hours'` }).where(eq(tableSession.venueId, v.venueId));
    const next = await scan(v.table1);
    expect(next.cookie).not.toBe(old.cookie);
  });

  it('reset a leaked QR code: the old code stops working, the new one opens the table', async () => {
    const v = await setup();
    const owner = (await login(v.owner.email)).cookie;
    const qr = (await call('GET', '/api/staff/qr', { cookie: owner })).body!;
    const table1 = qr.tables.find((t: { number: number }) => t.number === 1);
    const reset = await call('POST', `/api/staff/tables/${table1.id}/reset-qr`, { cookie: v.manager });
    expect(reset.body?.table.qrToken).not.toBe(table1.qrToken);
    expect((await call('POST', `${v.table1}/scan`)).status).toBe(404);
    expect((await call('POST', `/api/guest/${v.slug}/t/${reset.body?.table.qrToken}/scan`)).status).toBe(200);

    const added = await call('POST', '/api/staff/tables', { cookie: v.manager });
    expect(added.body?.table.number).toBe(3);
  });

  it('keep QR codes and tables to owner and manager', async () => {
    const v = await setup();
    expect((await call('GET', '/api/staff/qr', { cookie: v.waiter })).status).toBe(403);
    expect((await call('POST', '/api/staff/tables', { cookie: v.waiter })).status).toBe(403);
  });
});

describe("tenancy: venue A never sees or touches venue B's service", () => {
  it("keeps B's orders, calls and tables off A's board and table list", async () => {
    const a = await setup('A');
    const b = await setup('B');
    const bGuest = await scan(b.table1);
    await order(b.table1, bGuest.cookie, [{ itemId: b.byrek.id, qty: 1, optionIds: [] }]);
    await call('POST', `${b.table1}/calls`, { cookie: bGuest.cookie });

    const board = (await call('GET', '/api/staff/board', { cookie: a.waiter })).body!;
    expect(board).toEqual({ orders: [], calls: [], openTables: 0 });
    const tables = (await call('GET', '/api/staff/tables', { cookie: a.waiter })).body?.tables;
    expect(tables.map((t: { table: { number: number } }) => t.table.number)).toEqual([1, 2]);
    expect(tables.every((t: { session: unknown }) => t.session === null)).toBe(true);
  });

  it("answers 404 to A's staff acting on B's order, call, bill or table, and leaves them alone", async () => {
    const a = await setup('A');
    const b = await setup('B');
    const bGuest = await scan(b.table1);
    const bOrder = (await order(b.table1, bGuest.cookie, [{ itemId: b.byrek.id, qty: 1, optionIds: [] }])).body?.orderId;
    await call('POST', `${b.table1}/calls`, { cookie: bGuest.cookie });
    const bBoard = (await call('GET', '/api/staff/board', { cookie: b.waiter })).body!;
    const bTables = (await call('GET', '/api/staff/tables', { cookie: b.waiter })).body?.tables;
    const bQr = (await call('GET', '/api/staff/qr', { cookie: b.manager })).body?.tables;

    expect((await call('PATCH', `/api/staff/orders/${bOrder}`, { cookie: a.waiter, body: { status: 'cancelled' } })).status).toBe(404);
    expect((await call('POST', `/api/staff/calls/${bBoard.calls[0].id}/acknowledge`, { cookie: a.waiter })).status).toBe(404);
    expect((await call('POST', `/api/staff/sessions/${bTables[0].session.id}/pay`, { cookie: a.waiter, body: { method: 'cash' } })).status).toBe(404);
    expect((await call('POST', `/api/staff/sessions/${bTables[0].session.id}/close`, { cookie: a.waiter })).status).toBe(404);
    expect((await call('POST', `/api/staff/tables/${bQr[0].id}/reset-qr`, { cookie: a.manager })).status).toBe(404);

    const after = (await call('GET', '/api/staff/board', { cookie: b.waiter })).body!;
    expect(after.orders[0]).toMatchObject({ id: bOrder, status: 'new' });
    expect(after.calls).toHaveLength(1);
    expect((await call('GET', '/api/staff/qr', { cookie: b.manager })).body?.tables[0].qrToken).toBe(bQr[0].qrToken);
  });

  it("won't show A's guest an order from B, even with a guessed id", async () => {
    const a = await setup('A');
    const b = await setup('B');
    const bGuest = await scan(b.table1);
    const bOrder = (await order(b.table1, bGuest.cookie, [{ itemId: b.byrek.id, qty: 1, optionIds: [] }])).body?.orderId;
    const aGuest = await scan(a.table1);
    expect((await call('GET', `${a.table1}/orders/${bOrder}`, { cookie: aGuest.cookie })).status).toBe(404);
  });
});
