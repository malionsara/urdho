import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app';
import { hashPassword } from '../auth/crypto';
import { staffUser } from '../db/schema';
import { diskStorage } from '../photos';
import { makeVenue } from './db';
import type { connectTestDb } from './db';

type Db = ReturnType<typeof connectTestDb>;

export const PASSWORD = 'correct horse battery';
let passwordHash: Promise<string> | undefined;

interface CallOptions {
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
}

/** The API against the test database, called in-process the way the browser would call it. */
export function testApi(db: Db) {
  // Uploaded photos land in a throwaway folder.
  const uploadDir = mkdtempSync(join(tmpdir(), 'urdho-uploads-'));
  const app = createApp({ db, storage: diskStorage(uploadDir, '/uploads') });

  async function call(method: string, path: string, { body, cookie, headers = {} }: CallOptions = {}) {
    const requestHeaders: Record<string, string> = {
      // Browsers send Origin and Sec-Fetch-Site with every fetch that changes something; so do we.
      ...(method === 'GET' ? {} : { origin: 'http://localhost', 'sec-fetch-site': 'same-origin' }),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    };
    const res = await app.request(path, { method, headers: requestHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
    const json = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
    // Tests read whatever shape each endpoint returns; typing every response here would add nothing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, body: json as Record<string, any> | null, headers: res.headers };
  }

  /** Signs in and returns the cookie to send with later calls. */
  async function login(email: string, password = PASSWORD) {
    const res = await call('POST', '/api/staff/login', { body: { email, password } });
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    return { ...res, cookie: cookie ?? '' };
  }

  return { app, call, login, uploadDir };
}

/** A venue with an owner, a manager and a waiter, all with PASSWORD. Emails are unique per call. */
export async function makeVenueWithStaff(db: Db, label: string) {
  const v = await makeVenue(db, label);
  passwordHash ??= hashPassword(PASSWORD);
  const hash = await passwordHash;
  const tag = v.slug;
  const [owner, manager, waiter] = await db
    .insert(staffUser)
    .values([
      { venueId: v.venueId, name: `${label} Owner`, email: `owner@${tag}.test`, role: 'owner', passwordHash: hash },
      { venueId: v.venueId, name: `${label} Manager`, email: `manager@${tag}.test`, role: 'manager', passwordHash: hash },
      { venueId: v.venueId, name: `${label} Waiter`, email: `waiter@${tag}.test`, role: 'waiter', passwordHash: hash },
    ])
    .returning({ id: staffUser.id, email: staffUser.email });
  return { ...v, owner: owner!, manager: manager!, waiter: waiter! };
}
