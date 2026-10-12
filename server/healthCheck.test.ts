import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { HEALTH_CHECK_SLUG } from '../shared/schemas';
import { venue } from './db/schema';
import { pilotStats, prepareHealthCheck } from './repos/operator';
import { testApi } from './test/api';
import { connectTestDb } from './test/db';
import { failureAlert, runSmokeCheck } from './healthCheck';

const db = connectTestDb();
const TOKEN = 'test-operator-key-0123456789';
const { app, login } = testApi(db, { operatorToken: TOKEN });

const run = (fetch: (url: string, init: RequestInit) => Response | Promise<Response> = (url, init) => app.request(url, init)) =>
  runSmokeCheck({ baseUrl: 'http://localhost', operatorToken: TOKEN, fetch });

describe('the health check', () => {
  it('takes a table from scan to paid, on its first run and on later ones', async () => {
    for (let i = 0; i < 2; i++) {
      const result = await run();
      expect(result.steps.filter((s) => !s.ok)).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.steps.at(-1)?.name).toBe('The waiter signs out');
    }
  });

  it("gives its waiter a new password each run, so an earlier run's password stops working", async () => {
    const first = await prepareHealthCheck(db);
    const second = await prepareHealthCheck(db);
    expect(second.password).not.toBe(first.password);
    expect((await login(first.email, first.password)).status).toBe(401);
    expect((await login(second.email, second.password)).status).toBe(200);
  });

  it('stops at the step that broke and says what the server answered', async () => {
    const result = await run((url, init) =>
      init.method === 'POST' && url.endsWith('/orders') ? Response.json({ error: { code: 'internal' } }, { status: 500 }) : app.request(url, init),
    );
    expect(result.ok).toBe(false);
    expect(result.steps.at(-1)).toMatchObject({ name: 'The guest orders', ok: false });
    expect(result.steps.at(-1)?.problem).toMatch(/answered 500 internal \(expected 201\)/);
  });

  it("writes the failed step and the server's answer into the alert", async () => {
    const result = await run((url, init) =>
      init.method === 'POST' && url.endsWith('/orders') ? Response.json({ error: { code: 'internal' } }, { status: 500 }) : app.request(url, init),
    );
    const alert = failureAlert(result, 'https://urdho.al');
    expect(alert).toContain('Urdho health check failed on https://urdho.al');
    expect(alert).toContain('Step: The guest orders');
    expect(alert).toMatch(/answered 500 internal/);
    expect(alert).toContain(`${result.steps.length - 1} of ${result.steps.length} steps passed.`);
  });

  it('says so when the site cannot be reached', async () => {
    const result = await run(() => Promise.reject(new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } })));
    expect(result.steps).toEqual([expect.objectContaining({ name: 'The API answers', ok: false, problem: 'fetch failed: ENOTFOUND' })]);
  });

  it('stays out of the pilot numbers', async () => {
    await run();
    const stats = await pilotStats(db, 14);
    expect(stats.venues.map((v) => v.venue.slug)).not.toContain(HEALTH_CHECK_SLUG);
  });

  it("keeps its address to itself, and never takes over a venue that isn't its own", async () => {
    const taken = await app.request('/api/operator/venues', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Imposter', slug: HEALTH_CHECK_SLUG, ownerName: 'X', ownerEmail: 'x@example.test', tables: 1 }),
    });
    expect(taken.status).toBe(400);

    // A venue on the address without the check's account (only possible straight in the database).
    await db.delete(venue).where(eq(venue.slug, HEALTH_CHECK_SLUG));
    await db.insert(venue).values({ name: 'Someone else', slug: HEALTH_CHECK_SLUG, openingHours: [] });
    try {
      await expect(prepareHealthCheck(db)).rejects.toMatchObject({ status: 409, code: 'slug_taken' });
    } finally {
      await db.delete(venue).where(eq(venue.slug, HEALTH_CHECK_SLUG));
    }
    expect((await run()).ok).toBe(true);
  });
});
