import { useEffect, useState } from 'react';
import { isOrderingOpen } from '@shared/hours';
import type { Venue } from '@shared/types';

/*
 * How often the dashboard asks the server for news. Every question wakes the database and counts
 * against the hosting plan's monthly allowance, so the board only asks often when it matters: a
 * tablet left on the counter overnight used to ask every 3 seconds until morning.
 */
export const PACE_MS = {
  /** Something is waiting for staff: a new or cooking order, a waiter call, a running bill. */
  busy: 3_000,
  /** Open, with nothing waiting: a new order still shows within 10 seconds. */
  quiet: 10_000,
  /** Outside opening hours with every table settled: nothing can arrive, so the database can sleep. */
  closed: 30 * 60_000,
};

interface PaceInput {
  /** Anything on screen staff still have to act on. */
  waiting: boolean;
  /** Tables with a bill or an unanswered call: their guests can still call after closing time. */
  openTables: number;
  /** Until the venue (and so its hours) has loaded, it counts as open. */
  venue: Venue | undefined;
  now: Date;
}

export function servicePace({ waiting, openTables, venue, now }: PaceInput): number {
  if (waiting) return PACE_MS.busy;
  if (!venue || openTables > 0 || isOrderingOpen(venue.openingHours, venue.timezone, now)) return PACE_MS.quiet;
  return PACE_MS.closed;
}

/** The current time, updated twice a minute: enough to notice the venue opening. */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
