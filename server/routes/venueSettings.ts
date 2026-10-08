import { Hono } from 'hono';
import { venueSettingsInput } from '../../shared/schemas';
import { requireStaff } from '../auth/middleware';
import type { Db } from '../db/client';
import { notFound, readJson, type AppEnv } from '../http';
import { getVenue, updateVenueSettings } from '../repos/venue';

/** /api/staff/venue: every role reads it (the dashboard needs the brand); only the owner changes it. */
export function venueSettingsRoutes(db: Db) {
  const routes = new Hono<AppEnv>();

  routes.get('/', requireStaff(db), async (c) => {
    const venue = await getVenue(db, c.get('staff').venueId);
    if (!venue) throw notFound();
    return c.json({ venue });
  });

  routes.put('/', requireStaff(db, { roles: ['owner'] }), async (c) => {
    const settings = await readJson(c, venueSettingsInput);
    const venue = await updateVenueSettings(db, c.get('staff').venueId, settings);
    if (!venue) throw notFound();
    return c.json({ venue });
  });

  return routes;
}
