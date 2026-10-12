import { describe, expect, it } from 'vitest';
import type { Venue } from '@shared/types';
import { PACE_MS, servicePace } from './pace';

const venue = {
  timezone: 'Europe/Tirane',
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: true, from: '08:00', to: '23:00' })),
} as Venue;
// Tirana is two hours ahead of UTC in October.
const at = (time: string) => new Date(`2026-10-14T${time}:00Z`);
const OPEN = at('10:00');
const CLOSED = at('01:00');

describe('how often the dashboard asks for news', () => {
  it('every 3 seconds while something waits for staff, open or not', () => {
    expect(servicePace({ waiting: true, openTables: 0, venue, now: OPEN })).toBe(PACE_MS.busy);
    expect(servicePace({ waiting: true, openTables: 0, venue, now: CLOSED })).toBe(PACE_MS.busy);
  });

  it('every 10 seconds in opening hours when nothing waits', () => {
    expect(servicePace({ waiting: false, openTables: 0, venue, now: OPEN })).toBe(PACE_MS.quiet);
  });

  it('every 10 seconds after closing time while a table still has a bill', () => {
    expect(servicePace({ waiting: false, openTables: 2, venue, now: CLOSED })).toBe(PACE_MS.quiet);
  });

  it('every 30 minutes once closed and every table is settled, so the database can sleep', () => {
    expect(servicePace({ waiting: false, openTables: 0, venue, now: CLOSED })).toBe(PACE_MS.closed);
    expect(servicePace({ waiting: false, openTables: 0, venue, now: at('21:01') })).toBe(PACE_MS.closed); // 23:01 in Tirana
  });

  it('counts as open until the venue has loaded', () => {
    expect(servicePace({ waiting: false, openTables: 0, venue: undefined, now: CLOSED })).toBe(PACE_MS.quiet);
  });
});
