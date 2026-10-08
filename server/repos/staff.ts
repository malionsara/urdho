import { and, asc, eq, gt, lt, ne, or, sql } from 'drizzle-orm';
import type { StaffRole, StaffUser } from '../../shared/types';
import type { Db } from '../db/client';
import { loginFailure, staffSession, staffUser } from '../db/schema';
import { newSessionToken, sha256 } from '../auth/crypto';
import type { StaffContext } from '../http';

/*
 * Staff accounts and sessions. Every function takes venueId first, except what happens before the
 * venue is known: login (by email, with its failed-attempt limit) and resolving a session cookie.
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

/**
 * Failed sign-ins allowed per 15 minutes: for one account from one address, for one account from
 * anywhere (stops guessing from many addresses), and from one address across accounts. Keying the
 * first limit by address means nobody can lock an owner out from somewhere else.
 */
export const LOGIN_LIMIT = { minutes: 15, accountAtAddress: 5, account: 50, address: 30 };

/** Login only: whether this email and address have failed too often lately. */
export async function isLoginBlocked(db: Db, email: string, ip: string): Promise<boolean> {
  const account = email.toLowerCase();
  const knownAddress = ip !== '';
  const [counts] = await db
    .select({
      accountAtAddress: sql<number>`count(*) filter (where ${loginFailure.email} = ${account} and ${loginFailure.ip} = ${ip})::int`,
      account: sql<number>`count(*) filter (where ${loginFailure.email} = ${account})::int`,
      address: sql<number>`count(*) filter (where ${loginFailure.ip} = ${ip})::int`,
    })
    .from(loginFailure)
    .where(
      and(
        gt(loginFailure.createdAt, sql`now() - make_interval(mins => ${LOGIN_LIMIT.minutes})`),
        knownAddress ? or(eq(loginFailure.email, account), eq(loginFailure.ip, ip)) : eq(loginFailure.email, account),
      ),
    );
  if (!counts) return false;
  return (
    counts.accountAtAddress >= LOGIN_LIMIT.accountAtAddress ||
    counts.account >= LOGIN_LIMIT.account ||
    // Without a known address (local development) every request would share one bucket.
    (knownAddress && counts.address >= LOGIN_LIMIT.address)
  );
}

/** Login only: notes a failed sign-in, and forgets ones older than a day. */
export async function recordLoginFailure(db: Db, email: string, ip: string) {
  await db.insert(loginFailure).values({ email: email.toLowerCase(), ip });
  await db.delete(loginFailure).where(lt(loginFailure.createdAt, sql`now() - interval '1 day'`));
}

/** Login only: a successful sign-in clears this account's recent typos from this address. */
export async function clearLoginFailures(db: Db, email: string, ip: string) {
  await db.delete(loginFailure).where(and(eq(loginFailure.email, email.toLowerCase()), eq(loginFailure.ip, ip)));
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
