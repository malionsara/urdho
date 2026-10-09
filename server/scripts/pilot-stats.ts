import { parseArgs } from 'node:util';
import { formatLek } from '../../shared/money';
import { createDb } from '../db/client';
import { requireEnv } from '../env';
import { pilotStats, type PilotStats, type VenueStats } from '../repos/operator';
import { callLive } from './live';

/*
 * How each venue used Urdho over the last days: what the Phase 2 gate asks ("three pilot venues
 * order at every service") and what the owner talks need (orders per table, card share).
 *
 *   pnpm pilot:stats [--days 14] [--live]
 */

const { values } = parseArgs({ options: { days: { type: 'string', default: '14' }, live: { type: 'boolean', default: false } } });
const days = Math.min(90, Math.max(1, Number.parseInt(values.days, 10) || 14));

async function load(): Promise<PilotStats> {
  if (values.live) return callLive<PilotStats>('GET', `/stats?days=${days}`);
  const { db, pool } = createDb(requireEnv('DATABASE_URL'));
  try {
    return await pilotStats(db, days);
  } finally {
    await pool.end();
  }
}

const BARS = '▁▂▃▄▅▆▇█'; // ▁ to █
const sparkline = (counts: number[]) => {
  const max = Math.max(...counts, 1);
  return counts.map((n) => (n === 0 ? '·' : BARS[Math.max(1, Math.round((n / max) * 8)) - 1])).join('');
};

const NBSP = String.fromCharCode(0xa0);
const lek = (n: number) => formatLek(n).split(NBSP).join(' ');
const pad = (text: string | number, width: number) => String(text).padEnd(width);
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Tirane', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';

function print(v: VenueStats) {
  const paidBills = v.paid.cash.bills + v.paid.card.bills;
  const paidLek = v.paid.cash.lek + v.paid.card.lek;
  const cardShare = paidLek > 0 ? Math.round((v.paid.card.lek / paidLek) * 100) : 0;
  const perTable = v.tableVisits > 0 ? (v.orders / v.tableVisits).toFixed(1) : '–';
  const first = v.byDay[0]?.date.slice(5) ?? '';
  const last = v.byDay.at(-1)?.date.slice(5) ?? '';

  console.log(`${v.venue.name}  (${v.venue.slug})`);
  console.log(`  ${pad('orders', 12)}${pad(v.orders + (v.cancelled ? `  (${v.cancelled} cancelled)` : ''), 26)}tables served  ${v.tableVisits}   ${perTable} orders a table`);
  console.log(`  ${pad('value', 12)}${pad(lek(v.valueLek), 26)}waiter calls   ${v.waiterCalls}`);
  console.log(
    `  ${pad('paid', 12)}${paidBills} bills, ${lek(paidLek)}` +
      (paidBills ? `: cash ${v.paid.cash.bills} (${lek(v.paid.cash.lek)}), card ${v.paid.card.bills} (${lek(v.paid.card.lek)}), ${cardShare}% by card` : ''),
  );
  console.log(`  ${pad('ordered on', 12)}${pad(`${v.daysWithOrders} of ${v.openDays} open days`, 26)}last order     ${when(v.lastOrderAt)}`);
  console.log(`  ${pad('by day', 12)}${first} ${sparkline(v.byDay.map((d) => d.orders))} ${last}\n`);
}

const stats = await load();
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
console.log(
  `\nPilot numbers${values.live ? ' (live)' : ' (local database)'}, last ${plural(stats.days, 'service day')}, ${plural(stats.venues.length, 'venue')}\n`,
);
for (const v of stats.venues) print(v);
