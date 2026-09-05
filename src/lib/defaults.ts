import { num } from "./budget";
import { clampPayDay, periodKeyFor } from "./period";
import { SCHEMA_VERSION, uniqueName } from "./mutations";
import type { Account, BudgetData, Settings, TxType } from "./types";

export const DEFAULT_BUCKETS = [
  { name: "Savings", pct: 0.4 },
  { name: "Family & Friends", pct: 0.1 },
  { name: "Rent, Food & Household", pct: 0.35 },
  { name: "Business – Arazet Design", pct: 0.15 },
];

export const DEFAULT_CATEGORIES = [
  { name: "Longterm Cash", bucket: "Savings" },
  { name: "Longterm ZAR/USD Cash", bucket: "Savings" },
  { name: "Wealth Group", bucket: "Savings" },
  { name: "Family", bucket: "Family & Friends" },
  { name: "Friends", bucket: "Family & Friends" },
  { name: "Church", bucket: "Family & Friends" },
  { name: "Charity", bucket: "Family & Friends" },
  { name: "Rent", bucket: "Rent, Food & Household" },
  { name: "Food", bucket: "Rent, Food & Household" },
  { name: "Household stuff", bucket: "Rent, Food & Household" },
  { name: "Lunch", bucket: "Rent, Food & Household" },
  { name: "Xneelo", bucket: "Business – Arazet Design" },
  { name: "Google", bucket: "Business – Arazet Design" },
  { name: "Claude", bucket: "Business – Arazet Design" },
  { name: "Other Subscription", bucket: "Business – Arazet Design" },
  { name: "Tech Events & Transport", bucket: "Business – Arazet Design" },
  { name: "Business Finance", bucket: "Business – Arazet Design" },
];

export function defaultSettings(year = new Date().getFullYear()): Settings {
  return {
    budgetYear: year,
    payDay: 1,
    typicalIncome: 16000,
    usdRate: 18.5,
    buckets: DEFAULT_BUCKETS.map((b) => ({ ...b })),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  };
}

export function defaultAccounts(): Account[] {
  return [
    { id: "acc-longterm", name: "Longterm Cash", kind: "zar", opening: 0, order: 0 },
    { id: "acc-zarusd", name: "Longterm ZAR/USD Cash", kind: "zar", opening: 0, order: 1 },
    { id: "acc-wealth", name: "Wealth Group", kind: "zar", opening: 0, order: 2 },
    { id: "acc-usd", name: "USD Account", kind: "usd", opening: 0, order: 3 },
  ];
}

export function defaultData(year?: number): BudgetData {
  return {
    settings: defaultSettings(year),
    accounts: defaultAccounts(),
    months: {},
    transactions: [],
    usdLedger: [],
    debtors: [],
    groceries: {},
    version: SCHEMA_VERSION,
  };
}

/**
 * Repair anything loaded from storage so the rest of the app can assume a
 * well-formed shape: missing arrays, NaN amounts, duplicate names, transactions
 * whose bucket drifted away from their category, and stale month keys.
 *
 * Returns the same object when nothing needed changing, so callers can skip a
 * pointless write back to Firestore.
 */
