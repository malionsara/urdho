import type {
  MenuItem,
  OrderStatus,
  PaymentMethod,
  PlacedOrderLine,
  StaffUser,
  Venue,
  LocalizedText,
} from '@shared/types';
import { SEED_CATEGORIES, SEED_STAFF, SEED_TABLES, SEED_VENUE } from './seed';

/*
 * A pretend backend that lives in the browser's localStorage, shaped like the data model in
 * docs/SPEC.md. The guest app and the staff dashboard both read and write it, so an order placed
 * in one tab shows up on the board in another. Milestone 8 replaces it with the real API.
 */

export interface DbTable {
  id: string;
  number: number;
  qrToken: string;
}

export interface DbCategory {
  id: string;
  name: LocalizedText;
}

export interface DbItem extends MenuItem {
  archived: boolean;
}

export interface DbSession {
  id: string;
  tableId: string;
  openedAt: string;
  closedAt: string | null;
}

export interface DbOrder {
  id: string;
  sessionId: string;
  tableId: string;
  clientRef: string;
  status: OrderStatus;
  guestName: string;
  note: string;
  createdAt: string;
  statusChangedAt: string;
  lines: PlacedOrderLine[];
  totalLek: number;
}

export interface DbCall {
  id: string;
  sessionId: string;
  tableId: string;
  createdAt: string;
  acknowledgedAt: string | null;
}

export interface DbPayment {
  id: string;
  sessionId: string;
  method: PaymentMethod;
  amountLek: number;
  createdAt: string;
}

export interface MockDb {
  version: number;
  venue: Venue;
  tables: DbTable[];
  categories: DbCategory[];
  items: DbItem[];
  sessions: DbSession[];
  orders: DbOrder[];
  calls: DbCall[];
  payments: DbPayment[];
  staff: StaffUser[];
}

const KEY = 'urdho-mock-db';
const VERSION = 1;

function seedDb(): MockDb {
  return {
    version: VERSION,
    venue: structuredClone(SEED_VENUE),
    tables: structuredClone(SEED_TABLES),
    categories: SEED_CATEGORIES.map(({ id, name }) => ({ id, name })),
    items: SEED_CATEGORIES.flatMap((c) => c.items.map((item) => ({ ...structuredClone(item), archived: false }))),
    sessions: [],
    orders: [],
    calls: [],
    payments: [],
    staff: structuredClone(SEED_STAFF),
  };
}

// Kept in memory too, so the app still works when storage is blocked.
let memory: MockDb | null = null;

export function readDb(): MockDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed.version === VERSION) return parsed;
    }
  } catch {
    // fall through to memory or seed
  }
  memory ??= seedDb();
  return structuredClone(memory);
}

function writeDb(db: MockDb) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: the in-memory copy still serves this tab.
  }
}

/** Reads, changes and saves the database in one step. */
export function updateDb<T>(change: (db: MockDb) => T): T {
  const db = readDb();
  const result = change(db);
  writeDb(db);
  return result;
}

export function resetDb() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('urdho-mock-orders'); // left over from the first design round
  } catch {
    // ignore
  }
}

export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

/** Pretend network latency, longer with ?slow=1. */
export function latency(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function openSessionFor(db: MockDb, tableId: string): DbSession {
  const open = db.sessions.find((s) => s.tableId === tableId && s.closedAt === null);
  if (open) return open;
  const session: DbSession = { id: newId(), tableId, openedAt: now(), closedAt: null };
  db.sessions.push(session);
  return session;
}

export function sessionTotal(db: MockDb, sessionId: string): number {
  return db.orders.filter((o) => o.sessionId === sessionId && o.status !== 'cancelled').reduce((sum, o) => sum + o.totalLek, 0);
}
