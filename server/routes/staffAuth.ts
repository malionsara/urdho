import { Hono } from 'hono';
import { loginInput, passwordChangeInput } from '../../shared/schemas';
import { hashPassword, verifyAgainstNothing, verifyPassword } from '../auth/crypto';
import { clearSessionCookie, requireStaff, setSessionCookie } from '../auth/middleware';
import type { Db } from '../db/client';
import { ApiError, readJson, type AppEnv, type StaffContext } from '../http';
import { createSession, deleteSession, findPasswordHash, findStaffByEmail, setPassword } from '../repos/staff';
import { getVenue } from '../repos/venue';

const toUser = (s: Pick<StaffContext, 'name' | 'email' | 'role' | 'mustChangePassword'> & { id: string }) => ({
  id: s.id,
  name: s.name,
  email: s.email,
  role: s.role,
  mustChangePassword: s.mustChangePassword,
});

/** /api/staff: login, logout, who am I, change password. */
export function staffAuthRoutes(db: Db) {
  const routes = new Hono<AppEnv>();
  const signedIn = requireStaff(db, { pendingPasswordOk: true });

  routes.post('/login', async (c) => {
    const { email, password } = await readJson(c, loginInput);
    const account = await findStaffByEmail(db, email);
    const valid = account ? await verifyPassword(password, account.passwordHash) : await verifyAgainstNothing(password);
    // One answer for a wrong email and a wrong password, so nobody can probe which accounts exist.
    if (!account || !valid) throw new ApiError(401, 'invalid_login');

    const { token, expiresAt } = await createSession(db, account.venueId, account.id);
    setSessionCookie(c, token, expiresAt);
    return c.json({ user: toUser(account), venue: await getVenue(db, account.venueId) });
  });

  routes.post('/logout', signedIn, async (c) => {
    const staff = c.get('staff');
    await deleteSession(db, staff.venueId, staff.sessionId);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  routes.get('/me', signedIn, async (c) => {
    const staff = c.get('staff');
    return c.json({ user: toUser({ ...staff, id: staff.userId }), venue: await getVenue(db, staff.venueId) });
  });

  routes.post('/password', signedIn, async (c) => {
    const staff = c.get('staff');
    const { currentPassword, newPassword } = await readJson(c, passwordChangeInput);
    const hash = await findPasswordHash(db, staff.venueId, staff.userId);
    if (!hash || !(await verifyPassword(currentPassword, hash))) throw new ApiError(403, 'wrong_password');
    if (currentPassword === newPassword) throw new ApiError(400, 'same_password');
    await setPassword(db, staff.venueId, staff.userId, await hashPassword(newPassword), staff.sessionId);
    return c.body(null, 204);
  });

  return routes;
}
