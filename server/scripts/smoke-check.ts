import { randomUUID } from 'node:crypto';
import { unitPriceLek } from '../../shared/pricing';
import type { GuestMenu, PlacedOrder } from '../../shared/types';

/*
 * The health check behind `pnpm smoke`: one table's whole evening through the real API, called the
 * way the guest's phone and the dashboard call it. A guest scans and orders, the order and a waiter
 * call reach the board, the kitchen serves it, the waiter takes cash and the table closes.
 *
 * It orders from its own venue (urdho-check, prepared through /api/operator), never from a
 * restaurant's. It stops at the first step that fails and says what the server answered.
 */

type Fetch = (url: string, init: RequestInit) => Response | Promise<Response>;

export interface SmokeOptions {
  /** The site, e.g. https://urdho.al, without a trailing slash. */
  baseUrl: string;
  operatorToken: string;
  fetch?: Fetch;
  /** Also load the page and the files a phone downloads first. Only a deployed site serves them. */
  site?: boolean;
  /** Called as each step finishes, to print progress. */
  onStep?: (step: StepResult) => void;
}

export interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  /** What went wrong, for a failed step. */
  problem?: string;
}

export interface SmokeResult {
  ok: boolean;
  steps: StepResult[];
  ms: number;
}

interface CallOptions {
  body?: unknown;
  operator?: boolean;
  status?: number;
  /** The error code a failure status must carry. */
  code?: string;
}

interface BoardOrder {
  id: string;
  sessionId: string;
  totalLek: number;
}

class Stop extends Error {}

const QUANTITY = 2;

/** The error, and for a request that never got an answer, why (e.g. "fetch failed: ENOTFOUND"). */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return cause ? `${error.message}: ${cause.code ?? cause.message}` : error.message;
}

