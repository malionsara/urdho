import type { OrderStatus, PaymentMethod, StaffRole, StaffUser, Venue } from '@shared/types';
import {
  latency,
  newId,
  now,
  readDb,
  sessionTotal,
  updateDb,
  type DbCall,
  type DbCategory,
  type DbItem,
  type DbOrder,
  type DbSession,
  type DbTable,
} from '../mock/db';

/*
 * Staff API. Until milestone 8 this runs against the mock database shared with the guest app;
 * the function signatures are the contract the real API will meet. Venue scoping is implicit
 * here because the mock holds one venue.
 */

export class StaffApiError extends Error {
  constructor(readonly code: 'invalid_login' | 'not_found' | 'last_owner') {
    super(code);
  }
}

const wait = (ms = 120) => latency(ms);

/** How long served orders stay on the board. */
const SERVED_VISIBLE_MS = 90 * 60_000;

/* Auth -------------------------------------------------------------------- */

export async function login(email: string, _password: string): Promise<StaffUser> {
  await wait(500);
  const user = readDb().staff.find((s) => s.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) throw new StaffApiError('invalid_login');
  return user;
}

/* Live board ---------------------------------------------------------------- */

export interface BoardOrder extends DbOrder {
  tableNumber: number;
  /** The first order of its table session: staff check someone is really seated. */
  firstInSession: boolean;
}

export interface BoardCall extends DbCall {
  tableNumber: number;
}

export async function fetchBoard(): Promise<{ orders: BoardOrder[]; calls: BoardCall[] }> {
  await wait();
  const db = readDb();
  const tableNumber = (id: string) => db.tables.find((t) => t.id === id)?.number ?? 0;
  const cutoff = Date.now() - SERVED_VISIBLE_MS;
  const firstOrderIds = new Set(
    db.sessions.map((s) => db.orders.filter((o) => o.sessionId === s.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id),
  );
  const orders = db.orders
    .filter((o) => o.status === 'new' || o.status === 'preparing' || (o.status === 'served' && Date.parse(o.statusChangedAt) > cutoff))
    .map((o) => ({ ...o, tableNumber: tableNumber(o.tableId), firstInSession: firstOrderIds.has(o.id) }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const calls = db.calls
    .filter((c) => c.acknowledgedAt === null)
    .map((c) => ({ ...c, tableNumber: tableNumber(c.tableId) }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { orders, calls };
}

export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  await wait();
  updateDb((db) => {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) throw new StaffApiError('not_found');
    order.status = status;
    order.statusChangedAt = now();
  });
}

export async function acknowledgeCall(callId: string): Promise<void> {
  await wait();
  updateDb((db) => {
    const call = db.calls.find((c) => c.id === callId);
    if (call) call.acknowledgedAt = now();
  });
}

/* Tables ------------------------------------------------------------------- */

export interface TableSummary {
  table: DbTable;
  session: DbSession | null;
  orders: DbOrder[];
  billLek: number;
  openCall: boolean;
}

export async function fetchTables(): Promise<TableSummary[]> {
  await wait();
  const db = readDb();
  return db.tables
    .map((table) => {
      const session = db.sessions.find((s) => s.tableId === table.id && s.closedAt === null) ?? null;
      const orders = session ? db.orders.filter((o) => o.sessionId === session.id) : [];
      return {
        table,
        // A session that only scanned or called is shown, but only orders make a bill.
        session: session && (orders.length > 0 || db.calls.some((c) => c.sessionId === session.id)) ? session : null,
        orders,
        billLek: session ? sessionTotal(db, session.id) : 0,
        openCall: session ? db.calls.some((c) => c.sessionId === session.id && c.acknowledgedAt === null) : false,
      };
    })
    .sort((a, b) => a.table.number - b.table.number);
}

/** Records the payment with the cash provider and closes the table, so its next guests start fresh. */
export async function markSessionPaid(sessionId: string, method: PaymentMethod): Promise<void> {
  await wait(300);
  updateDb((db) => {
    const session = db.sessions.find((s) => s.id === sessionId && s.closedAt === null);
    if (!session) throw new StaffApiError('not_found');
    db.payments.push({ id: newId(), sessionId, method, amountLek: sessionTotal(db, sessionId), createdAt: now() });
    session.closedAt = now();
    for (const call of db.calls) if (call.sessionId === sessionId && !call.acknowledgedAt) call.acknowledgedAt = now();
  });
}

/* Menu --------------------------------------------------------------------- */

export async function fetchMenuAdmin(): Promise<{ categories: DbCategory[]; items: DbItem[]; venue: Venue }> {
  await wait();
  const db = readDb();
  return { categories: db.categories, items: db.items.filter((i) => !i.archived), venue: db.venue };
}

export async function saveItem(item: DbItem): Promise<void> {
  await wait(250);
  updateDb((db) => {
    const index = db.items.findIndex((i) => i.id === item.id);
    if (index === -1) db.items.push(item);
    else db.items[index] = item;
  });
}

export async function setItemAvailable(itemId: string, available: boolean): Promise<void> {
  await wait();
  updateDb((db) => {
    const item = db.items.find((i) => i.id === itemId);
    if (item) item.available = available;
  });
}

export async function archiveItem(itemId: string): Promise<void> {
  await wait();
  updateDb((db) => {
    const item = db.items.find((i) => i.id === itemId);
    if (item) item.archived = true;
  });
}

export async function addCategory(name: DbCategory['name']): Promise<DbCategory> {
  await wait();
  return updateDb((db) => {
    const category = { id: newId(), name };
    db.categories.push(category);
    return category;
  });
}

/* Tables and QR codes ------------------------------------------------------- */

export async function fetchQrTables(): Promise<{ tables: DbTable[]; venue: Venue }> {
  await wait();
  const db = readDb();
  return { tables: [...db.tables].sort((a, b) => a.number - b.number), venue: db.venue };
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}

/** Gives a table a new QR token; printed codes with the old one stop working at once. */
export async function resetQrToken(tableId: string): Promise<void> {
  await wait();
  updateDb((db) => {
    const table = db.tables.find((t) => t.id === tableId);
    if (table) table.qrToken = randomToken();
  });
}

export async function addTable(): Promise<void> {
  await wait();
  updateDb((db) => {
    const number = Math.max(0, ...db.tables.map((t) => t.number)) + 1;
    db.tables.push({ id: newId(), number, qrToken: randomToken() });
  });
}

/* Staff accounts ------------------------------------------------------------ */

export async function fetchStaff(): Promise<StaffUser[]> {
  await wait();
  return readDb().staff;
}

export async function addStaff(input: { name: string; email: string; role: StaffRole }): Promise<StaffUser> {
  await wait(300);
  return updateDb((db) => {
    const user = { id: newId(), ...input };
    db.staff.push(user);
    return user;
  });
}

export async function removeStaff(userId: string): Promise<void> {
  await wait();
  updateDb((db) => {
    const user = db.staff.find((s) => s.id === userId);
    if (user?.role === 'owner' && db.staff.filter((s) => s.role === 'owner').length === 1) throw new StaffApiError('last_owner');
    db.staff = db.staff.filter((s) => s.id !== userId);
  });
}

/* Venue settings ----------------------------------------------------------- */

export async function fetchVenue(): Promise<Venue> {
  await wait();
  return readDb().venue;
}

export async function saveVenue(venue: Venue): Promise<void> {
  await wait(300);
  updateDb((db) => {
    db.venue = venue;
  });
}
