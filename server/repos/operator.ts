import { and, asc, eq, gte, sql } from 'drizzle-orm';
import type { NewVenueInput } from '../../shared/schemas';
import type { OpeningDay, PaymentMethod } from '../../shared/types';
import { hashPassword, newQrToken, temporaryPassword } from '../auth/crypto';
import type { Db } from '../db/client';
import { diningTable, payment, serviceCall, staffUser, venue } from '../db/schema';
import { ApiError, isUniqueViolation } from '../http';

/*
 * The Urdho team's tools for the pilot: setting up a venue and reading how venues use the app.
 * These are the only functions that work across venues. They are reachable only from the
 * command line or through /api/operator with the operator token, never from a venue's dashboard.
 */

const DEFAULT_HOURS: OpeningDay[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: true, from: '08:00', to: '23:00' }));

export interface CreatedVenue {
  venue: { id: string; name: string; slug: string };
  owner: { name: string; email: string; temporaryPassword: string };
  tables: { number: number; qrToken: string }[];
}

/** A venue, its tables and its owner, who must choose their own password at first sign-in. */
export async function createVenueWithOwner(db: Db, input: NewVenueInput): Promise<CreatedVenue> {
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  try {
    return await db.transaction(async (tx) => {
      const [slugTaken] = await tx.select({ id: venue.id }).from(venue).where(eq(venue.slug, input.slug));
      if (slugTaken) throw new ApiError(409, 'slug_taken');
      const [emailTaken] = await tx.select({ id: staffUser.id }).from(staffUser).where(sql`lower(${staffUser.email}) = ${input.ownerEmail}`);
      if (emailTaken) throw new ApiError(409, 'email_taken');

      const [created] = await tx
        .insert(venue)
        .values({ name: input.name, slug: input.slug, openingHours: DEFAULT_HOURS })
        .returning({ id: venue.id, name: venue.name, slug: venue.slug });
      const venueId = created!.id;
      const tables = await tx
        .insert(diningTable)
        .values(Array.from({ length: input.tables }, (_, i) => ({ venueId, number: i + 1, qrToken: newQrToken() })))
        .returning({ number: diningTable.number, qrToken: diningTable.qrToken });
      await tx
        .insert(staffUser)
        .values({ venueId, name: input.ownerName, email: input.ownerEmail, role: 'owner', passwordHash, mustChangePassword: true });
      return {
        venue: created!,
        owner: { name: input.ownerName, email: input.ownerEmail, temporaryPassword: password },
        tables: tables.sort((a, b) => a.number - b.number),
      };
    });
  } catch (error) {
    // Someone else took the slug or email between the check and the insert.
    if (isUniqueViolation(error)) throw new ApiError(409, 'slug_or_email_taken');
    throw error;
  }
}

/* Pilot numbers ------------------------------------------------------------ */

/**
 * Orders count towards their service day: the local date four hours earlier, so a bar's 00:30
 * orders belong to the evening they were part of.
 */
const SERVICE_DAY_SHIFT_HOURS = 4;

export interface VenueStats {
  venue: { id: string; name: string; slug: string; createdAt: string };
  /** Orders that weren't cancelled, and their value in lekë. */
  orders: number;
  cancelled: number;
  valueLek: number;
  /** Table sessions with at least one order: a group of guests who ordered from their phones. */
  tableVisits: number;
  waiterCalls: number;
  /** Bills marked paid, by how the table paid. */
  paid: Record<PaymentMethod, { bills: number; lek: number }>;
  /** Service days in the period on which the venue was open, and on how many of them guests ordered. */
  openDays: number;
  daysWithOrders: number;
  /** Orders per service day, oldest first. */
  byDay: { date: string; orders: number }[];
  lastOrderAt: string | null;
}

export interface PilotStats {
  days: number;
  generatedAt: string;
  venues: VenueStats[];
}

/** Today's date (YYYY-MM-DD) for a service day in the venue's time zone. */
function serviceDate(at: Date, timezone: string): string {
  const shifted = new Date(at.getTime() - SERVICE_DAY_SHIFT_HOURS * 3_600_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted);
}

