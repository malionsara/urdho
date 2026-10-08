import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, isNotNull } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { MenuItemInput } from '../../shared/schemas';
import { guestOrder, menuItem, menuOption, orderItem, orderItemOption, tableSession } from '../db/schema';
import { makeVenueWithStaff, testApi } from '../test/api';
import { connectTestDb } from '../test/db';

const db = connectTestDb();
const { app, call, login, uploadDir } = testApi(db);

const qofte = (categoryId: string): MenuItemInput => ({
  categoryId,
  name: { sq: 'Qofte të fshira', en: 'Qofte' },
  description: { sq: 'Me erëza mali', en: 'With mountain herbs' },
  priceLek: 600,
  photoUrl: null,
  available: true,
  suggestInBasket: false,
  tags: ['spicy'],
  allergens: ['gluten', 'eggs'],
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
        { name: { sq: 'Sallatë', en: 'Salad' }, priceDeltaLek: 150, available: false },
      ],
    },
  ],
});

/** A venue with staff, a named category and a signed-in manager. */
async function setup(label = 'A') {
  const v = await makeVenueWithStaff(db, label);
  const manager = (await login(v.manager.email)).cookie;
  const category = await call('POST', '/api/staff/menu/categories', { cookie: manager, body: { name: { sq: 'Gatime', en: 'Mains' } } });
  return { ...v, manager, categoryId: category.body?.category.id as string };
}

async function createDish(cookie: string, input: MenuItemInput) {
  const res = await call('POST', '/api/staff/menu/items', { cookie, body: input });
  expect(res.status).toBe(201);
  return res.body?.item;
}

