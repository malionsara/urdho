import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { checkSelection, unitPriceLek } from '../../shared/pricing';
import type { PlaceOrderInput } from '../../shared/schemas';
import type { MenuItem, OrderStatus, PaymentMethod, PlacedOrder, PlacedOrderLine } from '../../shared/types';
import type { Db } from '../db/client';
import { diningTable, guestOrder, orderItem, orderItemOption, serviceCall, tableSession } from '../db/schema';
import { ApiError, notFound } from '../http';
import type { PaymentProvider } from '../payments/provider';
import { loadMenu } from './menu';

/*
 * Orders, waiter calls and payments. Every function takes venueId first.
 * Prices are always worked out here from the menu; the guest's phone never sends one.
 */

type Executor = Pick<Db, 'select' | 'insert' | 'update'>;

/** Rate limit per table session (spec: "rate-limit order submission per session"). */
export const ORDER_LIMIT = { orders: 10, minutes: 10 };
/** How long served orders stay on the board. */
const SERVED_VISIBLE_MINUTES = 90;

export interface LoadedOrder {
  id: string;
  sessionId: string;
  tableId: string;
  tableNumber: number;
  status: OrderStatus;
  guestName: string;
  note: string;
  createdAt: string;
  statusChangedAt: string;
  lines: PlacedOrderLine[];
  totalLek: number;
}

/** Orders matching `where`, with their lines, copied names and totals, oldest first. */
async function loadOrders(db: Executor, venueId: string, where: SQL | undefined): Promise<LoadedOrder[]> {
  const orders = await db
    .select({
      id: guestOrder.id,
      sessionId: guestOrder.sessionId,
      tableId: tableSession.tableId,
      tableNumber: diningTable.number,
      status: guestOrder.status,
      guestName: guestOrder.guestName,
      note: guestOrder.note,
      createdAt: guestOrder.createdAt,
      statusChangedAt: guestOrder.statusChangedAt,
    })
    .from(guestOrder)
    .innerJoin(tableSession, and(eq(tableSession.id, guestOrder.sessionId), eq(tableSession.venueId, guestOrder.venueId)))
    .innerJoin(diningTable, and(eq(diningTable.id, tableSession.tableId), eq(diningTable.venueId, tableSession.venueId)))
    .where(and(eq(guestOrder.venueId, venueId), where))
    .orderBy(asc(guestOrder.createdAt));
  if (orders.length === 0) return [];

  const lines = await db
    .select({ id: orderItem.id, orderId: orderItem.orderId, itemName: orderItem.itemName, qty: orderItem.qty, unitPriceLek: orderItem.unitPriceLek })
    .from(orderItem)
    .where(and(eq(orderItem.venueId, venueId), inArray(orderItem.orderId, orders.map((o) => o.id))))
    .orderBy(asc(orderItem.position));
  const options = lines.length
    ? await db
        .select({ orderItemId: orderItemOption.orderItemId, optionName: orderItemOption.optionName, priceDeltaLek: orderItemOption.priceDeltaLek })
        .from(orderItemOption)
        .where(and(eq(orderItemOption.venueId, venueId), inArray(orderItemOption.orderItemId, lines.map((l) => l.id))))
        .orderBy(asc(orderItemOption.position))
    : [];

  return orders.map((order) => {
    const orderLines = lines
      .filter((l) => l.orderId === order.id)
      .map((line) => {
        const chosen = options.filter((o) => o.orderItemId === line.id);
        const unit = line.unitPriceLek + chosen.reduce((sum, o) => sum + o.priceDeltaLek, 0);
        return { itemName: line.itemName, optionNames: chosen.map((o) => o.optionName), qty: line.qty, lineTotalLek: unit * line.qty };
      });
    return {
      ...order,
      createdAt: order.createdAt.toISOString(),
      statusChangedAt: order.statusChangedAt.toISOString(),
      lines: orderLines,
      totalLek: orderLines.reduce((sum, l) => sum + l.lineTotalLek, 0),
    };
  });
}

