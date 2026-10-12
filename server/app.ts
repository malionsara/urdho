import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import type { Db } from './db/client';
import type { ServerErrorAlert } from './alerts';
import type { HealthCheckTarget } from './healthCheck';
import { errorHandler, type AppEnv } from './http';
import { cashProvider, type PaymentProvider } from './payments/provider';
import type { PhotoStorage } from './photos';
import { cronRoutes } from './routes/cron';
import { guestRoutes } from './routes/guest';
import { menuRoutes } from './routes/menu';
import { operatorRoutes } from './routes/operator';
import { serviceRoutes } from './routes/service';
import { staffAuthRoutes } from './routes/staffAuth';
import { teamRoutes } from './routes/team';
import { uploadRoutes } from './routes/uploads';
import { venueSettingsRoutes } from './routes/venueSettings';

export interface AppOptions {
  db: Db;
  storage: PhotoStorage;
  /** Signs guest session tokens; GUEST_SESSION_SECRET in the environment. */
  guestSecret: string;
  payments?: PaymentProvider;
  /** Unlocks /api/operator (OPERATOR_TOKEN); without it that section doesn't exist. */
  operatorToken?: string;
  /** Told about every unexpected error (a bug, answered 500): the live site sends it to Telegram. */
  onUnexpectedError?: ServerErrorAlert;
  /** Unlocks /api/cron (CRON_SECRET, sent by Vercel's scheduled jobs); without it that section doesn't exist. */
  cronSecret?: string;
  /** Delivers the scheduled reports to the team (Telegram on the live site). */
  notify?: (text: string) => Promise<boolean>;
  /** The live site, for the morning health check (/api/cron/health-check). It also needs operatorToken. */
  healthCheck?: HealthCheckTarget;
}

/** The whole API. Its dependencies are passed in, so tests can use their own. */
export function createApp({ db, storage, guestSecret, payments = cashProvider, operatorToken, onUnexpectedError, cronSecret, notify, healthCheck }: AppOptions) {
  const app = new Hono<AppEnv>().basePath('/api');

  // Refuses form posts from other sites; the API itself only accepts JSON and photo uploads.
  // The operator tools authenticate with a key in a header, which no other site can send.
  const sameSiteOnly = csrf();
  app.use('*', (c, next) => (c.req.path.startsWith('/api/operator/') ? next() : sameSiteOnly(c, next)));
  // Responses carry venue data: never let a browser or proxy cache them.
  app.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.get('/health', (c) => c.json({ ok: true }));
  app.route('/staff', staffAuthRoutes(db));
  app.route('/staff/team', teamRoutes(db));
  app.route('/staff/venue', venueSettingsRoutes(db));
  app.route('/staff/menu', menuRoutes(db));
  app.route('/staff/uploads', uploadRoutes(db, storage));
  app.route('/staff', serviceRoutes(db, payments));
  app.route('/guest/:slug/t/:qrToken', guestRoutes(db, guestSecret));
  app.route('/operator', operatorRoutes(db, operatorToken));
  app.route('/cron', cronRoutes(db, { secret: cronSecret, notify, operatorToken, healthCheck }));

  app.notFound((c) => c.json({ error: { code: 'not_found' } }, 404));
  // The route's pattern (/api/guest/:slug/t/:qrToken/orders), never the address itself with its codes and ids.
  app.onError(errorHandler(onUnexpectedError && ((error, c) => onUnexpectedError(error, { method: c.req.method, route: c.req.routePath }))));
  return app;
}

export type App = ReturnType<typeof createApp>;
