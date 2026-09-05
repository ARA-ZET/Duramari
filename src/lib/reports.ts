import {
  MONTH_SHORT,
  computeYear,
  keyToMonthIndex,
  num,
  round2,
  totalSavingsRand,
} from "./budget";
import { categorySpend, savingsByMonth, type YearArchive } from "./archive";
import { isCalendarCycle, periodNoun, periodRangeLabel } from "./period";
import type { BudgetData } from "./types";

/** One month on the reporting timeline, from an archive or the live year. */
export interface MonthPoint {
  key: string;
  /** "Sep 26" — short enough for an axis. */
  label: string;
  /**
   * The dates the period actually covers, e.g. "25 Aug – 24 Sep". Empty on a
   * calendar cycle, where the label already says it. Charts and tables show
   * this so a pay-cycle point is never read as the calendar month it names.
   */
  range: string;
  income: number;
  spent: number;
  saved: number;
  savingsRand: number;
  savingsRate: number;
  byBucket: Record<string, number>;
  byCategory: Record<string, number>;
  live: boolean;
}

function label(key: string): string {
  return `${MONTH_SHORT[keyToMonthIndex(key)] ?? "?"} ${key.slice(2, 4)}`;
}

function rate(saved: number, income: number): number {
  return income > 0 ? saved / income : 0;
}

/**
 * Archived years followed by the live year, trimmed to months that actually
 * happened — otherwise every chart ends in a run of empty future months.
 */
export function reportSeries(data: BudgetData, archives: YearArchive[]): MonthPoint[] {
  const points: MonthPoint[] = [];

  // A closed year keeps the pay date it was budgeted on, so its points describe
  // the cycles that were actually in force then, not today's setting.
  for (const a of [...archives].sort((x, y) => x.year - y.year)) {
    for (const m of a.months) {
      points.push({
        key: m.key,
        label: label(m.key),
        range: isCalendarCycle(a.payDay) ? "" : periodRangeLabel(m.key, a.payDay),
        income: m.totalIncome,
        spent: m.totalSpent,
        saved: m.saved,
        savingsRand: m.savingsRand,
        savingsRate: rate(m.saved, m.totalIncome),
        byBucket: Object.fromEntries(m.buckets.map((b) => [b.bucket, b.spent])),
        byCategory: m.byCategory ?? {},
        live: false,
      });
    }
  }

  const summaries = computeYear(data);
  const savings = savingsByMonth(data);
  const payDay = data.settings?.payDay;
  for (const m of summaries) {
    points.push({
      key: m.key,
      label: label(m.key),
      range: isCalendarCycle(payDay) ? "" : periodRangeLabel(m.key, payDay),
      income: round2(m.totalIncome),
      spent: round2(m.totalSpent),
      saved: round2(m.saved),
      savingsRand: savings[m.key] ?? 0,
      savingsRate: rate(m.saved, m.totalIncome),
      byBucket: Object.fromEntries(m.buckets.map((b) => [b.bucket, round2(b.spent)])),
      byCategory: categorySpend(data, m.key),
      live: true,
    });
  }

  // drop the empty tail (future months of the live year)
  let end = points.length;
  while (end > 0) {
    const p = points[end - 1];
    if (p.income === 0 && p.spent === 0) end--;
    else break;
  }
  const trimmed = points.slice(0, end);

  // a brand-new budget with nothing in it still deserves the current month
  return trimmed.length ? trimmed : points.slice(0, 1);
}

/** The last `n` points, or all of them. */
export function lastN<T>(arr: T[], n: number): T[] {
  return n >= arr.length ? arr.slice() : arr.slice(arr.length - n);
}

// ---------------- insights ----------------

export type InsightTone = "good" | "warn" | "info" | "critical";

export interface Insight {
  id: string;
  tone: InsightTone;
  /** Short glyph for the badge — no colour-alone signalling. */
  glyph: string;
  headline: string;
  detail: string;
}