const billOf = (orders: LoadedOrder[]) => orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.totalLek, 0);

/* Guests -------------------------------------------------------------------- */

/**
 * Places an order in a table session. A repeated clientRef returns the first order unchanged, so a
 * phone retrying after a dropped connection never orders twice.
 */
export async function placeOrder(db: Db, venueId: string, sessionId: string, input: PlaceOrderInput): Promise<{ orderId: string; created: boolean }> {
  const existing = await findOrderByClientRef(db, venueId, sessionId, input.clientRef);
  if (existing) return { orderId: existing, created: false };

  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guestOrder)
    .where(
      and(
        eq(guestOrder.venueId, venueId),
        eq(guestOrder.sessionId, sessionId),
        sql`${guestOrder.createdAt} > now() - ${sql.raw(`interval '${ORDER_LIMIT.minutes} minutes'`)}`,
      ),
    );
  if (recent!.n >= ORDER_LIMIT.orders) throw new ApiError(429, 'too_many_orders');

  // Only dishes guests can see: live, in a shown category, not sold out.
  const menu = await loadMenu(db, venueId, { itemIds: [...new Set(input.lines.map((l) => l.itemId))] });
  const shown = new Set(menu.categories.filter((c) => c.active).map((c) => c.id));
  const items = new Map<string, MenuItem>(menu.items.filter((i) => shown.has(i.categoryId)).map((i) => [i.id, i]));
  const unavailable = [...new Set(input.lines.filter((l) => !items.get(l.itemId)?.available).map((l) => l.itemId))];
  if (unavailable.length > 0) throw new ApiError(409, 'menu_changed', { unavailable });

  const problems: { line: number; groupId?: string; code: string }[] = [];
  input.lines.forEach((line, index) => {
    const item = items.get(line.itemId)!;
    const known = new Set(item.optionGroups.flatMap((g) => g.options.map((o) => o.id)));
    if (line.optionIds.some((id) => !known.has(id))) problems.push({ line: index, code: 'unknown_option' });
    for (const p of checkSelection(item.optionGroups, line.optionIds)) problems.push({ line: index, groupId: p.groupId, code: p.kind });
    if (unitPriceLek(item, line.optionIds) < 0) problems.push({ line: index, code: 'negative_price' });
  });
  if (problems.length > 0) throw new ApiError(400, 'invalid_options', problems);

  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(guestOrder)
      .values({ venueId, sessionId, clientRef: input.clientRef, guestName: input.guestName, note: input.note })
      .onConflictDoNothing({ target: [guestOrder.sessionId, guestOrder.clientRef] })
      .returning({ id: guestOrder.id });
    // The same order arrived twice at the same moment: the first one wins, this one returns it.
    if (!order) return { orderId: (await findOrderByClientRef(tx, venueId, sessionId, input.clientRef))!, created: false };

    for (const [position, line] of input.lines.entries()) {
      const item = items.get(line.itemId)!;
      const [row] = await tx
        .insert(orderItem)
        .values({ venueId, orderId: order.id, itemId: item.id, itemName: item.name, position, qty: line.qty, unitPriceLek: item.priceLek })
        .returning({ id: orderItem.id });
      const chosen = item.optionGroups.flatMap((g) => g.options).filter((o) => line.optionIds.includes(o.id));
      if (chosen.length > 0) {
        await tx.insert(orderItemOption).values(
          chosen.map((option, optionPosition) => ({
            venueId,
            orderItemId: row!.id,
            optionId: option.id,
            optionName: option.name,
            position: optionPosition,
            priceDeltaLek: option.priceDeltaLek,
          })),
        );
      }
    }
    return { orderId: order.id, created: true };
  });
}

async function findOrderByClientRef(db: Executor, venueId: string, sessionId: string, clientRef: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: guestOrder.id })
    .from(guestOrder)
    .where(and(eq(guestOrder.venueId, venueId), eq(guestOrder.sessionId, sessionId), eq(guestOrder.clientRef, clientRef)));
  return row?.id;
}

