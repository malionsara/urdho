import { describe, expect, it } from 'vitest';
import type { OpeningDay } from './types';
import { isOrderingOpen } from './hours';

const week = (from: string, to: string, closedDays: number[] = []): OpeningDay[] =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: !closedDays.includes(day), from, to }));

// Tirana is UTC+2 in October (summer time) and UTC+1 in winter.
const tirana = (iso: string) => new Date(iso);

describe('opening hours', () => {
  it('opens and closes on the minute, in the venue time zone', () => {
    const hours = week('08:00', '23:00');
    // Thursday 8 October 2026: 07:59 and 08:00 in Tirana are 05:59 and 06:00 UTC.
    expect(isOrderingOpen(hours, 'Europe/Tirane', tirana('2026-10-08T05:59:00Z'))).toBe(false);
    expect(isOrderingOpen(hours, 'Europe/Tirane', tirana('2026-10-08T06:00:00Z'))).toBe(true);
    expect(isOrderingOpen(hours, 'Europe/Tirane', tirana('2026-10-08T20:59:00Z'))).toBe(true);
    expect(isOrderingOpen(hours, 'Europe/Tirane', tirana('2026-10-08T21:00:00Z'))).toBe(false);
  });

  it('follows winter time', () => {
    // 15 January 2027 is UTC+1: 08:00 in Tirana is 07:00 UTC.
    expect(isOrderingOpen(week('08:00', '23:00'), 'Europe/Tirane', tirana('2027-01-15T06:59:00Z'))).toBe(false);
    expect(isOrderingOpen(week('08:00', '23:00'), 'Europe/Tirane', tirana('2027-01-15T07:00:00Z'))).toBe(true);
  });

  it('stays shut on a closed day', () => {
    // 8 October 2026 is a Thursday (day 3).
    expect(isOrderingOpen(week('08:00', '23:00', [3]), 'Europe/Tirane', tirana('2026-10-08T10:00:00Z'))).toBe(false);
  });

  it('runs a late night past midnight into the next morning', () => {
    const hours = week('18:00', '02:00');
    expect(isOrderingOpen(hours, 'Europe/Tirane', tirana('2026-10-08T22:30:00Z'))).toBe(true); // 00:30 Friday
    expect(isOrderingOpen(hours, 'Europe/Tirane', tirana('2026-10-09T00:30:00Z'))).toBe(false); // 02:30
    expect(isOrderingOpen(hours, 'Europe/Tirane', tirana('2026-10-08T14:00:00Z'))).toBe(false); // 16:00
  });

  it("closes after midnight when last night's opening day was closed", () => {
    // Thursday closed: no late Thursday night in the early hours of Friday.
    expect(isOrderingOpen(week('18:00', '02:00', [3]), 'Europe/Tirane', tirana('2026-10-08T22:30:00Z'))).toBe(false);
  });

  it('treats 00:00–00:00 as all day, and no hours at all as always open', () => {
    expect(isOrderingOpen(week('00:00', '00:00'), 'Europe/Tirane', tirana('2026-10-08T01:00:00Z'))).toBe(true);
    expect(isOrderingOpen([], 'Europe/Tirane', tirana('2026-10-08T01:00:00Z'))).toBe(true);
  });
});
