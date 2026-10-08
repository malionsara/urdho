import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import type { Db } from './db/client';
import { handleError, type AppEnv } from './http';
import type { PhotoStorage } from './photos';
import { menuRoutes } from './routes/menu';
import { staffAuthRoutes } from './routes/staffAuth';
import { teamRoutes } from './routes/team';
import { uploadRoutes } from './routes/uploads';
import { venueSettingsRoutes } from './routes/venueSettings';

/** The whole API. Database and photo storage are passed in, so tests can use their own. */
export function createApp({ db, storage }: { db: Db; storage: PhotoStorage }) {
  const app = new Hono<AppEnv>().basePath('/api');

  // Refuses form posts from other sites; the API itself only accepts JSON and photo uploads.
  app.use('*', csrf());
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

  app.notFound((c) => c.json({ error: { code: 'not_found' } }, 404));
  app.onError(handleError);
  return app;
}

export type App = ReturnType<typeof createApp>;