/** One order as its guest sees it, with the table's running bill. */
export async function getGuestOrder(db: Db, venueId: string, sessionId: string, orderId: string): Promise<PlacedOrder | undefined> {
  const sessionOrders = await loadOrders(db, venueId, eq(guestOrder.sessionId, sessionId));
  const order = sessionOrders.find((o) => o.id === orderId);
  if (!order) return undefined;
  const { id, status, createdAt, statusChangedAt, lines, note, totalLek } = order;
  return { id, status, createdAt, statusChangedAt, lines, note, totalLek, sessionTotalLek: billOf(sessionOrders) };
}

/** Whether this order was placed at this table in a session staff have since closed. */
export async function isOrderFromClosedSession(db: Db, venueId: string, tableId: string, orderId: string) {
  const [row] = await db
    .select({ id: guestOrder.id })
    .from(guestOrder)
    .innerJoin(tableSession, and(eq(tableSession.id, guestOrder.sessionId), eq(tableSession.venueId, guestOrder.venueId)))
    .where(and(eq(guestOrder.venueId, venueId), eq(guestOrder.id, orderId), eq(tableSession.tableId, tableId), eq(tableSession.status, 'closed')));
  return row !== undefined;
}

/** "Call the waiter". A second call while the first is unanswered changes nothing. */
export async function callWaiter(db: Db, venueId: string, sessionId: string, tableId: string) {
  await db.insert(serviceCall).values({ venueId, sessionId, tableId }).onConflictDoNothing();
}

/* Staff: the live board ------------------------------------------------------ */

export async function loadBoard(db: Db, venueId: string) {
  const orders = await loadOrders(
    db,
    venueId,
    or(
      inArray(guestOrder.status, ['new', 'preparing']),
      and(eq(guestOrder.status, 'served'), sql`${guestOrder.statusChangedAt} > now() - ${sql.raw(`interval '${SERVED_VISIBLE_MINUTES} minutes'`)}`),
    ),
  );

  // The first order of each session gets the "New table" flag: staff check someone is seated.
  const sessionIds = [...new Set(orders.map((o) => o.sessionId))];
  const firsts = sessionIds.length
    ? await db
        .selectDistinctOn([guestOrder.sessionId], { id: guestOrder.id })
        .from(guestOrder)
        .where(and(eq(guestOrder.venueId, venueId), inArray(guestOrder.sessionId, sessionIds)))
        .orderBy(guestOrder.sessionId, asc(guestOrder.createdAt))
    : [];
  const firstIds = new Set(firsts.map((f) => f.id));

  const calls = await db
    .select({ id: serviceCall.id, sessionId: serviceCall.sessionId, tableId: serviceCall.tableId, tableNumber: diningTable.number, createdAt: serviceCall.createdAt })
    .from(serviceCall)
    .innerJoin(diningTable, and(eq(diningTable.id, serviceCall.tableId), eq(diningTable.venueId, serviceCall.venueId)))
    .where(and(eq(serviceCall.venueId, venueId), isNull(serviceCall.acknowledgedAt)))
    .orderBy(asc(serviceCall.createdAt));

  // Tables open on the Tables page (an order, or a call nobody answered yet): the board keeps
  // watching after closing time until they're settled, since those guests can still call.
  const [open] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tableSession)
    .where(
      and(
        eq(tableSession.venueId, venueId),
        eq(tableSession.status, 'open'),
        sql`(EXISTS (SELECT 1 FROM ${guestOrder} WHERE ${guestOrder.sessionId} = ${tableSession.id} AND ${guestOrder.venueId} = ${tableSession.venueId})
          OR EXISTS (SELECT 1 FROM ${serviceCall} WHERE ${serviceCall.sessionId} = ${tableSession.id} AND ${serviceCall.venueId} = ${tableSession.venueId} AND ${serviceCall.acknowledgedAt} IS NULL))`,
      ),
    );

  return {
    orders: orders.map((o) => ({ ...o, firstInSession: firstIds.has(o.id) })),
    calls: calls.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    openTables: open?.count ?? 0,
  };
}

const NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  new: ['preparing', 'cancelled'],
  preparing: ['served', 'cancelled'],
};

/** Moves an order along the board. Only forward, or to cancelled; never back from served. */
export async function setOrderStatus(db: Db, venueId: string, orderId: string, next: OrderStatus) {
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: guestOrder.status })
      .from(guestOrder)
      .where(and(eq(guestOrder.venueId, venueId), eq(guestOrder.id, orderId)))
      .for('update');
    if (!order) throw notFound();
    if (!NEXT[order.status]?.includes(next)) throw new ApiError(409, 'invalid_transition', { from: order.status, to: next });
    await tx.update(guestOrder).set({ status: next, statusChangedAt: sql`now()` }).where(and(eq(guestOrder.venueId, venueId), eq(guestOrder.id, orderId)));
  });
}

/** "On my way". Answering a call twice is fine; another venue's call is a 404. */
export async function acknowledgeCall(db: Db, venueId: string, callId: string, staffUserId: string) {
  const [call] = await db
    .select({ id: serviceCall.id })
    .from(serviceCall)
    .where(and(eq(serviceCall.venueId, venueId), eq(serviceCall.id, callId)));
  if (!call) throw notFound();
  await db
    .update(serviceCall)
    .set({ acknowledgedAt: sql`now()`, acknowledgedBy: staffUserId })
    .where(and(eq(serviceCall.venueId, venueId), eq(serviceCall.id, callId), isNull(serviceCall.acknowledgedAt)));
}

/* Staff: tables and bills ---------------------------------------------------- */

export async function loadTables(db: Db, venueId: string) {
  const tables = await db
    .select({ id: diningTable.id, number: diningTable.number, label: diningTable.label })
    .from(diningTable)
    .where(eq(diningTable.venueId, venueId))
    .orderBy(asc(diningTable.number));
  const sessions = await db
    .select({ id: tableSession.id, tableId: tableSession.tableId, openedAt: tableSession.openedAt })
    .from(tableSession)
    .where(and(eq(tableSession.venueId, venueId), eq(tableSession.status, 'open')));
  const sessionIds = sessions.map((s) => s.id);
  const orders = sessionIds.length ? await loadOrders(db, venueId, inArray(guestOrder.sessionId, sessionIds)) : [];
  const calls = sessionIds.length
    ? await db
        .select({ sessionId: serviceCall.sessionId })
        .from(serviceCall)
        .where(and(eq(serviceCall.venueId, venueId), inArray(serviceCall.sessionId, sessionIds), isNull(serviceCall.acknowledgedAt)))
    : [];

  return tables.map((table) => {
    const session = sessions.find((s) => s.tableId === table.id);
    const sessionOrders = session ? orders.filter((o) => o.sessionId === session.id) : [];
    const openCall = session ? calls.some((c) => c.sessionId === session.id) : false;
    // A session that only scanned shows as free: the table is open once someone orders or calls.
    const visible = session && (sessionOrders.length > 0 || openCall);
    return {
      table,
      session: visible ? { id: session.id, openedAt: session.openedAt.toISOString() } : null,
      orders: visible ? sessionOrders : [],
      billLek: visible ? billOf(sessionOrders) : 0,
      openCall,
    };
  });
}

/**
 * Takes payment for a table through the provider and closes the session, so the table's next guests
 * start a new bill and the old guest token stops working.
 */
