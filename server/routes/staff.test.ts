import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { loginFailure, staffSession, staffUser, venue } from '../db/schema';
import { LOGIN_LIMIT } from '../repos/staff';
import { makeVenueWithStaff, PASSWORD, testApi } from '../test/api';
import { connectTestDb } from '../test/db';

const db = connectTestDb();
const { app, call, login } = testApi(db);

const venueSettings = {
  name: 'Renamed',
  logoUrl: null,
  coverUrl: '/demo/cover.webp',
  brandColor: '#1F5E45',
  languages: ['sq', 'en'],
  defaultLanguage: 'sq',
  timezone: 'Europe/Tirane',
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: day !== 0, from: '09:00', to: '22:00' })),
};

describe('every staff route needs a signed-in session', () => {
  // Read from the app itself, so routes added later are covered without editing this test.
  const routes = [...new Map(app.routes.filter((r) => r.method !== 'ALL' && r.path.startsWith('/api/staff')).map((r) => [`${r.method} ${r.path}`, r])).values()];

  it('finds the staff routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(8);
  });

  it.each(routes.filter((r) => r.path !== '/api/staff/login').map((r) => [r.method, r.path]))('%s %s answers 401 without a session', async (method, path) => {
    const res = await call(method, path.replace(/:\w+/g, randomUUID()), { body: method === 'GET' ? undefined : {} });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'unauthorized' } });
  });

  it('answers 401 for a made-up session cookie', async () => {
    expect((await call('GET', '/api/staff/me', { cookie: 'urdho_staff=not-a-real-token' })).status).toBe(401);
  });

  it('refuses a form posted from another site, even with a valid session', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const { cookie } = await login(v.owner.email);
    const res = await call('POST', '/api/staff/logout', {
      cookie,
      headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.status).toBe(403);
    expect((await call('GET', '/api/staff/me', { cookie })).status).toBe(200);
  });
});

describe('signing in and out', () => {
  it('signs in with the right password and sets a locked-down cookie', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const res = await login(v.waiter.email);
    expect(res.status).toBe(200);
    expect(res.body?.user).toMatchObject({ email: v.waiter.email, role: 'waiter', mustChangePassword: false });
    expect(res.body?.venue).toMatchObject({ id: v.venueId });
    expect(JSON.stringify(res.body)).not.toContain('scrypt');

    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^urdho_staff=[\w-]{40,};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const wrongPassword = await login(v.owner.email, 'not the password');
    const unknownEmail = await login('nobody@nowhere.test');
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.cookie).toBe('');
  });

  it('accepts the email in any capitalisation', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    expect((await login(v.owner.email.toUpperCase())).status).toBe(200);
  });

  it('knows who is signed in, and forgets them after logout', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const { cookie } = await login(v.manager.email);
    expect((await call('GET', '/api/staff/me', { cookie })).body?.user).toMatchObject({ role: 'manager' });

    expect((await call('POST', '/api/staff/logout', { cookie })).status).toBe(204);
    expect((await call('GET', '/api/staff/me', { cookie })).status).toBe(401);
  });

  it('ends a session when it expires', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const { cookie } = await login(v.owner.email);
    await db.update(staffSession).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(staffSession.staffUserId, v.owner.id));
    expect((await call('GET', '/api/staff/me', { cookie })).status).toBe(401);
  });

  it('applies a role change on the very next request', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const { cookie } = await login(v.manager.email);
    await db.update(staffUser).set({ role: 'waiter' }).where(eq(staffUser.id, v.manager.id));
    expect((await call('GET', '/api/staff/me', { cookie })).body?.user).toMatchObject({ role: 'waiter' });
  });
});

