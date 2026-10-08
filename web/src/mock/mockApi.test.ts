// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMenu, fetchOrder, placeOrder } from '../guest/api';
import { fetchTables, markSessionPaid, resetQrToken, setItemAvailable, setOrderStatus } from '../staff/api';
import { readDb, resetDb } from './db';

// No pretend network delay in tests.
vi.mock('./db', async (importOriginal) => ({ ...(await importOriginal<typeof import('./db')>()), latency: () => Promise.resolve() }));

const order = (table: number, clientRef: string, lines: [string, number, string[]][]) =>
  placeOrder('demo', `demo-${table}`, {
    clientRef,
    guestName: '',
    note: '',
    lines: lines.map(([itemId, qty, optionIds]) => ({ itemId, qty, optionIds })),
  });

describe('mock backend shared by the guest app and the staff dashboard', () => {
  beforeEach(() => resetDb());

  it('records a retried order once', async () => {
    const first = await order(1, 'same-ref', [['i-byrek', 1, []]]);
    const retry = await order(1, 'same-ref', [['i-byrek', 1, []]]);
    expect(retry.orderId).toBe(first.orderId);
    expect(readDb().orders).toHaveLength(1);
  });

  it('prices on the server, ignoring options that do not belong to the dish', async () => {
    const { orderId } = await order(1, 'r1', [['i-qofte', 2, ['o-qofte-10', 'o-birre-50']]]);
    const placed = await fetchOrder('demo', 'demo-1', orderId);
    expect(placed.totalLek).toBe((600 + 350) * 2);
  });

  it('shows the guest each status change made on the board', async () => {
    const { orderId } = await order(2, 'r1', [['i-byrek', 1, []]]);
    await setOrderStatus(orderId, 'preparing');
    expect((await fetchOrder('demo', 'demo-2', orderId)).status).toBe('preparing');
  });

  it('keeps cancelled orders out of the running bill', async () => {
    const a = await order(3, 'r1', [['i-byrek', 1, []]]);
    await order(3, 'r2', [['i-dhalle', 2, []]]);
    await setOrderStatus(a.orderId, 'cancelled');
    const table = (await fetchTables()).find((s) => s.table.number === 3)!;
    expect(table.billLek).toBe(300);
  });

  it('closes the table when paid, so the next guests start a new bill', async () => {
    await order(4, 'r1', [['i-tave-kosi', 1, []]]);
    const open = (await fetchTables()).find((s) => s.table.number === 4)!;
    await markSessionPaid(open.session!.id, 'cash');

    const afterPayment = (await fetchTables()).find((s) => s.table.number === 4)!;
    expect(afterPayment.session).toBeNull();
    expect(readDb().payments).toMatchObject([{ method: 'cash', amountLek: 850 }]);

    const { orderId } = await order(4, 'r2', [['i-byrek', 1, []]]);
    expect((await fetchOrder('demo', 'demo-4', orderId)).sessionTotalLek).toBe(250);
  });

  it('refuses sold-out dishes even if an old basket still has them', async () => {
    await setItemAvailable('i-byrek', false);
    const { orderId } = await order(5, 'r1', [
      ['i-byrek', 1, []],
      ['i-dhalle', 1, []],
    ]);
    const placed = await fetchOrder('demo', 'demo-5', orderId);
    expect(placed.lines).toHaveLength(1);
    expect(placed.totalLek).toBe(150);
  });

  it('stops an old QR code working once staff reset it', async () => {
    await resetQrToken('t-6');
    await expect(fetchMenu('demo', 'demo-6')).rejects.toThrow('table_invalid');
  });
});
