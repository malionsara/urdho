import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { orderStatusInput, payInput } from '../../shared/schemas';
import { requireStaff } from '../auth/middleware';
import type { Db } from '../db/client';
import { notFound, readJson, type AppEnv } from '../http';
import type { PaymentProvider } from '../payments/provider';
import { acknowledgeCall, closeEmptySession, loadBoard, loadTables, paySession, setOrderStatus } from '../repos/orders';
import { addTable, listQrTables, resetQrToken } from '../repos/sessions';
import { getVenue } from '../repos/venue';

/**
 * /api/staff: running service. Every role works the board and the tables (waiters close bills);
 * QR codes and adding tables are for owner and manager.
 */
export function serviceRoutes(db: Db, payments: PaymentProvider) {
  const routes = new Hono<AppEnv>();
  const anyStaff = requireStaff(db);
  const managers = requireStaff(db, { roles: ['owner', 'manager'] });

  routes.get('/board', anyStaff, async (c) => c.json(await loadBoard(db, c.get('staff').venueId)));

  routes.patch('/orders/:id', anyStaff, async (c) => {
    const { status } = await readJson(c, orderStatusInput);
    await setOrderStatus(db, c.get('staff').venueId, idParam(c), status);
    return c.body(null, 204);
  });

  routes.post('/calls/:id/acknowledge', anyStaff, async (c) => {
    const staff = c.get('staff');
    await acknowledgeCall(db, staff.venueId, idParam(c), staff.userId);
    return c.body(null, 204);
  });

  routes.get('/tables', anyStaff, async (c) => c.json({ tables: await loadTables(db, c.get('staff').venueId) }));

  routes.post('/sessions/:id/pay', anyStaff, async (c) => {
    const { method } = await readJson(c, payInput);
    return c.json(await paySession(db, c.get('staff').venueId, idParam(c), method, payments));
  });

  routes.post('/sessions/:id/close', anyStaff, async (c) => {
    await closeEmptySession(db, c.get('staff').venueId, idParam(c));
    return c.body(null, 204);
  });

  routes.get('/qr', managers, async (c) => {
    const venueId = c.get('staff').venueId;
    const venue = await getVenue(db, venueId);
    if (!venue) throw notFound();
    return c.json({ venue, tables: await listQrTables(db, venueId) });
  });

  routes.post('/tables', managers, async (c) => c.json({ table: await addTable(db, c.get('staff').venueId) }, 201));

  routes.post('/tables/:id/reset-qr', managers, async (c) => {
    const table = await resetQrToken(db, c.get('staff').venueId, idParam(c));
    if (!table) throw notFound();
    return c.json({ table });
  });

  return routes;
}

function idParam(c: Context): string {
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) throw notFound();
  return id.data;
}
