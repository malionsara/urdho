import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { bearerToken, sameSecret } from '../auth/crypto';
import type { Db } from '../db/client';
import { notFound, unauthorized } from '../http';
import { pilotStats } from '../repos/operator';
import { applyRetention } from '../retention';
import { dailySummaryText } from '../summary';

/*
 * /api/cron: jobs Vercel runs on a schedule (the "crons" list in vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` with each; without CRON_SECRET on the server the section
 * answers 404, as if it didn't exist.
 */

export interface CronOptions {
  secret: string | undefined;
  /** Delivers a message to the team (Telegram); false when it couldn't. */
  notify: ((text: string) => Promise<boolean>) | undefined;
}

export function cronRoutes(db: Db, { secret, notify }: CronOptions) {
  const routes = new Hono();

  routes.use(
    '*',
    createMiddleware(async (c, next) => {
      if (!secret) throw notFound();
      const given = bearerToken(c.req.header('authorization'));
      if (!given || !sameSecret(given, secret)) throw unauthorized();
      await next();
    }),
  );

  // Every morning: yesterday's service day at each venue. Counted from a moment 24 hours ago, so
  // "today" in pilotStats is yesterday's service day in each venue's own time zone.
  routes.get('/daily-summary', async (c) => {
    const stats = await pilotStats(db, 1, new Date(Date.now() - 86_400_000));
    const sent = notify ? await notify(dailySummaryText(stats)) : false;
    return c.json({ sent, venues: stats.venues.length });
  });

  // Every night after the service day ends: delete what the privacy notice says isn't kept.
  routes.get('/retention', async (c) => c.json(await applyRetention(db)));

  return routes;
}
