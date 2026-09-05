import {
  accountBalances,
  computeYear,
  monthKeys,
  num,
  round2,
  totalSavingsRand,
} from "./budget";
import { clampPayDay, periodRange } from "./period";
import type { AccountKind, BudgetData } from "./types";

/**
 * A closed year is stored rolled-up, not raw: twelve month summaries in one
 * document. That keeps a multi-year report to one cheap read per year instead
 * of paging thousands of transactions nobody will scroll through.
 */

export interface ArchivedBucket {
  bucket: string;
  pct: number;
  allocated: number;
  topup: number;
  spent: number;
  carryIn: number;
  balance: number;
}

export interface ArchivedMonth {
  key: string;
  income: number;
  extraIncome: number;
  totalIncome: number;
  totalSpent: number;
  totalBalance: number;
  /** Net moved into savings accounts that month. */
  saved: number;
  /** Total across every account, in rand, at that month's end. */
  savingsRand: number;
  buckets: ArchivedBucket[];
  /** Spend per category, for the "where did it go" breakdown. */
  byCategory: Record<string, number>;
}

export interface ArchivedAccount {
  id: string;
  name: string;
  kind: AccountKind;
  /** Closing balance in the account's own currency. */
  closing: number;
}

export interface YearArchive {
  year: number;
  /** The pay date this year was budgeted on, so its labels stay meaningful. */
  payDay?: number;
  months: ArchivedMonth[];
  accounts: ArchivedAccount[];
  closingSavingsRand: number;
  archivedAt: number;
}

/** Everything up to and including `cutoff`, for point-in-time balances. */
function sliceThrough(data: BudgetData, cutoff: string): BudgetData {
  // The period can end mid-calendar-month, so use its real last day.
  const { end } = periodRange(cutoff, data.settings?.payDay);
  return {
    ...data,
    transactions: data.transactions.filter((t) => t.monthKey <= cutoff),
    usdLedger: data.usdLedger.filter((e) => e.date <= end),
  };
}

/**
 * Total savings in rand at the end of each month of the budget year.
 * Walks the ledger once per month — fine at personal-budget scale, and it
 * reuses the same balance rules the Accounts page shows.
 */
export function savingsByMonth(data: BudgetData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of monthKeys(num(data.settings.budgetYear))) {
    out[key] = round2(totalSavingsRand(sliceThrough(data, key)));
  }
  return out;
}

/** Spend per category for one month (expenses net of income entries). */
export function categorySpend(data: BudgetData, monthKey: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of data.transactions) {
    if (t.monthKey !== monthKey || t.type === "transfer") continue;
    const delta = t.type === "expense" ? num(t.amount) : -num(t.amount);
    out[t.category] = round2((out[t.category] ?? 0) + delta);
  }
  return out;
}

/** Roll the live budget year up into the document that will outlive it. */
export function buildYearArchive(data: BudgetData): YearArchive {
  const year = num(data.settings.budgetYear);
  const summaries = computeYear(data);
  const savings = savingsByMonth(data);

  const months: ArchivedMonth[] = summaries.map((m) => ({
    key: m.key,
    income: round2(m.income),
    extraIncome: round2(m.extraIncome),
    totalIncome: round2(m.totalIncome),
    totalSpent: round2(m.totalSpent),
    totalBalance: round2(m.totalBalance),
    saved: round2(m.saved),
    savingsRand: savings[m.key] ?? 0,
    buckets: m.buckets.map((b) => ({
      bucket: b.bucket,
      pct: b.pct,
      allocated: round2(b.allocated),
      topup: round2(b.topup),
      spent: round2(b.spent),
      carryIn: round2(b.carryIn),
      balance: round2(b.balance),
    })),
    byCategory: categorySpend(data, m.key),
  }));

  return {
    year,
    payDay: clampPayDay(data.settings?.payDay),
    months,
    accounts: accountBalances(data).map((b) => ({
      id: b.account.id,
      name: b.account.name,
      kind: b.account.kind,
      closing: round2(b.balance),
    })),
    closingSavingsRand: round2(totalSavingsRand(data)),
    archivedAt: Date.now(),
  };
}

/** Guard against a malformed archive document breaking every report. */
export function normalizeArchive(input: unknown): YearArchive | null {
  const a = input as YearArchive | null;
  if (!a || typeof a !== "object" || !Number.isFinite(num(a.year))) return null;
  return {
    year: Math.trunc(num(a.year)),
    payDay: clampPayDay(a.payDay ?? 1),
    months: (Array.isArray(a.months) ? a.months : [])
      .filter((m) => m && typeof m.key === "string")
      .map((m) => ({
        key: m.key,
        income: num(m.income),
        extraIncome: num(m.extraIncome),
        totalIncome: num(m.totalIncome),
        totalSpent: num(m.totalSpent),
        totalBalance: num(m.totalBalance),
        saved: num(m.saved),
        savingsRand: num(m.savingsRand),
        buckets: (Array.isArray(m.buckets) ? m.buckets : [])
          .filter((b) => b && typeof b.bucket === "string")
          .map((b) => ({
            bucket: b.bucket,
            pct: num(b.pct),
            allocated: num(b.allocated),
            topup: num(b.topup),
            spent: num(b.spent),
            carryIn: num(b.carryIn),
            balance: num(b.balance),
          })),
        byCategory:
          m.byCategory && typeof m.byCategory === "object"
            ? Object.fromEntries(Object.entries(m.byCategory).map(([k, v]) => [k, num(v)]))
            : {},
      })),
    accounts: (Array.isArray(a.accounts) ? a.accounts : [])
      .filter((x) => x && typeof x.name === "string")
      .map((x) => ({
        id: String(x.id ?? x.name),
        name: x.name,
        kind: x.kind === "usd" ? "usd" : "zar",
        closing: num(x.closing),
      })),
    closingSavingsRand: num(a.closingSavingsRand),
    archivedAt: num(a.archivedAt),
  };
}
