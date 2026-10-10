import { Hono } from 'hono';
import { setupMarkInput, venueSettingsInput } from '../../shared/schemas';
import { requireStaff } from '../auth/middleware';
import type { Db } from '../db/client';
import { notFound, readJson, type AppEnv } from '../http';
import { loadSetup, setSetupMark } from '../repos/setup';
import { getVenue, updateVenueSettings } from '../repos/venue';

/**
 * /api/staff/venue: every role reads it (the dashboard needs the brand); only the owner changes it.
 * /setup is the owner's get-started checklist.
 */
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

  const owner = requireStaff(db, { roles: ['owner'] });

  routes.get('/setup', owner, async (c) => {
    const setup = await loadSetup(db, c.get('staff').venueId);
    if (!setup) throw notFound();
    return c.json({ setup });
  });

  routes.post('/setup', owner, async (c) => {
    const { mark, done } = await readJson(c, setupMarkInput);
    const venueId = c.get('staff').venueId;
    await setSetupMark(db, venueId, mark, done);
    return c.json({ setup: await loadSetup(db, venueId) });
  });

  return routes;
}
