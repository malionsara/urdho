import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { placeOrderInput } from '../../shared/schemas';
import type { GuestMenu } from '../../shared/types';
import type { Db } from '../db/client';
import { ApiError, notFound, readJson } from '../http';
import { isOrderingOpen } from '../ordering/hours';
import { loadMenu } from '../repos/menu';
import { callWaiter, getGuestOrder, isOrderFromClosedSession, placeOrder } from '../repos/orders';
import { findGuestSession, findTableByCode, openOrJoinSession, type ScannedTable } from '../repos/sessions';

/*
 * /api/guest/:slug/t/:qrToken: the guest app, addressed by the table's QR code.
 *
 * Scanning opens or joins the table's session and sets a cookie that only this table's address
 * receives, so a phone that scanned two tables can never send an order to the wrong one.
 * Closing the table (payment) ends the session, and the cookie with it.
 */

export const GUEST_COOKIE = 'urdho_guest';
const COOKIE_HOURS = 12;

type GuestEnv = { Variables: { scanned: ScannedTable; sessionId: string } };

const cookiePath = (c: Context) => `/api/guest/${c.req.param('slug')}/t/${c.req.param('qrToken')}`;

export function guestRoutes(db: Db, secret: string) {
  const routes = new Hono<GuestEnv>();

  // Every guest request starts from the QR code in the address.
  routes.use('*', async (c, next) => {
    const scanned = await findTableByCode(db, c.req.param('slug') ?? '', c.req.param('qrToken') ?? '');
    if (!scanned) throw new ApiError(404, 'table_invalid');
    c.set('scanned', scanned);
    await next();
  });

  const inSession = createMiddleware<GuestEnv>(async (c, next) => {
    const { venue, table } = c.get('scanned');
    const token = getCookie(c, GUEST_COOKIE);
    const session = token ? await findGuestSession(db, venue.id, table.id, token) : undefined;
    if (!session) throw new ApiError(401, 'no_session');
    if (session.status !== 'open') throw new ApiError(401, 'session_closed');
    c.set('sessionId', session.id);
    await next();
  });

  routes.post('/scan', async (c) => {
    const { venue, table } = c.get('scanned');
    const { token } = await openOrJoinSession(db, venue.id, table.id, secret);
    setCookie(c, GUEST_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: new URL(c.req.url).protocol === 'https:',
      path: cookiePath(c),
      maxAge: COOKIE_HOURS * 60 * 60,
    });

    const menu = await loadMenu(db, venue.id);
    const { timezone, openingHours, ...guestVenue } = venue;
    const body: GuestMenu = {
      venue: guestVenue,
      table,
      // Hidden categories and empty ones aren't shown; sold-out dishes are, greyed out.
      categories: menu.categories
        .filter((category) => category.active)
        .map((category) => ({ id: category.id, name: category.name, items: menu.items.filter((i) => i.categoryId === category.id) }))
        .filter((category) => category.items.length > 0),
      orderingOpen: isOrderingOpen(openingHours, timezone),
    };
    return c.json(body);
  });

  routes.post('/orders', inSession, async (c) => {
    const { venue } = c.get('scanned');
    if (!isOrderingOpen(venue.openingHours, venue.timezone)) throw new ApiError(403, 'venue_closed');
    const input = await readJson(c, placeOrderInput);
    const { orderId, created } = await placeOrder(db, venue.id, c.get('sessionId'), input);
    return c.json({ orderId }, created ? 201 : 200);
  });

  routes.get('/orders/:id', inSession, async (c) => {
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) throw notFound();
    const { venue, table } = c.get('scanned');
    const order = await getGuestOrder(db, venue.id, c.get('sessionId'), id.data);
    if (order) return c.json(order);
    // After the table was paid, the next menu load gives this phone a new session. Its earlier
    // order still reads as "table closed", not as an order that never existed.
    if (await isOrderFromClosedSession(db, venue.id, table.id, id.data)) throw new ApiError(401, 'session_closed');
    throw notFound();
  });

  routes.post('/calls', inSession, async (c) => {
    const { venue, table } = c.get('scanned');
    await callWaiter(db, venue.id, c.get('sessionId'), table.id);
    return c.body(null, 204);
  });

  return routes;
}
