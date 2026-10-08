import { lineTotalLek } from '@shared/pricing';
import type { GuestMenu, OrderInput, PlacedOrder, PlacedOrderLine } from '@shared/types';
import { latency, newId, now, openSessionFor, readDb, sessionTotal, updateDb, type MockDb } from '../mock/db';
import { slowMock } from './devFlags';

/*
 * Guest API. Until milestone 8 this runs against the mock database in localStorage, shared with
 * the staff dashboard; the function signatures are the contract the real API will meet.
 */

export type GuestApiErrorCode = 'table_invalid' | 'order_not_found' | 'network';

export class GuestApiError extends Error {
  constructor(readonly code: GuestApiErrorCode) {
    super(code);
  }
}

const wait = (ms = 300) => latency(slowMock() ? 1600 : ms);

function findTable(db: MockDb, slug: string, qrToken: string) {
  if (db.venue.slug !== slug) return undefined;
  return db.tables.find((t) => t.qrToken === qrToken);
}

export async function fetchMenu(slug: string, qrToken: string): Promise<GuestMenu> {
  await wait();
  const db = readDb();
  const table = findTable(db, slug, qrToken);
  if (!table) throw new GuestApiError('table_invalid');
  const { id, name, logoUrl, coverUrl, brandColor, languages, defaultLanguage } = db.venue;
  return {
    venue: { id, slug, name, logoUrl, coverUrl, brandColor, languages, defaultLanguage },
    table: { id: table.id, number: table.number },
    categories: db.categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        items: db.items.filter((i) => i.categoryId === c.id && !i.archived).map(({ archived: _archived, ...item }) => item),
      }))
      .filter((c) => c.items.length > 0),
  };
}

export async function placeOrder(slug: string, qrToken: string, input: OrderInput): Promise<{ orderId: string }> {
  await wait(slowMock() ? 2000 : 600);
  return updateDb((db) => {
    const table = findTable(db, slug, qrToken);
    if (!table) throw new GuestApiError('table_invalid');
    const session = openSessionFor(db, table.id);

    const existing = db.orders.find((o) => o.sessionId === session.id && o.clientRef === input.clientRef);
    if (existing) return { orderId: existing.id };

    // The server prices every line; the client only says what it wants.
    const lines: PlacedOrderLine[] = input.lines.flatMap((line) => {
      const item = db.items.find((i) => i.id === line.itemId && !i.archived && i.available);
      if (!item) return [];
      const options = item.optionGroups.flatMap((g) => g.options).filter((o) => line.optionIds.includes(o.id));
      return [
        {
          itemName: item.name,
          optionNames: options.map((o) => o.name),
          qty: line.qty,
          lineTotalLek: lineTotalLek(item, line.optionIds, line.qty),
        },
      ];
    });

    const createdAt = now();
    const order = {
      id: newId(),
      sessionId: session.id,
      tableId: table.id,
      clientRef: input.clientRef,
      status: 'new' as const,
      guestName: input.guestName,
      note: input.note,
      createdAt,
      statusChangedAt: createdAt,
      lines,
      totalLek: lines.reduce((sum, l) => sum + l.lineTotalLek, 0),
    };
    db.orders.push(order);
    return { orderId: order.id };
  });
}

export async function fetchOrder(slug: string, qrToken: string, orderId: string): Promise<PlacedOrder> {
  await wait(150);
  const db = readDb();
  const table = findTable(db, slug, qrToken);
  const order = db.orders.find((o) => o.id === orderId && o.tableId === table?.id);
  if (!order) throw new GuestApiError('order_not_found');
  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    statusChangedAt: order.statusChangedAt,
    lines: order.lines,
    note: order.note,
    totalLek: order.totalLek,
    sessionTotalLek: sessionTotal(db, order.sessionId),
  };
}

export async function callWaiter(slug: string, qrToken: string): Promise<void> {
  await wait(400);
  updateDb((db) => {
    const table = findTable(db, slug, qrToken);
    if (!table) throw new GuestApiError('table_invalid');
    const session = openSessionFor(db, table.id);
    // One open call per table is enough; a second tap doesn't ring again.
    if (db.calls.some((c) => c.sessionId === session.id && c.acknowledgedAt === null)) return;
    db.calls.push({ id: newId(), sessionId: session.id, tableId: table.id, createdAt: now(), acknowledgedAt: null });
  });
}