export function normalize(input: BudgetData | null | undefined): BudgetData {
  const base = defaultData();
  if (!input || typeof input !== "object") return base;

  const payDay = clampPayDay(input.settings?.payDay ?? 1);
  const settings: Settings = {
    budgetYear: Math.trunc(num(input.settings?.budgetYear)) || base.settings.budgetYear,
    payDay,
    typicalIncome: num(input.settings?.typicalIncome),
    usdRate: num(input.settings?.usdRate),
    buckets: [],
    categories: [],
  };

  // buckets: unique names, numeric percentages
  const bucketNames: string[] = [];
  for (const b of input.settings?.buckets ?? base.settings.buckets) {
    if (!b || typeof b.name !== "string") continue;
    const name = uniqueName(b.name, bucketNames);
    bucketNames.push(name);
    settings.buckets.push({ name, pct: num(b.pct) });
  }
  if (!settings.buckets.length) settings.buckets = base.settings.buckets;

  const bucketSet = new Set(settings.buckets.map((b) => b.name));
  const fallbackBucket = settings.buckets[0]?.name ?? "";

  // categories: unique names, bucket must exist
  const catNames: string[] = [];
  for (const c of input.settings?.categories ?? []) {
    if (!c || typeof c.name !== "string") continue;
    const name = uniqueName(c.name, catNames);
    catNames.push(name);
    settings.categories.push({
      name,
      bucket: bucketSet.has(c.bucket) ? c.bucket : fallbackBucket,
    });
  }

  // accounts: unique ids and names, numeric opening
  const accIds: string[] = [];
  const accNames: string[] = [];
  const accounts: Account[] = [];
  for (const [i, a] of (input.accounts ?? []).entries()) {
    if (!a || typeof a.name !== "string") continue;
    const id = uniqueName(String(a.id ?? `acc-${i}`), accIds);
    accIds.push(id);
    const name = uniqueName(a.name, accNames);
    accNames.push(name);
    accounts.push({
      id,
      name,
      kind: a.kind === "usd" ? "usd" : "zar",
      opening: num(a.opening),
      order: typeof a.order === "number" ? a.order : i,
      goal: num(a.goal) > 0 ? num(a.goal) : undefined,
      note: typeof a.note === "string" && a.note ? a.note : undefined,
    });
  }

  // every rand account needs a category to receive deposits
  for (const a of accounts) {
    if (a.kind !== "zar") continue;
    if (settings.categories.some((c) => c.name === a.name)) continue;
    settings.categories.push({
      name: a.name,
      bucket: settings.buckets.find((b) => /saving/i.test(b.name))?.name ?? fallbackBucket,
    });
  }

  const catByName = new Map(settings.categories.map((c) => [c.name, c.bucket]));
  const accNameSet = new Set(accounts.map((a) => a.name));

  // transactions: valid date/month, positive amount, bucket resynced to category
  const transactions = (input.transactions ?? [])
    .filter((t) => t && typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
    .map((t, i) => {
      const type: TxType = t.type === "income" || t.type === "transfer" ? t.type : "expense";
      const category = typeof t.category === "string" ? t.category : "";
      const known = catByName.get(category);
      const transferTo =
        type === "transfer" && t.transferTo && accNameSet.has(t.transferTo) ? t.transferTo : undefined;
      const toAmount = transferTo ? num(t.toAmount) || undefined : undefined;
      return {
        id: typeof t.id === "string" && t.id ? t.id : `tx-${i}-${t.date}`,
        date: t.date,
        // always re-derived, so a changed pay date can never leave stale keys
        monthKey: periodKeyFor(t.date, payDay),
        category,
        // a category's bucket is the source of truth; historic drift gets fixed
        bucket: known ?? (bucketSet.has(t.bucket) ? t.bucket : fallbackBucket),
        type,
        amount: Math.abs(num(t.amount)),
        transferTo,
        toAmount,
        description: typeof t.description === "string" && t.description ? t.description : undefined,
        createdAt: typeof t.createdAt === "number" ? t.createdAt : undefined,
      };
    });
  // ids must be unique or React keys and deletes misbehave
  const seenTx = new Set<string>();
  for (const t of transactions) {
    if (seenTx.has(t.id)) t.id = `${t.id}-${seenTx.size}`;
    seenTx.add(t.id);
  }

  // months: numeric income, overrides only for buckets that still exist
  const months: BudgetData["months"] = {};
  for (const [key, md] of Object.entries(input.months ?? {})) {
    if (!/^\d{4}-\d{2}$/.test(key) || !md) continue;
    const overrides: Record<string, number> = {};
    for (const [b, v] of Object.entries(md.pctOverrides ?? {})) {
      if (bucketSet.has(b) && Number.isFinite(num(v))) overrides[b] = num(v);
    }
    months[key] = {
      key,
      income: num(md.income),
      extraIncome: num(md.extraIncome),
      pctOverrides: Object.keys(overrides).length ? overrides : undefined,
    };
  }

  const firstUsd = accounts.find((a) => a.kind === "usd");
  const usdIds = new Set(accounts.filter((a) => a.kind === "usd").map((a) => a.id));
  const usdLedger = (input.usdLedger ?? [])
    .filter((e) => e && typeof e.date === "string")
    .map((e, i) => ({
      id: typeof e.id === "string" && e.id ? e.id : `usd-${i}`,
      date: e.date,
      description: typeof e.description === "string" && e.description ? e.description : undefined,
      usdIn: Math.abs(num(e.usdIn)),
      usdOut: Math.abs(num(e.usdOut)),
      accountId: e.accountId && usdIds.has(e.accountId) ? e.accountId : firstUsd?.id,
    }))
    .filter((e) => Boolean(e.accountId));

  const debtors = (input.debtors ?? [])
    .filter((d) => d && typeof d.name === "string")
    .map((d, i) => ({
      id: typeof d.id === "string" && d.id ? d.id : `debtor-${i}`,
      date: typeof d.date === "string" ? d.date : "",
      name: d.name,
      description: typeof d.description === "string" && d.description ? d.description : undefined,
      lent: num(d.lent),
      repaid: num(d.repaid),
    }));

  const groceries: BudgetData["groceries"] = {};
  for (const [key, list] of Object.entries(input.groceries ?? {})) {
    if (!/^\d{4}-\d{2}$/.test(key) || !list) continue;
    const items = (Array.isArray(list.items) ? list.items : [])
      .filter((i) => i && typeof i.name === "string" && i.name.trim())
      .map((i, n) => ({
        id: typeof i.id === "string" && i.id ? i.id : `gi-${key}-${n}`,
        name: i.name.trim(),
        qty: typeof i.qty === "string" && i.qty ? i.qty : undefined,
        estimate: Math.abs(num(i.estimate)),
        bought: Boolean(i.bought),
        actual: num(i.actual) > 0 ? Math.abs(num(i.actual)) : undefined,
      }));
    groceries[key] = {
      key,
      items,
      category: catByName.has(list.category)
        ? list.category
        : settings.categories.find((c) => /food|grocer/i.test(c.name))?.name ??
          settings.categories[0]?.name ??
          "",
      loggedTxId:
        typeof list.loggedTxId === "string" && transactions.some((t) => t.id === list.loggedTxId)
          ? list.loggedTxId
          : undefined,
      loggedAt: num(list.loggedAt) || undefined,
    };
  }

  return {
    settings,
    accounts,
    months,
    transactions,
    usdLedger,
    debtors,
    groceries,
    version: SCHEMA_VERSION,
  };
}

/** True when `normalize` actually had to change something. */
export function needsRepair(input: BudgetData | null | undefined): boolean {
  if (!input) return true;
  return JSON.stringify(normalize(input)) !== JSON.stringify(input);
}
