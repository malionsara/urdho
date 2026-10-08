import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { availabilityInput, categoryInput, categoryUpdateInput, menuItemInput, type MenuItemInput } from '../../shared/schemas';
import type { LocalizedText } from '../../shared/types';
import { requireStaff } from '../auth/middleware';
import type { Db } from '../db/client';
import { ApiError, notFound, readJson, type AppEnv } from '../http';
import { archiveCategory, archiveItem, createCategory, loadMenu, saveItem, setItemAvailability, updateCategory } from '../repos/menu';
import { getVenue } from '../repos/venue';

/** /api/staff/menu: the menu manager. Owner and manager only, as the spec's roles say. */
export function menuRoutes(db: Db) {
  const routes = new Hono<AppEnv>();
  const editors = requireStaff(db, { roles: ['owner', 'manager'] });

  /** Every name must exist at least in the venue's default language; guests fall back to it. */
  async function requireDefaultNames(c: Context<AppEnv>, named: { path: string; name: LocalizedText }[]) {
    const venue = await getVenue(db, c.get('staff').venueId);
    if (!venue) throw notFound();
    const missing = named.filter((n) => !n.name[venue.defaultLanguage]);
    if (missing.length > 0) {
      throw new ApiError(400, 'invalid_request', missing.map((m) => ({ path: m.path, code: `required_in_${venue.defaultLanguage}` })));
    }
  }

  const itemNames = (input: MenuItemInput) => [
    { path: 'name', name: input.name },
    ...input.optionGroups.flatMap((g, gi) => [
      { path: `optionGroups.${gi}.name`, name: g.name },
      ...g.options.map((o, oi) => ({ path: `optionGroups.${gi}.options.${oi}.name`, name: o.name })),
    ]),
  ];

  routes.get('/', editors, async (c) => c.json(await loadMenu(db, c.get('staff').venueId)));

  routes.post('/categories', editors, async (c) => {
    const input = await readJson(c, categoryInput);
    await requireDefaultNames(c, [{ path: 'name', name: input.name }]);
    return c.json({ category: await createCategory(db, c.get('staff').venueId, input) }, 201);
  });

  routes.patch('/categories/:id', editors, async (c) => {
    const input = await readJson(c, categoryUpdateInput);
    if (input.name) await requireDefaultNames(c, [{ path: 'name', name: input.name }]);
    if (!(await updateCategory(db, c.get('staff').venueId, idParam(c), input))) throw notFound();
    return c.body(null, 204);
  });

  routes.delete('/categories/:id', editors, async (c) => {
    const result = await archiveCategory(db, c.get('staff').venueId, idParam(c));
    if (result === 'not_found') throw notFound();
    if (result === 'not_empty') throw new ApiError(409, 'category_not_empty');
    return c.body(null, 204);
  });

  routes.post('/items', editors, async (c) => {
    const input = await readJson(c, menuItemInput);
    await requireDefaultNames(c, itemNames(input));
    return c.json({ item: await saveItem(db, c.get('staff').venueId, null, input) }, 201);
  });

  routes.put('/items/:id', editors, async (c) => {
    const id = idParam(c);
    const input = await readJson(c, menuItemInput);
    await requireDefaultNames(c, itemNames(input));
    return c.json({ item: await saveItem(db, c.get('staff').venueId, id, input) });
  });

  routes.patch('/items/:id/availability', editors, async (c) => {
    const { available } = await readJson(c, availabilityInput);
    if (!(await setItemAvailability(db, c.get('staff').venueId, idParam(c), available))) throw notFound();
    return c.body(null, 204);
  });

  routes.delete('/items/:id', editors, async (c) => {
    if (!(await archiveItem(db, c.get('staff').venueId, idParam(c)))) throw notFound();
    return c.body(null, 204);
  });

  return routes;
}

/** A row id from the path; anything that isn't a UUID can't exist, so it's a 404. */
function idParam(c: Context): string {
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) throw notFound();
  return id.data;
}
