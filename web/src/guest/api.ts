import type { GuestMenu, OrderInput, PlacedOrder } from '@shared/types';
import { api, ApiError } from '../lib/http';

/*
 * The guest app's API, addressed by the table's QR code: /api/guest/<slug>/t/<qrToken>/…
 * The table-session cookie is set by scan and limited to this address, so nothing else is sent.
 */

export interface LoadedMenu extends GuestMenu {
  /** True when the network is down and this is the copy saved on the phone last time. */
  offline?: boolean;
}

const tablePath = (slug: string, qrToken: string) => `/guest/${encodeURIComponent(slug)}/t/${encodeURIComponent(qrToken)}`;
const cacheKey = (slug: string, qrToken: string) => `urdho-menu:${slug}:${qrToken}`;

function saveMenu(slug: string, qrToken: string, menu: GuestMenu) {
  try {
    localStorage.setItem(cacheKey(slug, qrToken), JSON.stringify(menu));
  } catch {
    // Storage full or blocked: the menu just won't be there offline.
  }
}

function savedMenu(slug: string, qrToken: string): GuestMenu | null {
  try {
    const raw = localStorage.getItem(cacheKey(slug, qrToken));
    return raw ? (JSON.parse(raw) as GuestMenu) : null;
  } catch {
    return null;
  }
}

/** Scans the table: opens or joins its session and returns the menu. */
export async function fetchMenu(slug: string, qrToken: string): Promise<LoadedMenu> {
  try {
    const menu = await api<GuestMenu>(`${tablePath(slug, qrToken)}/scan`, { method: 'POST' });
    saveMenu(slug, qrToken, menu);
    return menu;
  } catch (error) {
    // A beach bar with a weak signal: show the menu from last time rather than nothing.
    const saved = error instanceof ApiError && error.code === 'network' ? savedMenu(slug, qrToken) : null;
    if (saved) return { ...saved, offline: true };
    throw error;
  }
}

/** Runs a call that needs the table session; if the session lapsed, scans again and retries once. */
async function withSession<T>(slug: string, qrToken: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await api(`${tablePath(slug, qrToken)}/scan`, { method: 'POST' });
    return call();
  }
}

export function placeOrder(slug: string, qrToken: string, input: OrderInput): Promise<{ orderId: string }> {
  return withSession(slug, qrToken, () => api(`${tablePath(slug, qrToken)}/orders`, { method: 'POST', body: input }));
}

/** No rescan here: once the table is paid, its orders belong to the past session. */
export function fetchOrder(slug: string, qrToken: string, orderId: string): Promise<PlacedOrder> {
  return api(`${tablePath(slug, qrToken)}/orders/${encodeURIComponent(orderId)}`);
}

export function callWaiter(slug: string, qrToken: string): Promise<void> {
  return withSession(slug, qrToken, () => api(`${tablePath(slug, qrToken)}/calls`, { method: 'POST' }));
}