describe('guessing passwords', () => {
  let n = 0;
  const address = () => `203.0.113.${++n}`;
  const attempt = (email: string, password: string, ip: string) =>
    call('POST', '/api/staff/login', { body: { email, password }, headers: { 'x-real-ip': ip } });

  it(`stops one address after ${LOGIN_LIMIT.accountAtAddress} wrong passwords for an account, even for the right one`, async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const ip = address();
    for (let i = 0; i < LOGIN_LIMIT.accountAtAddress; i++) expect((await attempt(v.owner.email, 'wrong guess', ip)).status).toBe(401);
    const blocked = await attempt(v.owner.email, PASSWORD, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: { code: 'too_many_attempts' } });
    expect(blocked.headers.get('set-cookie')).toBeNull();
  });

  it('never locks the real owner out from another address, and lifts the block after 15 minutes', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const attacker = address();
    for (let i = 0; i < LOGIN_LIMIT.accountAtAddress; i++) await attempt(v.owner.email, 'wrong guess', attacker);
    expect((await attempt(v.owner.email, PASSWORD, address())).status).toBe(200);

    await db.execute(sql`update login_failure set created_at = now() - interval '16 minutes' where ip = ${attacker}`);
    expect((await attempt(v.owner.email, PASSWORD, attacker)).status).toBe(200);
  });

  it('forgets earlier typos once the right password goes through', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const ip = address();
    for (let i = 0; i < LOGIN_LIMIT.accountAtAddress - 1; i++) await attempt(v.owner.email, 'typo', ip);
    expect((await attempt(v.owner.email, PASSWORD, ip)).status).toBe(200);
    expect((await attempt(v.owner.email, 'typo', ip)).status).toBe(401);
    expect((await attempt(v.owner.email, PASSWORD, ip)).status).toBe(200);
  });

  it(`stops one address trying many accounts after ${LOGIN_LIMIT.address} failures`, async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const ip = address();
    for (let i = 0; i < LOGIN_LIMIT.address; i++) await attempt(`guess-${i}-${ip}@nowhere.test`, 'wrong guess', ip);
    expect((await attempt(v.waiter.email, PASSWORD, ip)).status).toBe(429);
  });

  it('forgets failed sign-ins after a day, at the next sign-in attempt by anyone', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const old = await db.insert(loginFailure).values({ email: 'old@example.test', ip: address(), createdAt: sql`now() - interval '25 hours'` }).returning({ id: loginFailure.id });
    await attempt(v.waiter.email, PASSWORD, address());
    expect(await db.select().from(loginFailure).where(eq(loginFailure.id, old[0]!.id))).toEqual([]);
  });

  it(`stops guessing one account from many addresses after ${LOGIN_LIMIT.account} failures`, async () => {
    const v = await makeVenueWithStaff(db, 'A');
    await db.insert(loginFailure).values(Array.from({ length: LOGIN_LIMIT.account }, () => ({ email: v.manager.email.toLowerCase(), ip: address() })));
    expect((await attempt(v.manager.email, PASSWORD, address())).status).toBe(429);
  });
});

describe('roles', () => {
  it('lets only the owner manage staff and settings', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const owner = (await login(v.owner.email)).cookie;
    const manager = (await login(v.manager.email)).cookie;
    const waiter = (await login(v.waiter.email)).cookie;

    expect((await call('GET', '/api/staff/team', { cookie: owner })).status).toBe(200);
    expect((await call('GET', '/api/staff/team', { cookie: manager })).status).toBe(403);
    expect((await call('GET', '/api/staff/team', { cookie: waiter })).status).toBe(403);

    expect((await call('PUT', '/api/staff/venue', { cookie: manager, body: venueSettings })).status).toBe(403);
    expect((await call('PUT', '/api/staff/venue', { cookie: owner, body: venueSettings })).status).toBe(200);
  });

  it('lets every role read the venue, which the dashboard needs for its colours', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const { cookie } = await login(v.waiter.email);
    expect((await call('GET', '/api/staff/venue', { cookie })).body?.venue).toMatchObject({ id: v.venueId });
  });
});

describe('tenancy: venue A can never see or change venue B', () => {
  it("lists only the caller's own staff", async () => {
    const a = await makeVenueWithStaff(db, 'A');
    const b = await makeVenueWithStaff(db, 'B');
    const { cookie } = await login(a.owner.email);
    const emails = (await call('GET', '/api/staff/team', { cookie })).body?.staff.map((s: { email: string }) => s.email);
    expect(emails.sort()).toEqual([a.owner.email, a.manager.email, a.waiter.email].sort());
    expect(emails).not.toContain(b.owner.email);
  });

  it("answers 404 when removing another venue's staff, and leaves them alone", async () => {
    const a = await makeVenueWithStaff(db, 'A');
    const b = await makeVenueWithStaff(db, 'B');
    const { cookie } = await login(a.owner.email);
    expect((await call('DELETE', `/api/staff/team/${b.waiter.id}`, { cookie })).status).toBe(404);
    expect((await login(b.waiter.email)).status).toBe(200);
  });

  it("returns the caller's own venue only", async () => {
    const a = await makeVenueWithStaff(db, 'A');
    await makeVenueWithStaff(db, 'B');
    const { cookie } = await login(a.waiter.email);
    expect((await call('GET', '/api/staff/venue', { cookie })).body?.venue.id).toBe(a.venueId);
  });

  it('takes the venue from the session, never from the request body', async () => {
    const a = await makeVenueWithStaff(db, 'A');
    const b = await makeVenueWithStaff(db, 'B');
    const { cookie } = await login(a.owner.email);
    const res = await call('PUT', '/api/staff/venue', { cookie, body: { ...venueSettings, id: b.venueId, venueId: b.venueId, slug: 'hijacked' } });
    expect(res.status).toBe(200);
    expect(res.body?.venue.id).toBe(a.venueId);

    const [untouched] = await db.select({ name: venue.name, slug: venue.slug }).from(venue).where(eq(venue.id, b.venueId));
    expect(untouched).toEqual({ name: 'B', slug: b.slug });
    const [renamed] = await db.select({ slug: venue.slug }).from(venue).where(eq(venue.id, a.venueId));
    expect(renamed!.slug).toBe(a.slug);
  });

  it("refuses an email that already belongs to another venue's account", async () => {
    const a = await makeVenueWithStaff(db, 'A');
    const b = await makeVenueWithStaff(db, 'B');
    const { cookie } = await login(a.owner.email);
    const res = await call('POST', '/api/staff/team', { cookie, body: { name: 'Copy', email: b.waiter.email, role: 'waiter' } });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'email_taken' } });
  });
});