export async function paySession(db: Db, venueId: string, sessionId: string, method: PaymentMethod, provider: PaymentProvider) {
  return db.transaction(async (tx) => {
    const session = await lockOpenSession(tx, venueId, sessionId);
    const amountLek = billOf(await loadOrders(tx, venueId, eq(guestOrder.sessionId, session.id)));
    if (amountLek === 0) throw new ApiError(409, 'nothing_to_pay');
    const { paymentId } = await provider.createPayment(tx, { venueId, sessionId, amountLek, method });
    await provider.confirmPayment(tx, venueId, paymentId);
    await closeSession(tx, venueId, sessionId);
    return { paymentId, amountLek };
  });
}

/** Clears a table with nothing to pay, e.g. guests who only called the waiter and left. */
export async function closeEmptySession(db: Db, venueId: string, sessionId: string) {
  await db.transaction(async (tx) => {
    const session = await lockOpenSession(tx, venueId, sessionId);
    if (billOf(await loadOrders(tx, venueId, eq(guestOrder.sessionId, session.id))) > 0) throw new ApiError(409, 'unpaid_bill');
    await closeSession(tx, venueId, sessionId);
  });
}

export interface ForgottenTable {
  tableNumber: number;
  billLek: number;
}

/**
 * Closes tables nobody has touched for `idleHours`: no scan, order, kitchen step or waiter call.
 * Staff are meant to mark every table paid, but on a busy night some slip through, and the next
 * guests at that table would join the old bill. Returns how many closed, and those that still had
 * a bill, for the team to follow up (staff can't close an unpaid bill themselves).
 */
export async function closeForgottenSessions(db: Db, venueId: string, idleHours: number): Promise<{ closed: number; unpaid: ForgottenTable[] }> {
  return db.transaction(async (tx) => {
    const idle = await tx
      .select({ id: tableSession.id, tableNumber: diningTable.number })
      .from(tableSession)
      .innerJoin(diningTable, and(eq(diningTable.id, tableSession.tableId), eq(diningTable.venueId, tableSession.venueId)))
      .where(
        and(
          eq(tableSession.venueId, venueId),
          eq(tableSession.status, 'open'),
          // greatest() skips the nulls of a table with no orders or no calls.
          sql`greatest(
            ${tableSession.openedAt},
            (SELECT max(greatest(o.created_at, o.status_changed_at)) FROM ${guestOrder} o WHERE o.session_id = ${tableSession.id} AND o.venue_id = ${tableSession.venueId}),
            (SELECT max(coalesce(c.acknowledged_at, c.created_at)) FROM ${serviceCall} c WHERE c.session_id = ${tableSession.id} AND c.venue_id = ${tableSession.venueId})
          ) < now() - make_interval(hours => ${idleHours})`,
        ),
      )
      .orderBy(asc(diningTable.number))
      .for('update', { of: tableSession });

    const unpaid: ForgottenTable[] = [];
    for (const session of idle) {
      const billLek = billOf(await loadOrders(tx, venueId, eq(guestOrder.sessionId, session.id)));
      await closeSession(tx, venueId, session.id);
      if (billLek > 0) unpaid.push({ tableNumber: session.tableNumber, billLek });
    }
    return { closed: idle.length, unpaid };
  });
}

async function lockOpenSession(tx: Executor, venueId: string, sessionId: string) {
  const [session] = await tx
    .select({ id: tableSession.id, status: tableSession.status })
    .from(tableSession)
    .where(and(eq(tableSession.venueId, venueId), eq(tableSession.id, sessionId)))
    .for('update');
  if (!session) throw notFound();
  if (session.status !== 'open') throw new ApiError(409, 'session_closed');
  return session;
}

async function closeSession(tx: Executor, venueId: string, sessionId: string) {
  await tx.update(tableSession).set({ status: 'closed', closedAt: sql`now()` }).where(and(eq(tableSession.venueId, venueId), eq(tableSession.id, sessionId)));
  await tx
    .update(serviceCall)
    .set({ acknowledgedAt: sql`now()` })
    .where(and(eq(serviceCall.venueId, venueId), eq(serviceCall.sessionId, sessionId), isNull(serviceCall.acknowledgedAt)));
}