describe('reading and writing the menu', () => {
  it('reads a saved dish back exactly as it was sent, options in order', async () => {
    const v = await setup();
    const input = qofte(v.categoryId);
    const created = await createDish(v.manager, input);

    const menu = (await call('GET', '/api/staff/menu', { cookie: v.manager })).body!;
    const category = menu.categories.find((c: { id: string }) => c.id === v.categoryId);
    expect(category).toEqual({ id: v.categoryId, name: { sq: 'Gatime', en: 'Mains' }, active: true });

    const dish = menu.items.find((i: { id: string }) => i.id === created.id);
    expect(dish).toEqual(created);
    expect(dish).toMatchObject({ name: input.name, description: input.description, priceLek: 600, tags: ['spicy'], allergens: ['gluten', 'eggs'] });
    expect(dish.optionGroups.map((g: { name: { en: string } }) => g.name.en)).toEqual(['Portion', 'Add']);
    expect(dish.optionGroups[0].options.map((o: { name: { en: string }; priceDeltaLek: number }) => [o.name.en, o.priceDeltaLek])).toEqual([
      ['6 pieces', 0],
      ['10 pieces', 350],
    ]);
    expect(dish.optionGroups[1].options[1].available).toBe(false);
  });

  it('updates a dish: keeps, changes, adds and drops options, and reorders groups', async () => {
    const v = await setup();
    const created = await createDish(v.manager, qofte(v.categoryId));
    const [portion, extras] = created.optionGroups;

    const update: MenuItemInput = {
      ...qofte(v.categoryId),
      name: { sq: 'Qofte shtëpie', en: 'House qofte' },
      priceLek: 650,
      optionGroups: [
        // "Add" first now, with Chips kept (repriced), Salad dropped, Bread new.
        {
          id: extras.id,
          name: { sq: 'Shto', en: 'Add' },
          minSelect: 0,
          maxSelect: 2,
          options: [
            { id: extras.options[0].id, name: { sq: 'Patate', en: 'Chips' }, priceDeltaLek: 250, available: true },
            { name: { sq: 'Bukë', en: 'Bread' }, priceDeltaLek: 100, available: true },
          ],
        },
        // Unchanged: sent back exactly as read.
        { id: portion.id, name: { sq: 'Porcioni', en: 'Portion' }, minSelect: 1, maxSelect: 1, options: portion.options },
      ],
    };
    const res = await call('PUT', `/api/staff/menu/items/${created.id}`, { cookie: v.manager, body: update });
    expect(res.status).toBe(200);
    const saved = res.body?.item;
    expect(saved).toMatchObject({ id: created.id, name: { sq: 'Qofte shtëpie', en: 'House qofte' }, priceLek: 650 });
    expect(saved.optionGroups.map((g: { id: string }) => g.id)).toEqual([extras.id, portion.id]);
    expect(saved.optionGroups[0].options.map((o: { name: { en: string }; priceDeltaLek: number }) => [o.name.en, o.priceDeltaLek])).toEqual([
      ['Chips', 250],
      ['Bread', 100],
    ]);
    expect(saved.optionGroups[0].options[0].id).toBe(extras.options[0].id);
  });

  it('archives a dropped option but keeps the past order that used it intact', async () => {
    const v = await setup();
    const created = await createDish(v.manager, qofte(v.categoryId));
    const salad = created.optionGroups[1].options[1];

    // A past order with Salad on it.
    const [session] = await db.insert(tableSession).values({ venueId: v.venueId, tableId: v.tableId, tokenHash: randomUUID() }).returning();
    const [order] = await db.insert(guestOrder).values({ venueId: v.venueId, sessionId: session!.id, clientRef: 'old' }).returning();
    const [line] = await db
      .insert(orderItem)
      .values({ venueId: v.venueId, orderId: order!.id, itemId: created.id, itemName: created.name, qty: 1, unitPriceLek: 750 })
      .returning();
    await db.insert(orderItemOption).values({ venueId: v.venueId, orderItemId: line!.id, optionId: salad.id, optionName: salad.name, priceDeltaLek: 150 });

    const withoutSalad = qofte(v.categoryId);
    withoutSalad.optionGroups[1] = { ...withoutSalad.optionGroups[1]!, id: created.optionGroups[1].id, maxSelect: 1, options: [{ ...withoutSalad.optionGroups[1]!.options[0]!, id: created.optionGroups[1].options[0].id }] };
    withoutSalad.optionGroups[0] = { ...withoutSalad.optionGroups[0]!, id: created.optionGroups[0].id };
    expect((await call('PUT', `/api/staff/menu/items/${created.id}`, { cookie: v.manager, body: withoutSalad })).status).toBe(200);

    const [archived] = await db.select().from(menuOption).where(and(eq(menuOption.id, salad.id), isNotNull(menuOption.archivedAt)));
    expect(archived).toBeDefined();
    const [kept] = await db.select().from(orderItemOption).where(eq(orderItemOption.orderItemId, line!.id));
    expect(kept).toMatchObject({ optionName: { sq: 'Sallatë', en: 'Salad' }, priceDeltaLek: 150 });
  });

  it('removes a language when its text is cleared', async () => {
    const v = await setup();
    const created = await createDish(v.manager, qofte(v.categoryId));
    const res = await call('PUT', `/api/staff/menu/items/${created.id}`, { cookie: v.manager, body: { ...qofte(v.categoryId), name: { sq: 'Qofte', en: '' }, optionGroups: [] } });
    expect(res.body?.item.name).toEqual({ sq: 'Qofte' });
    expect(res.body?.item.optionGroups).toEqual([]);
  });

  it('marks a dish sold out and back', async () => {
    const v = await setup();
    const created = await createDish(v.manager, qofte(v.categoryId));
    expect((await call('PATCH', `/api/staff/menu/items/${created.id}/availability`, { cookie: v.manager, body: { available: false } })).status).toBe(204);
    const menu = (await call('GET', '/api/staff/menu', { cookie: v.manager })).body!;
    expect(menu.items.find((i: { id: string }) => i.id === created.id).available).toBe(false);
  });

  it('archives a dish: off the menu, but past orders keep its copied name', async () => {
    const v = await setup();
    const created = await createDish(v.manager, qofte(v.categoryId));
    const [session] = await db.insert(tableSession).values({ venueId: v.venueId, tableId: v.tableId, tokenHash: randomUUID() }).returning();
    const [order] = await db.insert(guestOrder).values({ venueId: v.venueId, sessionId: session!.id, clientRef: 'old' }).returning();
    await db.insert(orderItem).values({ venueId: v.venueId, orderId: order!.id, itemId: created.id, itemName: created.name, qty: 2, unitPriceLek: 600 });

    expect((await call('DELETE', `/api/staff/menu/items/${created.id}`, { cookie: v.manager })).status).toBe(204);
    const menu = (await call('GET', '/api/staff/menu', { cookie: v.manager })).body!;
    expect(menu.items.map((i: { id: string }) => i.id)).not.toContain(created.id);
    const [line] = await db.select({ itemName: orderItem.itemName }).from(orderItem).where(eq(orderItem.orderId, order!.id));
    expect(line!.itemName).toEqual({ sq: 'Qofte të fshira', en: 'Qofte' });
  });

  it('renames and hides categories, and only archives empty ones', async () => {
    const v = await setup();
    const path = `/api/staff/menu/categories/${v.categoryId}`;
    expect((await call('PATCH', path, { cookie: v.manager, body: { name: { sq: 'Kryesore', en: 'Mains' }, active: false } })).status).toBe(204);
    const menu = (await call('GET', '/api/staff/menu', { cookie: v.manager })).body!;
    expect(menu.categories.find((c: { id: string }) => c.id === v.categoryId)).toMatchObject({ name: { sq: 'Kryesore', en: 'Mains' }, active: false });

    const created = await createDish(v.manager, qofte(v.categoryId));
    expect((await call('DELETE', path, { cookie: v.manager })).body).toEqual({ error: { code: 'category_not_empty' } });
    await call('DELETE', `/api/staff/menu/items/${created.id}`, { cookie: v.manager });
    expect((await call('DELETE', path, { cookie: v.manager })).status).toBe(204);
  });
});

