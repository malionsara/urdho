import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuestMenu } from '@shared/types';
import { fetchMenu, fetchOrder, placeOrder } from './api';

const menu = { venue: { name: 'Tavë & Raki' }, table: { id: 't1', number: 4 }, categories: [], orderingOpen: true } as unknown as GuestMenu;
const order = { clientRef: 'phone-key', guestName: '', note: '', lines: [] };

/** A fake server: answers each request with the next queued reply, and records what was asked. */
function fakeServer(...replies: (Response | 'offline')[]) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const reply = replies.shift();
    if (!reply || reply === 'offline') throw new TypeError('Failed to fetch');
    return reply;
  });
  return calls;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const refusal = (status: number, code: string) => json(status, { error: { code } });

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the guest menu', () => {
  it('comes from the server, and the copy from last time is shown when the signal drops', async () => {
    fakeServer(json(200, menu), 'offline');
    expect(await fetchMenu('demo', 'demo-4')).toEqual(menu);
    expect(await fetchMenu('demo', 'demo-4')).toEqual({ ...menu, offline: true });
  });

  it('is never borrowed from another table, and a refusal is not treated as being offline', async () => {
    fakeServer(json(200, menu), 'offline', refusal(404, 'table_invalid'));
    await fetchMenu('demo', 'demo-4');
    await expect(fetchMenu('demo', 'demo-5')).rejects.toMatchObject({ code: 'network' });
    await expect(fetchMenu('demo', 'demo-4')).rejects.toMatchObject({ code: 'table_invalid' });
  });
});

describe('the menu request the page starts before the app loads', () => {
  const early = (response: Promise<Response>, url = '/api/guest/demo/t/demo-4/scan') => vi.stubGlobal('window', { __urdhoScan: { url, response } });

  it('is used for the first load of its own table, and only once', async () => {
    early(Promise.resolve(json(200, menu)));
    const calls = fakeServer(json(200, { ...menu, orderingOpen: false }));
    expect(await fetchMenu('demo', 'demo-4')).toEqual(menu);
    expect(calls).toEqual([]);
    expect(await fetchMenu('demo', 'demo-4')).toMatchObject({ orderingOpen: false });
    expect(calls).toEqual(['POST /api/guest/demo/t/demo-4/scan']);
  });

  it("is left alone when it was for another table", async () => {
    early(Promise.resolve(json(200, menu)), '/api/guest/demo/t/demo-1/scan');
    const calls = fakeServer(json(200, menu));
    await fetchMenu('demo', 'demo-4');
    expect(calls).toHaveLength(1);
  });

  it('falls back to the saved menu when the signal dropped', async () => {
    fakeServer(json(200, menu));
    await fetchMenu('demo', 'demo-4');
    early(Promise.reject(new TypeError('Failed to fetch')));
    expect(await fetchMenu('demo', 'demo-4')).toEqual({ ...menu, offline: true });
  });
});

describe('ordering from the phone', () => {
  it('scans the table again once if the session lapsed, then sends the same order', async () => {
    const calls = fakeServer(refusal(401, 'no_session'), json(200, menu), json(201, { orderId: 'o1' }));
    expect(await placeOrder('demo', 'demo-4', order)).toEqual({ orderId: 'o1' });
    expect(calls).toEqual(['POST /api/guest/demo/t/demo-4/orders', 'POST /api/guest/demo/t/demo-4/scan', 'POST /api/guest/demo/t/demo-4/orders']);
  });

  it('gives up after one rescan, and never rescans for other refusals', async () => {
    fakeServer(refusal(401, 'no_session'), json(200, menu), refusal(401, 'no_session'));
    await expect(placeOrder('demo', 'demo-4', order)).rejects.toMatchObject({ status: 401 });

    const calls = fakeServer(refusal(409, 'menu_changed'));
    await expect(placeOrder('demo', 'demo-4', order)).rejects.toMatchObject({ code: 'menu_changed' });
    expect(calls).toHaveLength(1);
  });

  it('reads a paid table as closed, without opening a new session to check', async () => {
    const calls = fakeServer(refusal(401, 'session_closed'));
    await expect(fetchOrder('demo', 'demo-4', 'o1')).rejects.toMatchObject({ code: 'session_closed' });
    expect(calls).toEqual(['GET /api/guest/demo/t/demo-4/orders/o1']);
  });
});