/** Average monthly spend over the most recent months that had any activity. */
export function typicalSpend(series: MonthPoint[], months = 3): number {
  const active = series.filter((p) => p.spent > 0);
  if (!active.length) return 0;
  const recent = lastN(active, months);
  return recent.reduce((s, p) => s + p.spent, 0) / recent.length;
}

/** Months of typical spending the current savings would cover. */
export function runwayMonths(data: BudgetData, series: MonthPoint[]): number | null {
  const spend = typicalSpend(series);
  if (spend <= 0) return null;
  return totalSavingsRand(data) / spend;
}

/**
 * Observations computed from the user's own numbers. Each one returns nothing
 * when there isn't enough history to say it honestly.
 */
export function buildInsights(
  data: BudgetData,
  series: MonthPoint[],
  currentKey: string,
): Insight[] {
  const out: Insight[] = [];
  const fmt = (v: number) =>
    "R" + Math.round(Math.abs(v)).toLocaleString("en-ZA");

  // Periods are pay cycles unless the pay day is the 1st, and every sentence
  // below counts periods — so it has to name them for what they are.
  const payDay = data.settings?.payDay;
  const noun = (n: number) => periodNoun(payDay, n);
  const calendar = isCalendarCycle(payDay);
  /** "a month" / "a cycle" — the short form that reads well mid-sentence. */
  const per = calendar ? "a month" : "a cycle";
  /** The one-word form, for compounds: "six-cycle", not "six-pay cycle". */
  const unit = calendar ? "month" : "cycle";
  /** "this month", or the cycle's real dates when a month would be a lie. */
  const thisPeriod = calendar ? "this month" : periodRangeLabel(currentKey, payDay);

  // ---- runway ----
  const runway = runwayMonths(data, series);
  if (runway !== null && Number.isFinite(runway)) {
    const target = 6;
    out.push({
      id: "runway",
      tone: runway >= target ? "good" : runway >= 3 ? "warn" : "critical",
      glyph: "⏱",
      headline: `Your savings cover ${runway.toFixed(1)} ${noun(2)} of spending.`,
      detail:
        runway >= target
          ? `That clears the usual six-${unit} emergency target, on ${fmt(typicalSpend(series))} of typical spending ${per}.`
          : `A six-${unit} buffer at ${fmt(typicalSpend(series))} ${per} would be ${fmt(typicalSpend(series) * target)}. You are ${fmt(typicalSpend(series) * target - totalSavingsRand(data))} short.`,
    });
  }

  // ---- category anomaly, current period vs its own recent average ----
  const current = series.find((p) => p.key === currentKey);
  const prior = series.filter((p) => p.key < currentKey);
  if (current && prior.length >= 3) {
    const window = lastN(prior, 6);
    // Saving more than usual is not an overspend; only real outgoings count.
    const savingsAccounts = new Set(data.accounts.map((a) => a.name));
    let worst: { name: string; now: number; avg: number; lift: number } | null = null;
    for (const [name, now] of Object.entries(current.byCategory)) {
      if (now <= 0 || savingsAccounts.has(name)) continue;
      const history = window.map((p) => p.byCategory[name] ?? 0);
      const avg = history.reduce((s, v) => s + v, 0) / history.length;
      if (avg <= 0) continue;
      const lift = (now - avg) / avg;
      if (lift > 0.3 && now - avg > 200 && (!worst || lift > worst.lift)) {
        worst = { name, now, avg, lift };
      }
    }
    if (worst) {
      out.push({
        id: "anomaly",
        tone: "warn",
        glyph: "!",
        headline: `${worst.name} is ${Math.round(worst.lift * 100)}% above its recent average.`,
        detail: `${fmt(worst.now)} ${calendar ? "this month" : `over ${thisPeriod}`} against a ${window.length}-${unit} average of ${fmt(worst.avg)} — ${fmt(worst.now - worst.avg)} more than usual.`,
      });
    }
  }

  // ---- bucket fit: is the percentage split itself wrong? ----
  const funded = series.filter((p) => p.income > 0);
  if (funded.length >= 3) {
    const window = lastN(funded, 6);
    for (const b of data.settings.buckets) {
      let over = 0;
      let worstShare = 0;
      for (const p of window) {
        const spent = p.byBucket[b.name] ?? 0;
        const allocated = p.income * num(b.pct);
        if (spent > allocated) over++;
        worstShare = Math.max(worstShare, p.income > 0 ? spent / p.income : 0);
      }
      if (over >= Math.ceil(window.length / 2) && worstShare > num(b.pct)) {
        // round up to the next half percent so the suggestion actually covers it
        const suggested = Math.ceil(worstShare * 200) / 200;
        const donor = data.settings.buckets
          .filter((x) => x.name !== b.name)
          .map((x) => {
            const slack = window.reduce(
              (s, p) => s + (p.income * num(x.pct) - (p.byBucket[x.name] ?? 0)),
              0,
            );
            return { name: x.name, slack: slack / window.length };
          })
          .sort((x, y) => y.slack - x.slack)[0];

        out.push({
          id: `fit-${b.name}`,
          tone: "info",
          glyph: "%",
          headline: `${b.name} went over its ${(num(b.pct) * 100).toFixed(0)}% share in ${over} of the last ${window.length} ${noun(window.length)}.`,
          detail:
            `At ${(suggested * 100).toFixed(1)}% it would have covered every one of them.` +
            (donor && donor.slack > 0
              ? ` ${donor.name} has been under-spending by about ${fmt(donor.slack)} ${per} and could give it up.`
              : ""),
        });
        break; // one split suggestion at a time is actionable; five is noise
      }
    }
  }

  // ---- seasonal drawdown ----
  const drawdowns = series.filter((p) => p.saved < 0);
  if (drawdowns.length && series.length >= 6) {
    const total = drawdowns.reduce((s, p) => s + Math.abs(p.saved), 0);
    // Spelling out the dates gets unreadable past a handful, and by then the
    // headline has already said these are cycles rather than months.
    const names = drawdowns
      .map((p) => (drawdowns.length <= 3 && p.range ? `${p.label} (${p.range})` : p.label))
      .join(", ");
    out.push({
      id: "drawdown",
      tone: "warn",
      glyph: "↓",
      headline: `${drawdowns.length === 1 ? `One ${noun(1)}` : `${drawdowns.length} ${noun(2)}`} pulled ${fmt(total)} back out of savings.`,
      detail: `${names}. Setting aside ${fmt(total / 12)} ${per} would cover the same dip next time without touching your savings.`,
    });
  }

  // ---- year-end forecast ----
  const livePeriods = series.filter((p) => p.live && p.income > 0);
  if (livePeriods.length >= 2) {
    const avgSaved =
      livePeriods.reduce((s, p) => s + p.saved, 0) / livePeriods.length;
    const done = keyToMonthIndex(livePeriods[livePeriods.length - 1].key) + 1;
    const remaining = 12 - done;
    if (remaining > 0) {
      const projected = totalSavingsRand(data) + avgSaved * remaining;
      const goal = data.accounts.reduce((s, a) => s + num(a.goal), 0);
      // On a pay cycle the budget year's last period ends before 31 December,
      // so "end of 2026" would name a date the forecast does not reach.
      const year = data.settings.budgetYear;
      const lastDay = periodRangeLabel(`${year}-12`, payDay).split("–").pop()?.trim();
      const when = calendar ? `${year}` : `the ${year} budget year (to ${lastDay})`;
      out.push({
        id: "forecast",
        tone: goal > 0 && projected < goal ? "warn" : "good",
        glyph: "→",
        headline: `On track to end ${when} with about ${fmt(projected)}.`,
        detail:
          goal > 0
            ? projected >= goal
              ? `That clears your combined ${fmt(goal)} of account goals.`
              : `That is ${fmt(goal - projected)} short of your combined ${fmt(goal)} of account goals — about ${fmt((goal - projected) / remaining)} more ${per}.`
            : `Based on ${fmt(avgSaved)} saved ${per} across ${livePeriods.length} ${noun(livePeriods.length)}, with ${remaining} to go.`,
      });
    }
  }

  return out;
}
