import { MONTH_NAMES, MONTH_SHORT, num } from "./budget";

/**
 * Pay-cycle periods
 * -----------------
 * A budget "month" runs from pay date to pay date, not 1st to 31st. Someone
 * paid on the 25th lives on that money from 25 Sep to 24 Oct, so a purchase on
 * 26 Sep belongs to the *next* budget period, not September's.
 *
 * A period is labelled by the calendar month holding most of its days: a period
 * starting on the 25th is mostly in the following month, so it takes that name.
 * That reduces to "pay date >= 16 shifts the label forward one month", which is
 * what `LABEL_SHIFT_FROM` encodes. Every screen also shows the literal date
 * range, so the label never has to be guessed at.
 */

export const PAY_DAY_MIN = 1;
/** Capped at 28 so every month has the day — no 30th-of-February clamping. */
export const PAY_DAY_MAX = 28;
const LABEL_SHIFT_FROM = 16;

export function clampPayDay(day: unknown): number {
  const n = Math.trunc(num(day)) || 1;
  return Math.min(PAY_DAY_MAX, Math.max(PAY_DAY_MIN, n));
}

/** True when periods are plain calendar months. */
export function isCalendarCycle(payDay: unknown): boolean {
  return clampPayDay(payDay) === 1;
}

interface YM {
  y: number;
  m: number; // 1-12
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseISO(date: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function addMonths({ y, m }: YM, delta: number): YM {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

function daysInMonth({ y, m }: YM): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function iso({ y, m }: YM, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The day before `date`, as an ISO string. */
function dayBefore(date: string): string {
  const p = parseISO(date);
  if (!p) return date;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d));
  t.setUTCDate(t.getUTCDate() - 1);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const labelShift = (payDay: number) => (payDay >= LABEL_SHIFT_FROM ? 1 : 0);

/** Which budget period a date falls in, as a "YYYY-MM" key. */
export function periodKeyFor(date: string, payDay: unknown): string {
  const p = clampPayDay(payDay);
  const parsed = parseISO(date);
  if (!parsed) return (date ?? "").slice(0, 7);
  if (p === 1) return `${parsed.y}-${pad(parsed.m)}`;

  // before pay day means we are still spending the previous period's money
  let start: YM = { y: parsed.y, m: parsed.m };
  if (parsed.d < p) start = addMonths(start, -1);

  const labelled = addMonths(start, labelShift(p));
  return `${labelled.y}-${pad(labelled.m)}`;
}

export interface PeriodRange {
  /** First day of the period, inclusive. */
  start: string;
  /** Last day of the period, inclusive. */
  end: string;
}

/** The calendar dates a period key covers. */
export function periodRange(key: string, payDay: unknown): PeriodRange {
  const p = clampPayDay(payDay);
  const [ys, ms] = (key ?? "").split("-");
  const ym: YM = { y: Number(ys), m: Number(ms) };
  if (!Number.isFinite(ym.y) || !Number.isFinite(ym.m)) {
    return { start: `${key}-01`, end: `${key}-28` };
  }
  if (p === 1) {
    return { start: iso(ym, 1), end: iso(ym, daysInMonth(ym)) };
  }
  const start = addMonths(ym, -labelShift(p));
  const nextPay = addMonths(start, 1);
  return { start: iso(start, p), end: dayBefore(iso(nextPay, p)) };
}

/** "25 Sep – 24 Oct" — shown wherever a period label could be ambiguous. */
export function periodRangeLabel(key: string, payDay: unknown): string {
  const { start, end } = periodRange(key, payDay);
  const a = parseISO(start);
  const b = parseISO(end);
  if (!a || !b) return "";
  const fmt = (x: { m: number; d: number }) => `${x.d} ${MONTH_SHORT[x.m - 1] ?? ""}`;
  return `${fmt(a)} – ${fmt(b)}`;
}

/** "25 Dec 2025" — an ISO date written the way the rest of the app reads. */
export function formatDate(date: string): string {
  const p = parseISO(date);
  return p ? `${p.d} ${MONTH_SHORT[p.m - 1] ?? "?"} ${p.y}` : date;
}

/** "1st", "2nd", "3rd", "25th" — for naming the pay day in prose. */
export function ordinalDay(day: unknown): string {
  const n = clampPayDay(day);
  // 11th-13th are the exceptions the last-digit rule gets wrong
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/**
 * What to call a budget period in prose. On a calendar cycle it really is a
 * month; on a pay cycle it is not, and calling it one makes a report read as
 * though it covered the 1st to the 31st when it covered the 25th to the 24th.
 */
export function periodNoun(payDay: unknown, count = 1): string {
  const one = isCalendarCycle(payDay) ? "month" : "pay cycle";
  return count === 1 ? one : `${one}s`;
}

/**
 * "Sep 26" on calendar months; "Sep 26 (25 Aug – 24 Sep)" on a pay cycle,
 * where the short label alone would be read as the calendar month.
 */
export function periodShortLabel(key: string, shortLabel: string, payDay: unknown): string {
  if (isCalendarCycle(payDay)) return shortLabel;
  const range = periodRangeLabel(key, payDay);
  return range ? `${shortLabel} (${range})` : shortLabel;
}

/** "October 2026" — the period's own name. */
export function periodLabel(key: string): string {
  const [y, m] = (key ?? "").split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? "?"} ${y}`;
}

/** The period "today" falls in, clamped into the budget year. */
export function currentPeriodKey(year: number, payDay: unknown): string {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const key = periodKeyFor(today, payDay);
  const y = Number(key.slice(0, 4));
  if (y === year) return key;
  return y < year ? `${year}-01` : `${year}-12`;
}

/** Is this date inside the given period? */
export function isInPeriod(date: string, key: string, payDay: unknown): boolean {
  const { start, end } = periodRange(key, payDay);
  return date >= start && date <= end;
}

/**
 * A sensible default date when adding to a period: today when today is inside
 * it, otherwise the day the period starts.
 */
export function defaultDateForPeriod(key: string, payDay: unknown): string {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return isInPeriod(today, key, payDay) ? today : periodRange(key, payDay).start;
}

/** Days remaining until the period ends — "9 days to pay day". */
export function daysLeftInPeriod(key: string, payDay: unknown): number {
  const { end } = periodRange(key, payDay);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const p = parseISO(end);
  if (!p) return 0;
  const last = Date.UTC(p.y, p.m - 1, p.d);
  return Math.max(0, Math.round((last - today) / 86400000));
}

/**
 * How far through a period today is: which day of how many, and that as a
 * fraction. Spending 80% of the money on day 5 of 30 is the thing worth
 * knowing, and it needs the elapsed share to say so.
 */
export function periodProgress(
  key: string,
  payDay: unknown,
): { day: number; total: number; fraction: number } {
  const { start, end } = periodRange(key, payDay);
  const a = parseISO(start);
  const b = parseISO(end);
  if (!a || !b) return { day: 0, total: 0, fraction: 0 };

  const first = Date.UTC(a.y, a.m - 1, a.d);
  const last = Date.UTC(b.y, b.m - 1, b.d);
  const total = Math.round((last - first) / 86400000) + 1;

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  // a period that has not started reads as day 0; a finished one is full
  const day = Math.min(total, Math.max(0, Math.round((today - first) / 86400000) + 1));
  return { day, total, fraction: total > 0 ? day / total : 0 };
}
