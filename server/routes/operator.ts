import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { newVenueInput, staffPasswordResetInput } from '../../shared/schemas';
import { bearerToken, sameSecret } from '../auth/crypto';
import type { Db } from '../db/client';
import { notFound, readJson, unauthorized } from '../http';
import { createVenueWithOwner, pilotStats, prepareHealthCheck, resetStaffPassword } from '../repos/operator';

/*
 * /api/operator: the Urdho team's tools for the pilot (pnpm venue:create --live, pnpm pilot:stats
 * --live, pnpm staff:reset-password --live, pnpm smoke --live). Every request needs `Authorization: Bearer <OPERATOR_TOKEN>`. Without an OPERATOR_TOKEN
 * on the server, the whole section answers 404, as if it didn't exist.
 */

export function operatorRoutes(db: Db, token: string | undefined) {
  const routes = new Hono();

  routes.use(
    '*',
    createMiddleware(async (c, next) => {
      if (!token) throw notFound();
      const given = bearerToken(c.req.header('authorization'));
      if (!given || !sameSecret(given, token)) throw unauthorized();
      await next();
    }),
  );

  routes.post('/venues', async (c) => {
    const input = await readJson(c, newVenueInput);
    return c.json(await createVenueWithOwner(db, input), 201);
  });

  routes.post('/staff/password-reset', async (c) => {
    const { email } = await readJson(c, staffPasswordResetInput);
    const reset = await resetStaffPassword(db, email);
    if (!reset) throw notFound();
    return c.json(reset);
  });

  // The health check's venue, and a fresh password for its waiter account.
  routes.post('/health-check', async (c) => c.json(await prepareHealthCheck(db)));

  routes.get('/stats', async (c) => {
    const days = z.coerce.number().int().min(1).max(90).catch(14).parse(c.req.query('days'));
    return c.json(await pilotStats(db, days));
  });

  return routes;
}