describe('roles', () => {
  it('keeps waiters out of the menu manager', async () => {
    const v = await setup();
    const waiter = (await login(v.waiter.email)).cookie;
    expect((await call('GET', '/api/staff/menu', { cookie: waiter })).status).toBe(403);
    expect((await call('POST', '/api/staff/menu/items', { cookie: waiter, body: qofte(v.categoryId) })).status).toBe(403);
  });
});

describe('tenancy: venue A can never see or change venue B\'s menu', () => {
  it("lists only the caller's own dishes", async () => {
    const a = await setup('A');
    const b = await setup('B');
    const bDish = await createDish(b.manager, qofte(b.categoryId));
    const menu = (await call('GET', '/api/staff/menu', { cookie: a.manager })).body!;
    expect(menu.items.map((i: { id: string }) => i.id)).not.toContain(bDish.id);
    expect(menu.categories.map((c: { id: string }) => c.id)).not.toContain(b.categoryId);
  });

  it("answers 404 to every change aimed at another venue's dish, and leaves it alone", async () => {
    const a = await setup('A');
    const b = await setup('B');
    const bDish = await createDish(b.manager, qofte(b.categoryId));
    const path = `/api/staff/menu/items/${bDish.id}`;
    expect((await call('PUT', path, { cookie: a.manager, body: qofte(a.categoryId) })).status).toBe(404);
    expect((await call('PATCH', `${path}/availability`, { cookie: a.manager, body: { available: false } })).status).toBe(404);
    expect((await call('DELETE', path, { cookie: a.manager })).status).toBe(404);
    expect((await call('PATCH', `/api/staff/menu/categories/${b.categoryId}`, { cookie: a.manager, body: { active: false } })).status).toBe(404);
    expect((await call('DELETE', `/api/staff/menu/categories/${b.categoryId}`, { cookie: a.manager })).status).toBe(404);

    const bMenu = (await call('GET', '/api/staff/menu', { cookie: b.manager })).body!;
    expect(bMenu.items.find((i: { id: string }) => i.id === bDish.id)).toEqual(bDish);
  });

  it("won't file a dish under another venue's category", async () => {
    const a = await setup('A');
    const b = await setup('B');
    const res = await call('POST', '/api/staff/menu/items', { cookie: a.manager, body: qofte(b.categoryId) });
    expect(res.body).toEqual({ error: { code: 'unknown_category' } });
    const [count] = await db.select({ id: menuItem.id }).from(menuItem).where(eq(menuItem.categoryId, b.categoryId));
    expect(count).toBeUndefined();
  });

  it("won't adopt another dish's option group or option", async () => {
    const a = await setup('A');
    const b = await setup('B');
    const aDish = await createDish(a.manager, qofte(a.categoryId));
    const bDish = await createDish(b.manager, qofte(b.categoryId));

    const stealGroup = { ...qofte(a.categoryId), optionGroups: [{ ...qofte(a.categoryId).optionGroups[0]!, id: bDish.optionGroups[0].id }] };
    expect((await call('PUT', `/api/staff/menu/items/${aDish.id}`, { cookie: a.manager, body: stealGroup })).body).toEqual({ error: { code: 'unknown_option_group' } });

    const group = qofte(a.categoryId).optionGroups[0]!;
    const stealOption = {
      ...qofte(a.categoryId),
      optionGroups: [{ ...group, id: aDish.optionGroups[0].id, options: [{ ...group.options[0]!, id: bDish.optionGroups[0].options[0].id }, group.options[1]!] }],
    };
    expect((await call('PUT', `/api/staff/menu/items/${aDish.id}`, { cookie: a.manager, body: stealOption })).body).toEqual({ error: { code: 'unknown_option' } });

    const bMenu = (await call('GET', '/api/staff/menu', { cookie: b.manager })).body!;
    expect(bMenu.items.find((i: { id: string }) => i.id === bDish.id)).toEqual(bDish);
  });
});

