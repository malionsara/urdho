import { and, asc, eq, gt, ne, sql } from 'drizzle-orm';
import type { StaffRole, StaffUser } from '../../shared/types';
import type { Db } from '../db/client';
import { staffSession, staffUser } from '../db/schema';
import { newSessionToken, sha256 } from '../auth/crypto';
import type { StaffContext } from '../http';

/*
 * Staff accounts and sessions. Every function takes venueId first, except the two lookups that
 * happen before the venue is known: login (by email) and resolving a session cookie (by token).
 */

const SESSION_DAYS = 30;

const publicColumns = { id: staffUser.id, name: staffUser.name, email: staffUser.email, role: staffUser.role };

/** Login only: an email identifies exactly one account in one venue. */
export async function findStaffByEmail(db: Db, email: string) {
  const [row] = await db
    .select({ ...publicColumns, venueId: staffUser.venueId, passwordHash: staffUser.passwordHash, mustChangePassword: staffUser.mustChangePassword })
    .from(staffUser)
    .where(sql`lower(${staffUser.email}) = ${email.toLowerCase()}`);
  return row;
}

/** Starts a session and returns the token for the cookie. */
export async function createSession(db: Db, venueId: string, staffUserId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(staffSession).values({ venueId, staffUserId, tokenHash: sha256(token), expiresAt });
  return { token, expiresAt };
}

/** Resolves a cookie token. The role is read fresh, so a role change applies on the next request. */
export async function findSession(db: Db, token: string): Promise<StaffContext | undefined> {
  const [row] = await db
    .select({
      sessionId: staffSession.id,
      userId: staffUser.id,
      venueId: staffUser.venueId,
      role: staffUser.role,
      name: staffUser.name,
      email: staffUser.email,
      mustChangePassword: staffUser.mustChangePassword,
    })
    .from(staffSession)
    .innerJoin(staffUser, and(eq(staffUser.id, staffSession.staffUserId), eq(staffUser.venueId, staffSession.venueId)))
    .where(and(eq(staffSession.tokenHash, sha256(token)), gt(staffSession.expiresAt, sql`now()`)));
  return row;
}

export async function deleteSession(db: Db, venueId: string, sessionId: string) {
  await db.delete(staffSession).where(and(eq(staffSession.venueId, venueId), eq(staffSession.id, sessionId)));
}

export async function listStaff(db: Db, venueId: string): Promise<StaffUser[]> {
  return db.select(publicColumns).from(staffUser).where(eq(staffUser.venueId, venueId)).orderBy(asc(staffUser.createdAt));
}

export async function createStaff(
  db: Db,
  venueId: string,
  input: { name: string; email: string; role: StaffRole; passwordHash: string; mustChangePassword: boolean },
): Promise<StaffUser> {
  const [row] = await db
    .insert(staffUser)
    .values({ venueId, ...input })
    .returning(publicColumns);
  return row!;
}

/**
 * Removes an account in this venue; its sessions go with it (cascade). An account that belongs to
 * another venue is 'not_found', exactly like one that doesn't exist.
 */
export async function removeStaff(db: Db, venueId: string, staffId: string): Promise<'removed' | 'not_found' | 'last_owner'> {
  return db.transaction(async (tx) => {
    // Lock the venue's owners so two owners can't remove each other at the same moment.
    const owners = await tx
      .select({ id: staffUser.id })
      .from(staffUser)
      .where(and(eq(staffUser.venueId, venueId), eq(staffUser.role, 'owner')))
      .for('update');
    const [target] = await tx
      .select({ role: staffUser.role })
      .from(staffUser)
      .where(and(eq(staffUser.venueId, venueId), eq(staffUser.id, staffId)));
    if (!target) return 'not_found';
    if (target.role === 'owner' && owners.length === 1) return 'last_owner';
    await tx.delete(staffUser).where(and(eq(staffUser.venueId, venueId), eq(staffUser.id, staffId)));
    return 'removed';
  });
}

export async function findPasswordHash(db: Db, venueId: string, staffId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ passwordHash: staffUser.passwordHash })
    .from(staffUser)
    .where(and(eq(staffUser.venueId, venueId), eq(staffUser.id, staffId)));
  return row?.passwordHash;
}

/** Sets a new password and signs the account out everywhere except the current session. */
export async function setPassword(db: Db, venueId: string, staffId: string, passwordHash: string, keepSessionId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(staffUser)
      .set({ passwordHash, mustChangePassword: false })
      .where(and(eq(staffUser.venueId, venueId), eq(staffUser.id, staffId)));
    await tx
      .delete(staffSession)
      .where(and(eq(staffSession.venueId, venueId), eq(staffSession.staffUserId, staffId), ne(staffSession.id, keepSessionId)));
  });
}