export async function runSmokeCheck({ baseUrl, operatorToken, fetch: send = fetch, site = false, onStep }: SmokeOptions): Promise<SmokeResult> {
  const started = performance.now();
  const steps: StepResult[] = [];
  const cookies = new Map<string, string>();

  async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
    const from = performance.now();
    try {
      const value = await run();
      record({ name, ok: true, ms: performance.now() - from });
      return value;
    } catch (error) {
      record({ name, ok: false, ms: performance.now() - from, problem: describe(error) });
      throw new Stop();
    }
  }
  function record(result: StepResult) {
    steps.push(result);
    onStep?.(result);
  }

  /** One request, with the cookies the server set so far, as a browser on the site would send it. */
  async function call<T>(method: string, path: string, { body, operator = false, status = 200, code }: CallOptions = {}): Promise<T> {
    const headers: Record<string, string> = { 'user-agent': 'urdho-smoke' };
    if (method !== 'GET') Object.assign(headers, { origin: baseUrl, 'sec-fetch-site': 'same-origin' });
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookies.size > 0) headers.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    if (operator) headers.authorization = `Bearer ${operatorToken}`;

    const res = await send(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const name = pair.slice(0, pair.indexOf('='));
      const value = pair.slice(pair.indexOf('=') + 1);
      if (!value || /max-age=0/i.test(cookie)) cookies.delete(name);
      else cookies.set(name, value);
    }
    const json = res.headers.get('content-type')?.includes('application/json') ? ((await res.json()) as unknown) : null;
    const errorCode = (json as { error?: { code?: string } } | null)?.error?.code;
    if (res.status !== status || (code && errorCode !== code)) {
      const expected = `expected ${status}${code ? ` ${code}` : ''}`;
      throw new Error(`${method} ${path} answered ${res.status}${errorCode ? ` ${errorCode}` : ''} (${expected})`);
    }
    return json as T;
  }

  /** A file the browser loads, with the type it must have. */
  async function file(path: string, type: string): Promise<string> {
    const res = await send(`${baseUrl}${path}`, { method: 'GET', headers: { 'user-agent': 'urdho-smoke' }, redirect: 'manual' });
    const contentType = res.headers.get('content-type') ?? '';
    if (res.status !== 200 || !contentType.includes(type)) throw new Error(`${path} answered ${res.status} ${contentType || 'without a type'} (expected 200 ${type})`);
    return res.text();
  }

  try {
    if (site) {
      await step('The page, the app and the offline worker load', async () => {
        const page = await file('/', 'text/html');
        const script = page.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
        if (!script) throw new Error('the page names no app script');
        await file(script, 'javascript');
        await file('/sw.js', 'javascript');
      });
    }

    await step('The API answers', () => call('GET', '/api/health'));

    const check = await step('The check venue is ready', () =>
      call<{ slug: string; qrToken: string; email: string; password: string }>('POST', '/api/operator/health-check', { operator: true }),
    );
    const guest = `/api/guest/${check.slug}/t/${check.qrToken}`;

    const { item, optionIds } = await step('A guest scans the table and gets the menu', async () => {
      const menu = await call<GuestMenu>('POST', `${guest}/scan`);
      if (!menu.orderingOpen) throw new Error('the menu says ordering is closed');
      const dish = menu.categories.flatMap((c) => c.items).find((i) => i.available);
      if (!dish) throw new Error('the menu has no dish to order');
      // The first options each choice needs: enough to satisfy its minimum.
      const chosen = dish.optionGroups.flatMap((g) => g.options.filter((o) => o.available).slice(0, g.minSelect).map((o) => o.id));
      return { item: dish, optionIds: chosen };
    });
    const expectedLek = unitPriceLek(item, optionIds) * QUANTITY;

    const { orderId } = await step('The guest orders', () =>
      call<{ orderId: string }>('POST', `${guest}/orders`, {
        body: { clientRef: `smoke-${randomUUID()}`, guestName: 'Health check', note: '', lines: [{ itemId: item.id, qty: QUANTITY, optionIds }] },
        status: 201,
      }),
    );

    await step("The guest's phone shows the order at the right price", async () => {
      const order = await call<PlacedOrder>('GET', `${guest}/orders/${orderId}`);
      if (order.status !== 'new') throw new Error(`the order is ${order.status}, expected new`);
      if (order.totalLek !== expectedLek) throw new Error(`the order costs ${order.totalLek} lekë, expected ${expectedLek}`);
    });

    await step('The guest calls the waiter', () => call('POST', `${guest}/calls`, { status: 204 }));

    await step('A waiter signs in', () => call('POST', '/api/staff/login', { body: { email: check.email, password: check.password } }));

    const { sessionId, callId } = await step('The order and the call reach the board', async () => {
      const board = await call<{ orders: BoardOrder[]; calls: { id: string; sessionId: string }[] }>('GET', '/api/staff/board');
      const order = board.orders.find((o) => o.id === orderId);
      if (!order) throw new Error('the order is not on the board');
      if (order.totalLek !== expectedLek) throw new Error(`the board says ${order.totalLek} lekë, expected ${expectedLek}`);
      const waiterCall = board.calls.find((c) => c.sessionId === order.sessionId);
      if (!waiterCall) throw new Error('the waiter call is not on the board');
      return { sessionId: order.sessionId, callId: waiterCall.id };
    });

    await step('The kitchen starts and serves the order', async () => {
      await call('PATCH', `/api/staff/orders/${orderId}`, { body: { status: 'preparing' }, status: 204 });
      await call('PATCH', `/api/staff/orders/${orderId}`, { body: { status: 'served' }, status: 204 });
    });

    await step('The waiter answers the call', () => call('POST', `/api/staff/calls/${callId}/acknowledge`, { status: 204 }));

    const billLek = await step('The table shows the bill', async () => {
      const { tables } = await call<{ tables: { session: { id: string } | null; orders: BoardOrder[]; billLek: number }[] }>('GET', '/api/staff/tables');
      const table = tables.find((t) => t.session?.id === sessionId);
      if (!table?.orders.some((o) => o.id === orderId)) throw new Error("the table doesn't show the order");
      // An earlier check that stopped halfway may have left an order at the table: it's paid now too.
      if (table.billLek < expectedLek) throw new Error(`the bill is ${table.billLek} lekë, expected at least ${expectedLek}`);
      return table.billLek;
    });

    await step('Cash payment closes the table', async () => {
      const paid = await call<{ amountLek: number }>('POST', `/api/staff/sessions/${sessionId}/pay`, { body: { method: 'cash' } });
      if (paid.amountLek !== billLek) throw new Error(`${paid.amountLek} lekë were taken, the bill was ${billLek}`);
    });

    await step("The guest's phone sees the table closed", () => call('GET', `${guest}/orders/${orderId}`, { status: 401, code: 'session_closed' }));

    await step('The waiter signs out', () => call('POST', '/api/staff/logout', { status: 204 }));
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
  }

  return { ok: steps.every((s) => s.ok), steps, ms: performance.now() - started };
}