describe('validation', () => {
  it('needs every name in the venue default language', async () => {
    const v = await setup();
    const input = qofte(v.categoryId);
    input.name = { en: 'Qofte' };
    input.optionGroups[0]!.options[1]!.name = { en: '10 pieces' };
    const res = await call('POST', '/api/staff/menu/items', { cookie: v.manager, body: input });
    expect(res.status).toBe(400);
    expect(res.body?.error.details).toEqual([
      { path: 'name', code: 'required_in_sq' },
      { path: 'optionGroups.0.options.1.name', code: 'required_in_sq' },
    ]);
  });

  it('refuses impossible choices, negative prices and unknown allergens', async () => {
    const v = await setup();
    const bad = qofte(v.categoryId);
    bad.priceLek = -1;
    bad.optionGroups[0]!.minSelect = 2;
    bad.optionGroups[1]!.maxSelect = 5;
    (bad.allergens as string[]).push('chocolate');
    const res = await call('POST', '/api/staff/menu/items', { cookie: v.manager, body: bad });
    expect(res.status).toBe(400);
    const codes = res.body?.error.details.map((d: { path: string; code: string }) => `${d.path}:${d.code}`);
    expect(codes).toEqual(expect.arrayContaining(['optionGroups.0.minSelect:min_above_max', 'optionGroups.1.maxSelect:max_above_option_count']));
    expect(codes.some((c: string) => c.startsWith('priceLek:'))).toBe(true);
    expect(codes.some((c: string) => c.startsWith('allergens.'))).toBe(true);
  });
});

describe('photo uploads', () => {
  const upload = (cookie: string, kind: string, file: Blob) => {
    const form = new FormData();
    form.append('file', file, 'photo');
    return app.request(`/api/staff/uploads?kind=${kind}`, {
      method: 'POST',
      body: form,
      headers: { cookie, origin: 'http://localhost', 'sec-fetch-site': 'same-origin' },
    });
  };

  const photo = async (width: number, height: number) => {
    // A JPEG carrying GPS-style metadata, the way phone photos do.
    const buffer = await sharp({ create: { width, height, channels: 3, background: '#c8432a' } })
      .jpeg()
      .withExif({ IFD0: { Make: 'Phone', Model: 'Camera' } })
      .toBuffer();
    return new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' });
  };

  it('stores a dish photo as WebP in two sizes, without the camera metadata', async () => {
    const v = await setup();
    const res = await upload(v.manager, 'dish', await photo(1600, 1200));
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(new RegExp(`^/uploads/${v.venueId}/dish/[0-9a-f-]{36}\\.webp$`));

    const large = join(uploadDir, url.replace('/uploads/', ''));
    const small = large.replace(/\.webp$/, '-400.webp');
    expect(existsSync(large) && existsSync(small)).toBe(true);
    const [l, s] = await Promise.all([sharp(large).metadata(), sharp(small).metadata()]);
    expect([l.format, l.width, l.height]).toEqual(['webp', 800, 600]);
    expect([s.format, s.width]).toEqual(['webp', 400]);
    expect(l.exif).toBeUndefined();
  });

  it('crops logos square and keeps cover and logo for the owner', async () => {
    const v = await setup();
    expect((await upload(v.manager, 'cover', await photo(1600, 900))).status).toBe(403);
    const owner = (await login(v.owner.email)).cookie;
    const res = await upload(owner, 'logo', await photo(900, 500));
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    const meta = await sharp(join(uploadDir, url.replace('/uploads/', ''))).metadata();
    expect([meta.width, meta.height]).toEqual([400, 400]);
  });

  it('refuses files that are not images, and files that are too big', async () => {
    const v = await setup();
    const notImage = await upload(v.manager, 'dish', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }));
    expect(notImage.status).toBe(400);
    expect(await notImage.json()).toEqual({ error: { code: 'not_an_image' } });

    const huge = await upload(v.manager, 'dish', new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'image/jpeg' }));
    expect(huge.status).toBe(413);
  });

  it('refuses an unknown kind and waiters', async () => {
    const v = await setup();
    expect((await upload(v.manager, 'avatar', await photo(100, 100))).status).toBe(400);
    const waiter = (await login(v.waiter.email)).cookie;
    expect((await upload(waiter, 'dish', await photo(100, 100))).status).toBe(403);
  });
});
