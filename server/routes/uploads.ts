import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { PHOTO_KINDS } from '../../shared/schemas';
import { requireStaff } from '../auth/middleware';
import type { Db } from '../db/client';
import { ApiError, forbidden, type AppEnv } from '../http';
import { MAX_UPLOAD_BYTES, processPhoto, type PhotoStorage } from '../photos';

/**
 * /api/staff/uploads?kind=dish|cover|logo, a multipart form with one "file".
 * Dish photos: owner and manager. Cover and logo are venue branding: owner only.
 * Returns { url } of the large version; the small one sits next to it.
 */
export function uploadRoutes(db: Db, storage: PhotoStorage) {
  const routes = new Hono<AppEnv>();

  routes.post(
    '/',
    requireStaff(db, { roles: ['owner', 'manager'] }),
    bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: (c) => c.json({ error: { code: 'file_too_large' } }, 413) }),
    async (c) => {
      const staff = c.get('staff');
      const kind = z.enum(PHOTO_KINDS).safeParse(c.req.query('kind'));
      if (!kind.success) throw new ApiError(400, 'invalid_kind');
      if (kind.data !== 'dish' && staff.role !== 'owner') throw forbidden();

      const form = await c.req.parseBody().catch(() => {
        throw new ApiError(400, 'missing_file');
      });
      const file = form.file;
      if (!(file instanceof File)) throw new ApiError(400, 'missing_file');
      if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'file_too_large');

      const variants = await processPhoto(Buffer.from(await file.arrayBuffer()), kind.data);
      // The venue id in the path keeps each venue's files apart; the random id makes names unguessable.
      const base = `${staff.venueId}/${kind.data}/${randomUUID()}`;
      let url = '';
      for (const variant of variants) {
        const saved = await storage.put(`${base}${variant.suffix}.webp`, variant.data, 'image/webp');
        if (variant.suffix === '') url = saved;
      }
      return c.json({ url }, 201);
    },
  );

  return routes;
}
