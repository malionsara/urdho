import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { MenuItemInput } from '../../shared/schemas';
import type { SetupStep, VenueSetup } from '../../shared/types';
import { venue } from '../db/schema';
import { importMenu } from '../repos/menu';
import { makeVenueWithStaff, testApi } from '../test/api';
import { connectTestDb } from '../test/db';

const db = connectTestDb();
const { call, login } = testApi(db);

const dish = (categoryId: string, photoUrl: string | null = null): MenuItemInput => ({
  categoryId,
  name: { sq: 'Byrek' },
  description: {},
  priceLek: 250,
  photoUrl,
  available: true,
  suggestInBasket: false,
  tags: [],
  allergens: [],
  optionGroups: [],
});

async function setupOf(cookie: string): Promise<VenueSetup> {
  const res = await call('GET', '/api/staff/venue/setup', { cookie });
  expect(res.status).toBe(200);
  return res.body!.setup as VenueSetup;
}
const step = (setup: VenueSetup, key: SetupStep) => setup.steps.find((s) => s.key === key)!;

describe("the owner's get-started checklist", () => {
  it('ticks itself as the venue gets its look, menu, photos, staff and first order', async () => {
    const v = await makeVenueWithStaff(db, 'Setup');
    const owner = (await login(v.owner.email)).cookie;

    let setup = await setupOf(owner);
    expect(setup.steps.map((s) => s.key)).toEqual(['look', 'hours', 'menu', 'photos', 'staff', 'qr', 'testOrder']);
    expect(setup.steps.filter((s) => s.done).map((s) => s.key)).toEqual(['staff']); // makeVenueWithStaff adds a manager and a waiter
    expect(step(setup, 'photos').progress).toEqual({ done: 0, total: 0 });

    await db.update(venue).set({ logoUrl: '/uploads/logo.webp' }).where(eq(venue.id, v.venueId));
    await call('POST', '/api/staff/menu/items', { cookie: owner, body: dish(v.categoryId) });
    setup = await setupOf(owner);
    expect(step(setup, 'look').done).toBe(true);
    expect(step(setup, 'menu').done).toBe(true);
    expect(step(setup, 'photos')).toMatchObject({ done: false, progress: { done: 0, total: 1 } });

    await call('POST', '/api/staff/menu/items', { cookie: owner, body: dish(v.categoryId, '/uploads/byrek.webp') });
    expect(step(await setupOf(owner), 'photos')).toMatchObject({ done: true, progress: { done: 1, total: 2 } });

    const scan = await call('POST', `/api/guest/${v.slug}/t/${v.slug}-t1/scan`);
    const guest = scan.headers.get('set-cookie')!.split(';')[0]!;
    const byrek = (scan.body!.categories as { items: { id: string }[] }[])[0]!.items[0]!;
    const order = await call('POST', `/api/guest/${v.slug}/t/${v.slug}-t1/orders`, {
      cookie: guest,
      body: { clientRef: 'setup-test-order', guestName: '', note: '', lines: [{ itemId: byrek.id, qty: 1, optionIds: [] }] },
    });
    expect(order.status).toBe(201);
    expect(step(await setupOf(owner), 'testOrder').done).toBe(true);
  });

  it('counts imported categories that guests cannot see yet', async () => {
    const v = await makeVenueWithStaff(db, 'Hidden');
    const item = { name: { sq: 'Byrek' }, description: {}, priceLek: 250, photoUrl: null, available: true, suggestInBasket: false, tags: [], allergens: [], optionGroups: [] };
    await importMenu(db, v.venueId, { visible: false, categories: [{ name: { sq: 'Pije' }, items: [item] }, { name: { sq: 'Ëmbëlsira' }, items: [item] }] });
    const setup = await setupOf((await login(v.owner.email)).cookie);
    expect(step(setup, 'menu')).toMatchObject({ done: false, hiddenCategories: 2 });
  });

  it('keeps the ticks the owner sets by hand, once each, and for that venue only', async () => {
    const a = await makeVenueWithStaff(db, 'A');
    const b = await makeVenueWithStaff(db, 'B');
    const ownerA = (await login(a.owner.email)).cookie;
    const mark = (body: object) => call('POST', '/api/staff/venue/setup', { cookie: ownerA, body });

    await mark({ mark: 'hours', done: true });
    await mark({ mark: 'hours', done: true });
    const ticked = (await mark({ mark: 'qr', done: true })).body!.setup as VenueSetup;
    expect([step(ticked, 'hours').done, step(ticked, 'qr').done]).toEqual([true, true]);
    const [row] = await db.select({ marks: venue.setupMarks }).from(venue).where(eq(venue.id, a.venueId));
    expect(row!.marks.sort()).toEqual(['hours', 'qr']);

    const unticked = (await mark({ mark: 'qr', done: false })).body!.setup as VenueSetup;
    expect(step(unticked, 'qr').done).toBe(false);
    expect(((await mark({ mark: 'dismissed', done: true })).body!.setup as VenueSetup).dismissed).toBe(true);

    const setupB = await setupOf((await login(b.owner.email)).cookie);
    expect([step(setupB, 'hours').done, setupB.dismissed]).toEqual([false, false]);
  });

  it('is for the owner only, and takes only the marks it knows', async () => {
    const v = await makeVenueWithStaff(db, 'Roles');
    for (const email of [v.manager.email, v.waiter.email]) {
      const cookie = (await login(email)).cookie;
      expect((await call('GET', '/api/staff/venue/setup', { cookie })).status).toBe(403);
      expect((await call('POST', '/api/staff/venue/setup', { cookie, body: { mark: 'hours', done: true } })).status).toBe(403);
    }
    const owner = (await login(v.owner.email)).cookie;
    expect((await call('POST', '/api/staff/venue/setup', { cookie: owner, body: { mark: 'menu', done: true } })).status).toBe(400);
  });
});