/** The last `days` service dates up to and including today's, oldest first. */
function serviceDates(days: number, timezone: string, now: Date): string[] {
  const today = serviceDate(now, timezone);
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.UTC(y!, m! - 1, d! - (days - 1 - i)));
    return date.toISOString().slice(0, 10);
  });
}

/** Monday = 0, matching OpeningDay. */
const weekday = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

function openOn(date: string, hours: OpeningDay[]): boolean {
  if (hours.length === 0) return true; // no hours set: always open
  return hours.some((h) => h.day === weekday(date) && h.open);
}

/** How every venue used the app over the last `days` service days. */
export async function pilotStats(db: Db, days: number, now = new Date()): Promise<PilotStats> {
  // A day more than asked for, so the earliest service day is complete in every time zone.
  const since = new Date(now.getTime() - (days + 1) * 86_400_000);

  const venues = await db
    .select({ id: venue.id, name: venue.name, slug: venue.slug, timezone: venue.timezone, openingHours: venue.openingHours, createdAt: venue.createdAt })
    .from(venue)
    .orderBy(asc(venue.createdAt));

  // One row per order with its value: line price plus option surcharges, times quantity.
  const orderRows = await db.execute<{ venue_id: string; session_id: string; status: string; created_at: string; value_lek: number }>(sql`
    select o.venue_id, o.session_id, o.status, o.created_at,
           coalesce(sum(oi.qty * (oi.unit_price_lek + coalesce(opt.delta_lek, 0))), 0)::int as value_lek
      from guest_order o
      left join order_item oi on oi.order_id = o.id and oi.venue_id = o.venue_id
      left join lateral (
        select sum(x.price_delta_lek)::int as delta_lek
          from order_item_option x
         where x.order_item_id = oi.id and x.venue_id = oi.venue_id
      ) opt on true
     where o.created_at >= ${since.toISOString()}
     group by o.id`);

  const calls = await db
    .select({ venueId: serviceCall.venueId, at: serviceCall.createdAt })
    .from(serviceCall)
    .where(gte(serviceCall.createdAt, since));

  const payments = await db
    .select({ venueId: payment.venueId, method: payment.method, amountLek: payment.amountLek, at: payment.confirmedAt })
    .from(payment)
    .where(and(eq(payment.status, 'confirmed'), gte(payment.confirmedAt, since)));

  return {
    days,
    generatedAt: now.toISOString(),
    venues: venues.map((v) => {
      const dates = serviceDates(days, v.timezone, now);
      const inPeriod = (at: Date | string | null) => at !== null && dates.includes(serviceDate(new Date(at), v.timezone));
      const orders = orderRows.rows.filter((o) => o.venue_id === v.id && inPeriod(o.created_at));
      const kept = orders.filter((o) => o.status !== 'cancelled');
      const perDay = new Map(dates.map((date) => [date, 0]));
      for (const o of kept) {
        const date = serviceDate(new Date(o.created_at), v.timezone);
        perDay.set(date, (perDay.get(date) ?? 0) + 1);
      }
      const paid: VenueStats['paid'] = { cash: { bills: 0, lek: 0 }, card: { bills: 0, lek: 0 } };
      for (const p of payments.filter((p) => p.venueId === v.id && inPeriod(p.at))) {
        paid[p.method].bills += 1;
        paid[p.method].lek += p.amountLek;
      }
      const last = kept.map((o) => new Date(o.created_at).getTime()).sort((a, b) => b - a)[0];
      return {
        venue: { id: v.id, name: v.name, slug: v.slug, createdAt: v.createdAt.toISOString() },
        orders: kept.length,
        cancelled: orders.length - kept.length,
        valueLek: kept.reduce((sum, o) => sum + Number(o.value_lek), 0),
        tableVisits: new Set(kept.map((o) => o.session_id)).size,
        waiterCalls: calls.filter((c) => c.venueId === v.id && inPeriod(c.at)).length,
        paid,
        openDays: dates.filter((date) => openOn(date, v.openingHours)).length,
        daysWithOrders: [...perDay.values()].filter((n) => n > 0).length,
        byDay: [...perDay].map(([date, n]) => ({ date, orders: n })),
        lastOrderAt: last ? new Date(last).toISOString() : null,
      };
    }),
  };
}
