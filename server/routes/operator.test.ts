import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { guestOrder } from '../db/schema';
import { pilotStats } from '../repos/operator';
import { makeVenueWithStaff, PASSWORD, testApi } from '../test/api';
import { connectTestDb } from '../test/db';

const db = connectTestDb();
const TOKEN = 'test-operator-key-0123456789';
const { app, call, login } = testApi(db, { operatorToken: TOKEN });
const withoutOperator = testApi(db);

const operator = (method: string, path: string, body?: unknown, token: string | null = TOKEN) =>
  // No Origin or Sec-Fetch-Site: the command line doesn't send them, and doesn't need to.
  app.request(`/api/operator${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

let n = 0;
const newVenue = (overrides: Record<string, unknown> = {}) => {
  const tag = `${Date.now().toString(36)}-${n++}`;
  return { name: 'Bar Pilot', slug: `pilot-${tag}`, ownerName: 'Ina Pilot', ownerEmail: `ina-${tag}@example.test`, tables: 4, ...overrides };
};

describe('the operator tools', () => {
  it("don't exist on a server without an operator key", async () => {
    const res = await withoutOperator.call('GET', '/api/operator/stats', { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(404);
  });

  // Read from the app itself, so operator routes added later are covered too.
  const routes = [...new Map(app.routes.filter((r) => r.method !== 'ALL' && r.path.startsWith('/api/operator/')).map((r) => [`${r.method} ${r.path}`, r])).values()];

  it('finds the operator routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });

  it.each(routes.map((r) => [r.method, r.path]))('%s %s answers 401 without the key, or with a wrong one', async (method, path) => {
    for (const token of [null, 'not-the-key', `${TOKEN}x`]) {
      const res = await operator(method, path.replace('/api/operator', ''), method === 'GET' ? undefined : newVenue(), token);
      expect(res.status).toBe(401);
    }
  });
});

describe('creating a pilot venue', () => {
  it('makes the venue, its tables with private codes, and an owner who must choose a password', async () => {
    const input = newVenue({ tables: 3 });
    const res = await operator('POST', '/venues', input);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { venue: { slug: string }; owner: { temporaryPassword: string }; tables: { number: number; qrToken: string }[] };
    expect(created.venue.slug).toBe(input.slug);
    expect(created.tables.map((t) => t.number)).toEqual([1, 2, 3]);
    expect(new Set(created.tables.map((t) => t.qrToken)).size).toBe(3);

    const signedIn = await login(input.ownerEmail, created.owner.temporaryPassword);
    expect(signedIn.body?.user).toMatchObject({ role: 'owner', mustChangePassword: true });

    const scan = await call('POST', `/api/guest/${input.slug}/t/${created.tables[0]!.qrToken}/scan`);
    expect(scan.status).toBe(200);
  });

  it('refuses a taken address or email, and addresses the app uses itself', async () => {
    const first = newVenue();
    await operator('POST', '/venues', first);
    const sameSlug = await operator('POST', '/venues', newVenue({ slug: first.slug }));
    expect(await sameSlug.json()).toEqual({ error: { code: 'slug_taken' } });
    const sameEmail = await operator('POST', '/venues', newVenue({ ownerEmail: first.ownerEmail.toUpperCase() }));
    expect(await sameEmail.json()).toEqual({ error: { code: 'email_taken' } });
    expect((await operator('POST', '/venues', newVenue({ slug: 'staff' }))).status).toBe(400);
  });
});

describe('importing a menu', () => {
  const menu = (overrides: Record<string, unknown> = {}) => ({
    categories: [
      {
        name: { sq: 'Pije', en: 'Drinks' },
        items: [
          { name: { sq: 'Birrë Korça' }, description: {}, priceLek: 300, photoUrl: null, available: true, suggestInBasket: false, tags: [], allergens: [], optionGroups: [] },
          {
            name: { sq: 'Kafe', en: 'Coffee' },
            description: {},
            priceLek: 100,
            photoUrl: null,
            available: true,
            suggestInBasket: false,
            tags: [],
            allergens: ['milk'],
            optionGroups: [{ name: { sq: 'Lloji', en: 'Kind' }, minSelect: 1, maxSelect: 1, options: [{ name: { sq: 'Espresso' }, priceDeltaLek: 0, available: true }, { name: { sq: 'Kapuçino' }, priceDeltaLek: 50, available: true }] }],
          },
        ],
      },
    ],
    ...overrides,
  });

  it('adds the categories and dishes to that venue only, hidden from its guests', async () => {
    const target = await makeVenueWithStaff(db, 'Import');
    const other = await makeVenueWithStaff(db, 'Other');
    const res = await operator('POST', `/venues/${target.slug}/menu`, menu());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ categories: 1, items: 2 });

    const owner = (await login(target.owner.email)).cookie;
    const loaded = (await call('GET', '/api/staff/menu', { cookie: owner })).body!;
    const drinks = loaded.categories.find((c: { name: { sq?: string } }) => c.name.sq === 'Pije');
    expect(drinks).toMatchObject({ active: false });
    const coffee = loaded.items.find((i: { name: { sq?: string } }) => i.name.sq === 'Kafe');
    expect(coffee).toMatchObject({ priceLek: 100, allergens: ['milk'], optionGroups: [{ options: [{ priceDeltaLek: 0 }, { priceDeltaLek: 50 }] }] });

    const othersMenu = (await call('GET', '/api/staff/menu', { cookie: (await login(other.owner.email)).cookie })).body!;
    expect(othersMenu.items.some((i: { name: { sq?: string } }) => i.name.sq === 'Kafe')).toBe(false);
  });

  it('can show the new categories at once, and refuses an unknown venue or a broken menu', async () => {
    const v = await makeVenueWithStaff(db, 'Visible');
    expect((await operator('POST', `/venues/${v.slug}/menu`, menu({ visible: true }))).status).toBe(201);
    const loaded = (await call('GET', '/api/staff/menu', { cookie: (await login(v.owner.email)).cookie })).body!;
    expect(loaded.categories.find((c: { name: { sq?: string } }) => c.name.sq === 'Pije')).toMatchObject({ active: true });

    expect((await operator('POST', '/venues/no-such-venue/menu', menu())).status).toBe(404);
    const negative = menu({ categories: [{ name: { sq: 'X' }, items: [{ ...menu().categories[0]!.items[0], priceLek: -5 }] }] });
    expect((await operator('POST', `/venues/${v.slug}/menu`, negative)).status).toBe(400);
  });
});

describe('resetting a forgotten password', () => {
  const from = (ip: string) => ({ headers: { 'x-real-ip': ip } });

  it("gives an owner a temporary password, signs them out everywhere and lifts their sign-in block", async () => {
    const v = await makeVenueWithStaff(db, 'Reset');
    const tablet = (await login(v.owner.email)).cookie;
    for (let i = 0; i < 5; i++) await call('POST', '/api/staff/login', { body: { email: v.owner.email, password: 'wrong guess' }, ...from('198.51.100.7') });
    expect((await call('POST', '/api/staff/login', { body: { email: v.owner.email, password: PASSWORD }, ...from('198.51.100.7') })).status).toBe(429);

    const res = await operator('POST', '/staff/password-reset', { email: v.owner.email.toUpperCase() });
    expect(res.status).toBe(200);
    const reset = (await res.json()) as { email: string; role: string; venue: { slug: string }; temporaryPassword: string };
    expect(reset).toMatchObject({ email: v.owner.email, role: 'owner', venue: { slug: v.slug } });

    expect((await call('GET', '/api/staff/me', { cookie: tablet })).status).toBe(401);
    expect((await login(v.owner.email)).status).toBe(401);
    const signedIn = await call('POST', '/api/staff/login', { body: { email: v.owner.email, password: reset.temporaryPassword }, ...from('198.51.100.7') });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body?.user.mustChangePassword).toBe(true);
  });

  it('answers 404 for an email no account has', async () => {
    expect((await operator('POST', '/staff/password-reset', { email: 'nobody-here@example.test' })).status).toBe(404);
  });
});

describe('pilot numbers', () => {
  async function venueWithOrders() {
    const v = await makeVenueWithStaff(db, 'Stats');
    const manager = (await login(v.manager.email)).cookie;
    const waiter = (await login(v.waiter.email)).cookie;
    const categoryId = (await call('POST', '/api/staff/menu/categories', { cookie: manager, body: { name: { sq: 'Gatime' } } })).body?.category.id;
    const qofte = (
      await call('POST', '/api/staff/menu/items', {
        cookie: manager,
        body: {
          categoryId,
          name: { sq: 'Qofte' },
          description: {},
          priceLek: 600,
          photoUrl: null,
          available: true,
          suggestInBasket: false,
          tags: [],
          allergens: [],
          optionGroups: [{ name: { sq: 'Porcioni' }, minSelect: 1, maxSelect: 1, options: [{ name: { sq: '10 copë' }, priceDeltaLek: 350, available: true }] }],
        },
      })
    ).body?.item;
    const table = `/api/guest/${v.slug}/t/${v.slug}-t1`;
    const scan = await call('POST', `${table}/scan`);
    const cookie = scan.headers.get('set-cookie')!.split(';')[0]!;
    const order = async (qty: number) =>
      (await call('POST', `${table}/orders`, { cookie, body: { clientRef: randomUUID(), guestName: '', note: '', lines: [{ itemId: qofte.id, qty, optionIds: [qofte.optionGroups[0].options[0].id] }] } })).body
        ?.orderId as string;
    return { v, waiter, table, cookie, order };
  }

  it('counts orders, their value, tables, calls and how bills were paid, per venue', async () => {
    const { v, waiter, table, cookie, order } = await venueWithOrders();
    await order(2); // 2 × (600 + 350)
    await order(1);
    const dropped = await order(3);
    await call('PATCH', `/api/staff/orders/${dropped}`, { cookie: waiter, body: { status: 'cancelled' } });
    await call('POST', `${table}/calls`, { cookie });
    const session = (await call('GET', '/api/staff/tables', { cookie: waiter })).body?.tables[0].session.id;
    await call('POST', `/api/staff/sessions/${session}/pay`, { cookie: waiter, body: { method: 'card' } });

    const res = await operator('GET', '/stats?days=7');
    const stats = (await res.json()) as Awaited<ReturnType<typeof pilotStats>>;
    const mine = stats.venues.find((s) => s.venue.id === v.venueId)!;
    expect(stats.days).toBe(7);
    expect(mine).toMatchObject({
      orders: 2,
      cancelled: 1,
      valueLek: 2850,
      tableVisits: 1,
      waiterCalls: 1,
      paid: { card: { bills: 1, lek: 2850 }, cash: { bills: 0, lek: 0 } },
      daysWithOrders: 1,
      openDays: 7, // a venue with no hours set is always open
    });
    expect(mine.byDay).toHaveLength(7);
    expect(mine.byDay.at(-1)?.orders).toBe(2);
    expect(mine.lastOrderAt).not.toBeNull();
  });

  it('counts a late-night order towards the evening it belongs to', async () => {
    const { v, order } = await venueWithOrders();
    const id = await order(1);
    // 01:30 in Tirana on 9 October (summer time, UTC+2) is still the service of 8 October.
    await db.update(guestOrder).set({ createdAt: new Date('2026-10-08T23:30:00Z') }).where(eq(guestOrder.id, id));
    const stats = await pilotStats(db, 3, new Date('2026-10-09T12:00:00Z'));
    const mine = stats.venues.find((s) => s.venue.id === v.venueId)!;
    expect(mine.byDay).toEqual([
      { date: '2026-10-07', orders: 0 },
      { date: '2026-10-08', orders: 1 },
      { date: '2026-10-09', orders: 0 },
    ]);
  });

  it('leaves out orders from before the period', async () => {
    const { v, order } = await venueWithOrders();
    const id = await order(1);
    await db.execute(sql`update guest_order set created_at = now() - interval '20 days' where id = ${id}`);
    const mine = (await pilotStats(db, 7)).venues.find((s) => s.venue.id === v.venueId)!;
    expect(mine.orders).toBe(0);
  });
});
