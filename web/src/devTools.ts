import { callWaiter, placeOrder } from './guest/api';
import { resetDb, updateDb } from './mock/db';

/*
 * Design-review helpers: fill the staff board with a realistic service, or start clean.
 * Orders go through the guest API, exactly as a guest's phone would send them.
 */

const minutesAgo = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export async function addDemoService() {
  const order = (table: number, guestName: string, note: string, lines: [string, number, string[]][]) =>
    placeOrder('demo', `demo-${table}`, {
      clientRef: crypto.randomUUID(),
      guestName,
      note,
      lines: lines.map(([itemId, qty, optionIds]) => ({ itemId, qty, optionIds })),
    });

  const served = await order(3, 'Tom', '', [
    ['i-bakllava', 2, []],
    ['i-trilece', 1, []],
  ]);
  const preparing = await order(1, 'Elira', '', [
    ['i-byrek', 2, []],
    ['i-fergese', 1, []],
  ]);
  const waiting = await order(2, 'Arben', '', [
    ['i-tave-kosi', 2, []],
    ['i-sallate', 1, ['o-sallate-no-onion']],
    ['i-birre', 2, ['o-birre-50']],
  ]);
  await order(5, '', 'Alergji nga arrat, ju lutem kujdes', [
    ['i-qofte', 1, ['o-qofte-10', 'o-qofte-fries']],
    ['i-dhalle', 2, []],
  ]);
  await callWaiter('demo', 'demo-6');

  // Spread them out in time so every column and timer colour shows.
  updateDb((db) => {
    for (const o of db.orders) {
      if (o.id === served.orderId) Object.assign(o, { status: 'served', createdAt: minutesAgo(32), statusChangedAt: minutesAgo(5) });
      if (o.id === preparing.orderId) Object.assign(o, { status: 'preparing', createdAt: minutesAgo(19), statusChangedAt: minutesAgo(17) });
      if (o.id === waiting.orderId) Object.assign(o, { createdAt: minutesAgo(4), statusChangedAt: minutesAgo(4) });
    }
    for (const s of db.sessions) if (s.closedAt === null && db.orders.some((o) => o.sessionId === s.id)) s.openedAt = minutesAgo(40);
  });
}

export function resetDemoData() {
  resetDb();
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('urdho-basket:')) localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