describe('accounts and passwords', () => {
  it('creates an account with a temporary password that must be changed before anything else', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const owner = (await login(v.owner.email)).cookie;
    const email = `new-${randomUUID()}@a.test`;
    const created = await call('POST', '/api/staff/team', { cookie: owner, body: { name: '  Dea Marku ', email: email.toUpperCase(), role: 'waiter' } });
    expect(created.status).toBe(201);
    expect(created.body?.user).toMatchObject({ name: 'Dea Marku', email, role: 'waiter' });
    const temporary = created.body?.temporaryPassword as string;

    const [stored] = await db.select({ hash: staffUser.passwordHash }).from(staffUser).where(eq(staffUser.email, email));
    expect(stored!.hash).not.toContain(temporary);

    const first = await login(email, temporary);
    expect(first.body?.user.mustChangePassword).toBe(true);
    expect((await call('GET', '/api/staff/venue', { cookie: first.cookie })).body).toEqual({ error: { code: 'password_change_required' } });

    const wrong = await call('POST', '/api/staff/password', { cookie: first.cookie, body: { currentPassword: 'nope', newPassword: 'a-brand-new-password' } });
    expect(wrong.status).toBe(403);

    const changed = await call('POST', '/api/staff/password', { cookie: first.cookie, body: { currentPassword: temporary, newPassword: 'a-brand-new-password' } });
    expect(changed.status).toBe(204);
    expect((await call('GET', '/api/staff/venue', { cookie: first.cookie })).status).toBe(200);
    expect((await login(email, temporary)).status).toBe(401);
    expect((await login(email, 'a-brand-new-password')).status).toBe(200);
  });

  it('signs the account out on other devices when the password changes', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const tablet = (await login(v.manager.email)).cookie;
    const phone = (await login(v.manager.email)).cookie;
    await call('POST', '/api/staff/password', { cookie: phone, body: { currentPassword: PASSWORD, newPassword: 'another-long-password' } });
    expect((await call('GET', '/api/staff/me', { cookie: phone })).status).toBe(200);
    expect((await call('GET', '/api/staff/me', { cookie: tablet })).status).toBe(401);
  });

  it('signs a removed account out at once', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const owner = (await login(v.owner.email)).cookie;
    const waiter = (await login(v.waiter.email)).cookie;
    expect((await call('DELETE', `/api/staff/team/${v.waiter.id}`, { cookie: owner })).status).toBe(204);
    expect((await call('GET', '/api/staff/me', { cookie: waiter })).status).toBe(401);
  });

  it("won't let an owner remove themselves, or the venue lose its last owner", async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const owner = (await login(v.owner.email)).cookie;
    expect((await call('DELETE', `/api/staff/team/${v.owner.id}`, { cookie: owner })).body).toEqual({ error: { code: 'cannot_remove_self' } });

    // A second owner can remove the first, but not once only one is left.
    const second = await call('POST', '/api/staff/team', { cookie: owner, body: { name: 'Second', email: `second-${randomUUID()}@a.test`, role: 'owner' } });
    const secondCookie = (await login(second.body?.user.email, second.body?.temporaryPassword)).cookie;
    await call('POST', '/api/staff/password', { cookie: secondCookie, body: { currentPassword: second.body?.temporaryPassword, newPassword: 'second-owner-password' } });
    expect((await call('DELETE', `/api/staff/team/${v.owner.id}`, { cookie: secondCookie })).status).toBe(204);
  });

  it('rejects bad input with a code per field, not a crash', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const { cookie } = await login(v.owner.email);
    const res = await call('POST', '/api/staff/team', { cookie, body: { name: '', email: 'not-an-email', role: 'chef' } });
    expect(res.status).toBe(400);
    expect(res.body?.error.code).toBe('invalid_request');
    expect(res.body?.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'name', 'role']);

    const badJson = await app.request('/api/staff/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    expect(badJson.status).toBe(400);
  });

  it('keeps the default language among the languages a venue offers', async () => {
    const v = await makeVenueWithStaff(db, 'A');
    const { cookie } = await login(v.owner.email);
    const res = await call('PUT', '/api/staff/venue', { cookie, body: { ...venueSettings, languages: ['en'], defaultLanguage: 'sq' } });
    expect(res.status).toBe(400);
    expect(res.body?.error.details).toEqual([{ path: 'defaultLanguage', code: 'default_language_not_offered' }]);
  });
});
