import { describe, expect, it } from 'vitest';
import type { PilotStats, VenueStats } from '../repos/operator';
import { dailySummaryText } from '../summary';
import { testApi } from '../test/api';
import { connectTestDb } from '../test/db';

const db = connectTestDb();
const SECRET = 'test-cron-secret-0123456789';
const sent: string[] = [];
const { app } = testApi(db, { cronSecret: SECRET, notify: async (text) => (sent.push(text), true) });
const withoutSecret = testApi(db);

const cron = (path: string, secret: string | null = SECRET, api = app) =>
  api.request(`/api/cron${path}`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });

describe('scheduled jobs', () => {
  it("don't exist on a server without a cron secret", async () => {
    expect((await cron('/daily-summary', SECRET, withoutSecret.app)).status).toBe(404);
  });

  // Read from the app itself, so jobs added later are covered too.
  const routes = [...new Set(app.routes.filter((r) => r.method !== 'ALL' && r.path.startsWith('/api/cron/')).map((r) => r.path))];

  it.each(routes)('%s answers 401 without the secret, or with a wrong one', async (path) => {
    for (const secret of [null, 'not-the-secret', `${SECRET}x`]) expect((await cron(path.replace('/api/cron', ''), secret)).status).toBe(401);
  });

  it('send the morning summary to the team', async () => {
    sent.length = 0;
    const res = await cron('/daily-summary');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^☀️ Urdho, yesterday \(\w{3} \d{1,2} \w{3}\)/);
  });
});

describe('the morning summary', () => {
  const venue = (name: string, overrides: Partial<VenueStats> = {}): VenueStats => ({
    venue: { id: name, name, slug: name.toLowerCase(), createdAt: '2026-10-01T00:00:00Z' },
    orders: 0,
    cancelled: 0,
    valueLek: 0,
    tableVisits: 0,
    waiterCalls: 0,
    paid: { cash: { bills: 0, lek: 0 }, card: { bills: 0, lek: 0 } },
    openDays: 1,
    daysWithOrders: 0,
    byDay: [{ date: '2026-10-09', orders: 0 }],
    lastOrderAt: null,
    ...overrides,
  });
  const stats = (venues: VenueStats[]): PilotStats => ({ days: 1, generatedAt: '2026-10-10T07:00:00Z', venues });

  it('lists the busiest venues first, then the open ones that had no orders', () => {
    const text = dailySummaryText(
      stats([
        venue('Kafe Quiet'),
        venue('Bar Kalaja', { orders: 23, valueLek: 41500, tableVisits: 11, waiterCalls: 4, paid: { cash: { bills: 9, lek: 30000 }, card: { bills: 2, lek: 8000 } } }),
        venue('Closed Today', { openDays: 0 }),
        venue('Tavë & Raki', { orders: 1, valueLek: 850, tableVisits: 1 }),
      ]),
    );
    expect(text.split('\n')).toEqual([
      '☀️ Urdho, yesterday (Fri 9 Oct)',
      '24 orders, 42 350 L, at 2 venues',
      '• Bar Kalaja: 23 orders, 41 500 L, 11 tables, 4 waiter calls; paid 38 000 L (cash 30 000 L, card 8000 L)',
      '• Tavë & Raki: 1 order, 850 L, 1 table',
      'Open but no orders: Kafe Quiet',
    ]);
  });

  it('says so on a day without orders, and before the first venue', () => {
    expect(dailySummaryText(stats([venue('Kafe Quiet')]))).toBe('☀️ Urdho, yesterday (Fri 9 Oct)\nNo orders anywhere.\nOpen but no orders: Kafe Quiet');
    expect(dailySummaryText(stats([]))).toBe('☀️ Urdho, yesterday\nNo venues yet.');
  });
});
