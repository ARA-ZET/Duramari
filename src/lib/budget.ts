import type {
  Account,
  BudgetData,
  BucketDef,
  MonthDoc,
  Transaction,
} from "./types";
// period.ts imports the month names from here, so this pairing is circular.
// Both directions are used only inside function bodies, which ES modules
// resolve fine — keep it that way and never call across at module scope.
import { clampPayDay, formatDate, isCalendarCycle, ordinalDay, periodRange } from "./period";

// ---------- numbers ----------

/** Coerce anything that reached us from storage/inputs into a usable number. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Round to 2dp to keep float drift out of stored balances. */
export function round2(v: number): number {
  return Math.round((num(v) + Number.EPSILON) * 100) / 100;
}

// ---------- formatting ----------

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function randFmt(v: number, decimals = 0): string {
  const n = num(v);
  const sign = n < 0 ? "-" : "";
  return (
    sign +
    "R" +
    Math.abs(n).toLocaleString("en-ZA", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function usdFmt(v: number, decimals = 2): string {
  const n = num(v);
  const sign = n < 0 ? "-" : "";
  return (
    sign +
    "$" +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

// ---------- month helpers ----------

/** "YYYY-MM" keys for the 12 months of a budget year. */
export function monthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export function keyToMonthIndex(key: string): number {
  return Number(key.split("-")[1]) - 1; // 0-11
}

export function keyToYear(key: string): number {
  return Number(key.split("-")[0]);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? "?"} ${y}`;
}

export function dateToMonthKey(date: string): string {
  return date.slice(0, 7);
}

/** Today in the *browser's* timezone. `toISOString()` would give the UTC day,
 *  which is the previous day for SAST users between midnight and 02:00. */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The month key for "now", clamped into the budget year.
 *
 * Prefer `currentPeriodKey(year, payDay)` from ./period — this stays for the
 * plain-calendar case and is what it falls back to when no pay date is set.
 */
export function currentMonthKey(year: number): string {
  const now = new Date();
  if (now.getFullYear() === year) {
    return `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  if (now.getFullYear() < year) return `${year}-01`;
  return `${year}-12`;
}

/** Clamp any date into the budget year, keeping day-of-month where possible. */
export function clampDateToYear(date: string, year: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${year}-01-01`;
  if (keyToYear(date) === year) return date;
  return `${year}${date.slice(4)}`;
}

// ---------- derived model ----------

export interface BucketMonth {
  bucket: string;
  pct: number;
  allocated: number;
  topup: number;
  spent: number;
  carryIn: number;
  /** carryIn + allocated + topup - spent (rolls forward). */
  balance: number;
  /** carryIn + allocated + topup — what there was to spend. */
  spendable: number;
}

export interface MonthSummary {
  key: string;
  income: number;
  extraIncome: number;
  totalIncome: number;
  buckets: BucketMonth[];
  totalAllocated: number;
  totalSpent: number;
  totalBalance: number;
  /** Sum of bucket percentages actually applied this month. */
  pctTotal: number;
  /** Income not covered by the bucket percentages (pctTotal < 100%). */
  unallocated: number;
  /** Spending on buckets that no longer exist — otherwise invisible money. */
  orphanSpent: number;
  orphanBuckets: string[];
  /** Net moved into savings accounts this month (deposits - withdrawals). */
  saved: number;
}

function monthDoc(data: BudgetData, key: string): MonthDoc {
  const md = data.months?.[key];
  return {
    key,
    income: num(md?.income),
    extraIncome: num(md?.extraIncome),
    pctOverrides: md?.pctOverrides,
  };
}

export function bucketPct(data: BudgetData, key: string, bucket: BucketDef): number {
  const override = data.months?.[key]?.pctOverrides?.[bucket.name];
  return typeof override === "number" && Number.isFinite(override) ? override : num(bucket.pct);
}

export function hasPctOverride(data: BudgetData, key: string, bucketName: string): boolean {
  const v = data.months?.[key]?.pctOverrides?.[bucketName];
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Compute every month of the budget year with per-bucket rollover.
 * Each bucket's ending balance carries into the same bucket next month.
 */
export function computeYear(data: BudgetData): MonthSummary[] {
  const year = num(data.settings?.budgetYear) || new Date().getFullYear();
  const keys = monthKeys(year);
  const buckets = data.settings?.buckets ?? [];
  const bucketNames = new Set(buckets.map((b) => b.name));
  const savingsAccounts = new Set(
    (data.accounts ?? []).filter((a) => a.kind === "zar").map((a) => a.name),
  );

  // group transactions by monthKey
  const byMonth = new Map<string, Transaction[]>();
  for (const t of data.transactions ?? []) {
    const mk = t.monthKey || dateToMonthKey(t.date ?? "");  // stored key is a period key
    const arr = byMonth.get(mk);
    if (arr) arr.push(t);
    else byMonth.set(mk, [t]);
  }

  const carry: Record<string, number> = {}; // running balance per bucket
  for (const b of buckets) carry[b.name] = 0;

  const out: MonthSummary[] = [];
  for (const key of keys) {
    const md = monthDoc(data, key);
    const totalIncome = md.income + md.extraIncome;
    const txs = byMonth.get(key) ?? [];

    const rows: BucketMonth[] = buckets.map((b) => {
      const pct = bucketPct(data, key, b);
      const allocated = totalIncome * pct;
      let spent = 0;
      let topup = 0;
      for (const t of txs) {
        if (t.bucket !== b.name) continue;
        const amt = num(t.amount);
        if (t.type === "expense") spent += amt;
        else if (t.type === "income") topup += amt;
        // transfers move money between accounts; the bucket already released it
      }
      const carryIn = carry[b.name] ?? 0;
      const spendable = carryIn + allocated + topup;
      const balance = spendable - spent;
      carry[b.name] = balance;
      return { bucket: b.name, pct, allocated, topup, spent, carryIn, balance, spendable };
    });

    // Spending pointed at a bucket that has since been renamed or deleted.
    let orphanSpent = 0;
    const orphanBuckets = new Set<string>();
    let saved = 0;
    for (const t of txs) {
      const amt = num(t.amount);
      if (!bucketNames.has(t.bucket) && t.type !== "transfer") {
        orphanSpent += t.type === "expense" ? amt : -amt;
        if (t.bucket) orphanBuckets.add(t.bucket);
      }
      if (savingsAccounts.has(t.category)) {
        if (t.type === "expense") saved += amt;
        else if (t.type === "income") saved -= amt;
      }
    }

    const totalAllocated = rows.reduce((s, r) => s + r.allocated, 0);
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
    const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
    const pctTotal = rows.reduce((s, r) => s + r.pct, 0);

    out.push({
      key,
      income: md.income,
      extraIncome: md.extraIncome,
      totalIncome,
      buckets: rows,
      totalAllocated,
      totalSpent,
      totalBalance,
      pctTotal,
      unallocated: totalIncome - totalAllocated,
      orphanSpent,
      orphanBuckets: [...orphanBuckets],
      saved,
    });
  }
  return out;
}

export function summaryFor(year: MonthSummary[], key: string): MonthSummary | undefined {
  return year.find((m) => m.key === key);
}

// ---------- accounts ----------

export interface AccountBalance {
  account: Account;
  /** Movement in native currency (R for zar, $ for usd). */
  movement: number;
  /** Balance in native currency. */
  balance: number;
  /** Balance expressed in rand (equals balance for zar accounts). */
  balanceRand: number;
  /** Progress toward `account.goal`, 0..1, or null when no goal is set. */
  goalProgress: number | null;
}

/**
 * Net movement of a rand account from the transaction log.
 *  expense  -> deposit into the account
 *  income   -> withdrawal back out to spend
 *  transfer -> money leaving this account (or arriving, via `transferTo`)
 */
export function zarAccountMovement(name: string, txs: Transaction[]): number {
  let net = 0;
  for (const t of txs) {
    if (t.category === name) {
      const amt = num(t.amount);
      if (t.type === "expense") net += amt;
      else if (t.type === "income") net -= amt;
      else if (t.type === "transfer") net -= amt;
    }
    // the receiving leg of a transfer
    if (t.type === "transfer" && t.transferTo === name) {
      net += num(t.toAmount ?? t.amount);
    }
  }
  return net;
}

/** Dollar balance of one USD account: opening + ledger + incoming transfers. */
export function usdAccountBalance(
  data: BudgetData,
  account: Account,
): { usd: number; usdIn: number; usdOut: number } {
  const usdAccounts = (data.accounts ?? []).filter((a) => a.kind === "usd");
  const isFirst = usdAccounts[0]?.id === account.id;
  let usdIn = 0;
  let usdOut = 0;
  for (const e of data.usdLedger ?? []) {
    // Legacy entries carry no accountId — they belong to the original USD account.
    const owner = e.accountId ?? (isFirst ? account.id : undefined);
    if (owner !== account.id) continue;
    usdIn += num(e.usdIn);
    usdOut += num(e.usdOut);
  }
  for (const t of data.transactions ?? []) {
    if (t.type === "transfer" && t.transferTo === account.name) {
      usdIn += num(t.toAmount ?? 0);
    }
  }
  return { usd: num(account.opening) + usdIn - usdOut, usdIn, usdOut };
}

/** Combined dollar position across every USD account. */
export function usdBalance(data: BudgetData): { usd: number; usdIn: number; usdOut: number } {
  let usd = 0;
  let usdIn = 0;
  let usdOut = 0;
  for (const a of data.accounts ?? []) {
    if (a.kind !== "usd") continue;
    const r = usdAccountBalance(data, a);
    usd += r.usd;
    usdIn += r.usdIn;
    usdOut += r.usdOut;
  }
  return { usd, usdIn, usdOut };
}

/** The USD entries belonging to a given account (legacy entries to the first). */
export function usdEntriesFor(data: BudgetData, accountId: string) {
  const usdAccounts = (data.accounts ?? []).filter((a) => a.kind === "usd");
  const isFirst = usdAccounts[0]?.id === accountId;
  return (data.usdLedger ?? []).filter(
    (e) => (e.accountId ?? (isFirst ? accountId : undefined)) === accountId,
  );
}

export function accountBalances(data: BudgetData): AccountBalance[] {
  const rate = num(data.settings?.usdRate);
  const txs = data.transactions ?? [];
  return (data.accounts ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
    .map((account) => {
      const opening = num(account.opening);
      const goal = num(account.goal);
      if (account.kind === "usd") {
        const { usd } = usdAccountBalance(data, account);
        return {
          account,
          movement: usd - opening,
          balance: usd,
          balanceRand: usd * rate,
          goalProgress: goal > 0 ? usd / goal : null,
        };
      }
      const movement = zarAccountMovement(account.name, txs);
      const balance = opening + movement;
      return {
        account,
        movement,
        balance,
        balanceRand: balance,
        goalProgress: goal > 0 ? balance / goal : null,
      };
    });
}

export function totalSavingsRand(data: BudgetData): number {
  return accountBalances(data).reduce((s, a) => s + a.balanceRand, 0);
}

// ---------- debtors ----------

export function debtorOutstanding(data: BudgetData): number {
  return (data.debtors ?? []).reduce((s, d) => s + (num(d.lent) - num(d.repaid)), 0);
}

// ---------- categories ----------

export function bucketForCategory(data: BudgetData, category: string): string {
  return data.settings?.categories?.find((c) => c.name === category)?.bucket ?? "";
}

/** Category names that are backed by a real account (savings destinations). */
export function accountCategoryNames(data: BudgetData): Set<string> {
  return new Set((data.accounts ?? []).map((a) => a.name));
}

export function isAccountCategory(data: BudgetData, category: string): boolean {
  return accountCategoryNames(data).has(category);
}

// ---------- integrity ----------

export interface Issue {
  level: "warn" | "error";
  message: string;
}

/** Problems worth showing the user rather than silently swallowing. */
export function findIssues(data: BudgetData): Issue[] {
  const issues: Issue[] = [];
  const buckets = data.settings?.buckets ?? [];
  const categories = data.settings?.categories ?? [];
  const bucketNames = new Set(buckets.map((b) => b.name));
  const year = num(data.settings?.budgetYear);

  const pctTotal = buckets.reduce((s, b) => s + num(b.pct), 0);
  if (buckets.length && Math.abs(pctTotal - 1) > 0.0005) {
    issues.push({
      level: "warn",
      message: `Bucket percentages add up to ${(pctTotal * 100).toFixed(1)}%, not 100%.`,
    });
  }

  const dupBuckets = buckets.map((b) => b.name).filter((n, i, a) => a.indexOf(n) !== i);
  if (dupBuckets.length) {
    issues.push({ level: "error", message: `Duplicate bucket names: ${[...new Set(dupBuckets)].join(", ")}.` });
  }
  const dupCats = categories.map((c) => c.name).filter((n, i, a) => a.indexOf(n) !== i);
  if (dupCats.length) {
    issues.push({ level: "error", message: `Duplicate category names: ${[...new Set(dupCats)].join(", ")}.` });
  }

  const orphanCats = categories.filter((c) => !bucketNames.has(c.bucket)).map((c) => c.name);
  if (orphanCats.length) {
    issues.push({
      level: "error",
      message: `These categories point at a bucket that no longer exists: ${orphanCats.join(", ")}.`,
    });
  }

  const orphanTx = (data.transactions ?? []).filter(
    (t) => t.type !== "transfer" && !bucketNames.has(t.bucket),
  );
  if (orphanTx.length) {
    issues.push({
      level: "error",
      message: `${orphanTx.length} transaction(s) belong to a missing bucket and are left out of the bucket totals.`,
    });
  }

  const offYear = (data.transactions ?? []).filter((t) => keyToYear(t.monthKey || t.date || "") !== year);
  if (offYear.length) {
    // On a pay cycle the budget year runs pay day to pay day, so a date inside
    // calendar 2026 can still fall in a 2027 cycle. Saying only "outside 2026"
    // would look like a bug to anyone reading the date on the transaction.
    const payDay = clampPayDay(data.settings?.payDay);
    const cycle = isCalendarCycle(payDay)
      ? ""
      : ` The ${year} budget year runs ${formatDate(periodRange(`${year}-01`, payDay).start)} to ${formatDate(periodRange(`${year}-12`, payDay).end)}, because you are paid on the ${ordinalDay(payDay)}.`;
    issues.push({
      level: "warn",
      message: `${offYear.length} transaction(s) fall outside ${year} and are not shown in this year's months.${cycle}`,
    });
  }

  const accountNames = (data.accounts ?? []).map((a) => a.name);
  const dupAcc = accountNames.filter((n, i, a) => a.indexOf(n) !== i);
  if (dupAcc.length) {
    issues.push({
      level: "error",
      message: `Two accounts share the name ${[...new Set(dupAcc)].join(", ")} — balances will be wrong until one is renamed.`,
    });
  }

  const badTransfers = (data.transactions ?? []).filter(
    (t) => t.type === "transfer" && (!t.transferTo || !accountNames.includes(t.transferTo)),
  );
  if (badTransfers.length) {
    issues.push({
      level: "warn",
      message: `${badTransfers.length} transfer(s) have no valid destination account, so the receiving side is not counted.`,
    });
  }

  if (num(data.settings?.usdRate) <= 0 && (data.accounts ?? []).some((a) => a.kind === "usd")) {
    issues.push({ level: "warn", message: "USD → ZAR rate is 0, so dollar balances show as R0." });
  }

  return issues;
}
