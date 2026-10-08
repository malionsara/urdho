import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { StaffRole } from '../../shared/types';
import type { Db } from '../db/client';
import { ApiError, forbidden, unauthorized, type AppEnv } from '../http';
import { findSession } from '../repos/staff';

export const STAFF_COOKIE = 'urdho_staff';

const cookieOptions = (c: Context) =>
  ({
    httpOnly: true,
    sameSite: 'Strict',
    // Vercel serves https; plain http only happens on the dev machine.
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/api',
  }) as const;

export function setSessionCookie(c: Context, token: string, expires: Date) {
  setCookie(c, STAFF_COOKIE, token, { ...cookieOptions(c), expires });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, STAFF_COOKIE, cookieOptions(c));
}

interface Options {
  /** Roles allowed; empty means any signed-in staff member. */
  roles?: StaffRole[];
  /** Let accounts still on a temporary password through (only for me, password and logout). */
  pendingPasswordOk?: boolean;
}

/**
 * Resolves the session cookie to a staff member and their venue, then checks the role.
 * Every staff route uses this; handlers read the venue from c.get('staff'), never from the request.
 */
export function requireStaff(db: Db, { roles = [], pendingPasswordOk = false }: Options = {}) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, STAFF_COOKIE);
    const staff = token ? await findSession(db, token) : undefined;
    if (!staff) {
      if (token) clearSessionCookie(c);
      throw unauthorized();
    }
    if (staff.mustChangePassword && !pendingPasswordOk) throw new ApiError(403, 'password_change_required');
    if (roles.length > 0 && !roles.includes(staff.role)) throw forbidden();
    c.set('staff', staff);
    await next();
  });
}
