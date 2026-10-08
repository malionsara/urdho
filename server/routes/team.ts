import { Hono } from 'hono';
import { z } from 'zod';
import { newStaffInput } from '../../shared/schemas';
import { hashPassword, temporaryPassword } from '../auth/crypto';
import { requireStaff } from '../auth/middleware';
import type { Db } from '../db/client';
import { ApiError, isUniqueViolation, notFound, readJson, type AppEnv } from '../http';
import { createStaff, listStaff, removeStaff } from '../repos/staff';

/** /api/staff/team: the owner manages accounts in their own venue. */
export function teamRoutes(db: Db) {
  const routes = new Hono<AppEnv>();
  const owner = requireStaff(db, { roles: ['owner'] });

  routes.get('/', owner, async (c) => c.json({ staff: await listStaff(db, c.get('staff').venueId) }));

  routes.post('/', owner, async (c) => {
    const input = await readJson(c, newStaffInput);
    const password = temporaryPassword();
    try {
      const user = await createStaff(db, c.get('staff').venueId, { ...input, passwordHash: await hashPassword(password), mustChangePassword: true });
      // Shown once to the owner, who passes it on; it is never stored in plain text.
      return c.json({ user, temporaryPassword: password }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError(409, 'email_taken');
      throw error;
    }
  });

  routes.delete('/:id', owner, async (c) => {
    const staff = c.get('staff');
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) throw notFound();
    if (id.data === staff.userId) throw new ApiError(409, 'cannot_remove_self');
    const result = await removeStaff(db, staff.venueId, id.data);
    if (result === 'not_found') throw notFound();
    if (result === 'last_owner') throw new ApiError(409, 'last_owner');
    return c.body(null, 204);
  });

  return routes;
}
