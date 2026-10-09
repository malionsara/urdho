import { formatLek } from '../shared/money';
import type { PilotStats, VenueStats } from './repos/operator';

/*
 * The morning message to the team's Telegram: yesterday's service at every venue, so a venue that
 * stopped ordering is noticed the next day, not at the end of the pilot. Built from pilotStats over
 * one service day; Vercel runs it every morning (/api/cron/daily-summary).
 */

const NBSP = String.fromCharCode(0xa0);
const lek = (n: number) => formatLek(n).split(NBSP).join(' ');
const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

/** "Thu 9 Oct" for a service date (YYYY-MM-DD). */
function dayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function venueLine(v: VenueStats): string {
  const paidLek = v.paid.cash.lek + v.paid.card.lek;
  const paid = paidLek > 0 ? `; paid ${lek(paidLek)} (cash ${lek(v.paid.cash.lek)}, card ${lek(v.paid.card.lek)})` : '';
  const calls = v.waiterCalls > 0 ? `, ${plural(v.waiterCalls, 'waiter call')}` : '';
  const cancelled = v.cancelled > 0 ? `, ${v.cancelled} cancelled` : '';
  return `• ${v.venue.name}: ${plural(v.orders, 'order')}${cancelled}, ${lek(v.valueLek)}, ${plural(v.tableVisits, 'table')}${calls}${paid}`;
}

export function dailySummaryText(stats: PilotStats): string {
  const date = stats.venues[0]?.byDay.at(-1)?.date;
  const heading = `☀️ Urdho, yesterday${date ? ` (${dayName(date)})` : ''}`;
  if (stats.venues.length === 0) return `${heading}\nNo venues yet.`;

  const busy = stats.venues.filter((v) => v.orders > 0 || v.cancelled > 0).sort((a, b) => b.orders - a.orders);
  // A venue closed that day isn't missing: only open ones without orders are worth a look.
  const quiet = stats.venues.filter((v) => !busy.includes(v) && v.openDays > 0);
  const orders = busy.reduce((sum, v) => sum + v.orders, 0);
  const value = busy.reduce((sum, v) => sum + v.valueLek, 0);

  return [
    heading,
    busy.length > 0 ? `${plural(orders, 'order')}, ${lek(value)}, at ${plural(busy.length, 'venue')}` : 'No orders anywhere.',
    ...busy.map(venueLine),
    quiet.length > 0 ? `Open but no orders: ${quiet.map((v) => v.venue.name).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
