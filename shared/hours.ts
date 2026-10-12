import type { OpeningDay } from './types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** The weekday (0 = Monday) and minute of the day at `at`, in the venue's time zone. */
function localTime(timezone: string, at: Date): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: WEEKDAYS.indexOf(part('weekday')), minute: Number(part('hour')) * 60 + Number(part('minute')) };
}

/**
 * Whether guests may order at `at`. Hours are local to the venue. A closing time at or before the
 * opening time runs past midnight (18:00–02:00), and 00:00–00:00 means all day. A venue that has
 * set no hours at all is always open, so an unfinished setup never blocks orders.
 */
export function isOrderingOpen(hours: OpeningDay[], timezone: string, at = new Date()): boolean {
  if (hours.length === 0) return true;
  const { day, minute } = localTime(timezone, at);
  const today = hours.find((d) => d.day === day);
  const yesterday = hours.find((d) => d.day === (day + 6) % 7);

  if (today?.open) {
    const from = minutes(today.from);
    const to = minutes(today.to);
    if (to > from ? minute >= from && minute < to : minute >= from) return true;
  }
  // The part of last night's opening that runs past midnight.
  if (yesterday?.open) {
    const from = minutes(yesterday.from);
    const to = minutes(yesterday.to);
    if (to <= from && minute < to) return true;
  }
  return false;
}
