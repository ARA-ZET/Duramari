import { num, round2 } from "./budget";
import { clampPayDay, periodKeyFor } from "./period";
import type {
  Account,
  GroceryItem,
  GroceryList,
  BudgetData,
  BucketDef,
  CategoryDef,
  Debtor,
  MonthDoc,
  Transaction,
  UsdEntry,
} from "./types";

export const SCHEMA_VERSION = 2;

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Make `name` unique within `taken` by appending " 2", " 3", … */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const base = name.trim() || "Untitled";
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

// ---- settings ----

export function setSettings(patch: Partial<BudgetData["settings"]>) {
  return (d: BudgetData): BudgetData => ({ ...d, settings: { ...d.settings, ...patch } });
}

/**
 * Change the pay date and re-file every transaction and shopping list into the
 * period it now belongs to. Without the re-filing, existing history would keep
 * its old period keys and every report would be quietly wrong.
 */
export function setPayDay(day: number) {
  return (d: BudgetData): BudgetData => {
    const payDay = clampPayDay(day);
    if (payDay === clampPayDay(d.settings.payDay)) return d;

    const transactions = d.transactions.map((t) => ({
      ...t,
      monthKey: periodKeyFor(t.date, payDay),
    }));

    // A list follows the period its own dates now fall in; lists are keyed by
    // period, so re-key them the same way using the period's old start date.
    const groceries: Record<string, GroceryList> = {};
    for (const [key, list] of Object.entries(d.groceries ?? {})) {
      const moved = periodKeyFor(`${key}-15`, payDay);
      const target = groceries[moved];
      groceries[moved] = target
        ? { ...target, items: [...target.items, ...list.items] }
        : { ...list, key: moved };
    }

    return {
      ...d,
      settings: { ...d.settings, payDay },
      transactions,
      groceries,
    };
  };
}

export function setBuckets(buckets: BucketDef[]) {
  return (d: BudgetData): BudgetData => ({ ...d, settings: { ...d.settings, buckets } });
}

export function addBucket(name = "New bucket", pct = 0) {
  return (d: BudgetData): BudgetData => {
    const unique = uniqueName(name, d.settings.buckets.map((b) => b.name));
    return {
      ...d,
      settings: { ...d.settings, buckets: [...d.settings.buckets, { name: unique, pct: num(pct) }] },
    };
  };
}

export function setBucketPct(name: string, pct: number) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    settings: {
      ...d.settings,
      buckets: d.settings.buckets.map((b) => (b.name === name ? { ...b, pct: num(pct) } : b)),
    },
  });
}

/**
 * Rename a bucket everywhere it is referenced: categories, transactions and
 * every month's percentage overrides. Without the cascade the old name is
 * orphaned and its spending silently drops out of the totals.
 */
export function renameBucket(from: string, to: string) {
  return (d: BudgetData): BudgetData => {
    const target = to.trim();
    if (!target || target === from) return d;
    const unique = uniqueName(target, d.settings.buckets.filter((b) => b.name !== from).map((b) => b.name));

    const months: Record<string, MonthDoc> = {};
    for (const [key, md] of Object.entries(d.months ?? {})) {
      if (!md.pctOverrides || !(from in md.pctOverrides)) {
        months[key] = md;
        continue;
      }
      const { [from]: moved, ...rest } = md.pctOverrides;
      months[key] = { ...md, pctOverrides: { ...rest, [unique]: moved } };
    }

    return {
      ...d,
      settings: {
        ...d.settings,
        buckets: d.settings.buckets.map((b) => (b.name === from ? { ...b, name: unique } : b)),
        categories: d.settings.categories.map((c) => (c.bucket === from ? { ...c, bucket: unique } : c)),
      },
      months,
      transactions: d.transactions.map((t) => (t.bucket === from ? { ...t, bucket: unique } : t)),
    };
  };
}

/**
 * Remove a bucket. Categories and transactions pointing at it are moved to
 * `reassignTo`; passing undefined drops them from the budget entirely.
 */
export function deleteBucket(name: string, reassignTo?: string) {
  return (d: BudgetData): BudgetData => {
    const buckets = d.settings.buckets.filter((b) => b.name !== name);
    const valid = reassignTo && buckets.some((b) => b.name === reassignTo) ? reassignTo : "";

    const months: Record<string, MonthDoc> = {};
    for (const [key, md] of Object.entries(d.months ?? {})) {
      if (!md.pctOverrides || !(name in md.pctOverrides)) {
        months[key] = md;
        continue;
      }
      const { [name]: _removed, ...rest } = md.pctOverrides;
      months[key] = { ...md, pctOverrides: rest };
    }

    const categories = valid
      ? d.settings.categories.map((c) => (c.bucket === name ? { ...c, bucket: valid } : c))
      : d.settings.categories.filter((c) => c.bucket !== name);

    const transactions = valid
      ? d.transactions.map((t) => (t.bucket === name ? { ...t, bucket: valid } : t))
      : d.transactions.filter((t) => t.bucket !== name);

    return { ...d, settings: { ...d.settings, buckets, categories }, months, transactions };
  };
}

/** Scale every bucket percentage so they sum to exactly 100%. */
export function normalizeBucketPcts() {
  return (d: BudgetData): BudgetData => {
    const total = d.settings.buckets.reduce((s, b) => s + num(b.pct), 0);
    if (total <= 0) return d;
    const buckets = d.settings.buckets.map((b) => ({
      ...b,
      pct: Math.round((num(b.pct) / total) * 10000) / 10000,
    }));
    return { ...d, settings: { ...d.settings, buckets } };
  };
}

// ---- categories ----

export function addCategory(cat: CategoryDef) {
  return (d: BudgetData): BudgetData => {
    const name = uniqueName(cat.name, d.settings.categories.map((c) => c.name));
    const bucket = d.settings.buckets.some((b) => b.name === cat.bucket)
      ? cat.bucket
      : d.settings.buckets[0]?.name ?? "";
    return {
      ...d,
      settings: { ...d.settings, categories: [...d.settings.categories, { name, bucket }] },
    };
  };
}

/**
 * Rename a category and carry its transactions with it. If the category is
 * backed by an account of the same name, that account is renamed too — the two
 * are joined by name, so letting them drift breaks the account balance.
 */
export function renameCategory(from: string, to: string) {
  return (d: BudgetData): BudgetData => {
    const target = to.trim();
    if (!target || target === from) return d;
    const unique = uniqueName(target, d.settings.categories.filter((c) => c.name !== from).map((c) => c.name));
    return {
      ...d,
      settings: {
        ...d.settings,
        categories: d.settings.categories.map((c) => (c.name === from ? { ...c, name: unique } : c)),
      },
      accounts: d.accounts.map((a) => (a.name === from ? { ...a, name: unique } : a)),
      transactions: d.transactions.map((t) => ({
        ...t,
        category: t.category === from ? unique : t.category,
        transferTo: t.transferTo === from ? unique : t.transferTo,
      })),
    };
  };
}

export function setCategoryBucket(name: string, bucket: string) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    settings: {
      ...d.settings,
      categories: d.settings.categories.map((c) => (c.name === name ? { ...c, bucket } : c)),
    },
    // keep historic transactions pointing at the bucket the category now uses
    transactions: d.transactions.map((t) => (t.category === name ? { ...t, bucket } : t)),
  });
}

/** Delete a category. `withTransactions` also removes its history. */
export function deleteCategory(name: string, withTransactions = false) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    settings: { ...d.settings, categories: d.settings.categories.filter((c) => c.name !== name) },
    transactions: withTransactions
      ? d.transactions.filter((t) => t.category !== name && t.transferTo !== name)
      : d.transactions,
  });
}

/** How much history a category/account carries — shown before deleting. */
export function categoryUsage(d: BudgetData, name: string): number {
  return d.transactions.filter((t) => t.category === name || t.transferTo === name).length;
}

// ---- months ----

export function upsertMonth(key: string, patch: Partial<MonthDoc>) {
  return (d: BudgetData): BudgetData => {
    const existing = d.months[key] ?? { key, income: 0, extraIncome: 0 };
    const clean: Partial<MonthDoc> = { ...patch };
    if ("income" in clean) clean.income = num(clean.income);
    if ("extraIncome" in clean) clean.extraIncome = num(clean.extraIncome);
    return { ...d, months: { ...d.months, [key]: { ...existing, ...clean, key } } };
  };
}

export function setPctOverride(key: string, bucket: string, pct: number | undefined) {
  return (d: BudgetData): BudgetData => {
    const existing = d.months[key] ?? { key, income: 0, extraIncome: 0 };
    const overrides = { ...(existing.pctOverrides ?? {}) };
    if (pct === undefined || !Number.isFinite(pct)) delete overrides[bucket];
    else overrides[bucket] = pct;
    return { ...d, months: { ...d.months, [key]: { ...existing, key, pctOverrides: overrides } } };
  };
}

/** Drop every override for a month, returning it to the default split. */
export function clearPctOverrides(key: string) {
  return (d: BudgetData): BudgetData => {
    const existing = d.months[key];
    if (!existing) return d;
    return { ...d, months: { ...d.months, [key]: { ...existing, pctOverrides: {} } } };
  };
}

/** Copy one month's income onto every later month of the year. */
export function copyIncomeForward(fromKey: string) {
  return (d: BudgetData): BudgetData => {
    const src = d.months[fromKey];
    if (!src) return d;
    const year = num(d.settings.budgetYear);
    const months = { ...d.months };
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      if (key <= fromKey) continue;
      const existing = months[key] ?? { key, income: 0, extraIncome: 0 };
      months[key] = { ...existing, key, income: num(src.income) };
    }
    return { ...d, months };
  };
}

// ---- transactions ----

/** Normalise a transaction before it is stored: positive amount, derived month. */
function cleanTx<T extends Partial<Transaction>>(tx: T, d: BudgetData): T {
  const out: Partial<Transaction> = { ...tx };
  if (out.date) out.monthKey = periodKeyFor(out.date, d.settings.payDay);
  if (out.amount !== undefined) out.amount = round2(Math.abs(num(out.amount)));
  if (out.toAmount !== undefined) {
    const v = round2(Math.abs(num(out.toAmount)));
    out.toAmount = v > 0 ? v : undefined;
  }
  if (out.category && out.bucket === undefined) {
    out.bucket = d.settings.categories.find((c) => c.name === out.category)?.bucket ?? "";
  }
  if (out.type && out.type !== "transfer") {
    out.transferTo = undefined;
    out.toAmount = undefined;
  }
  return out as T;
}

export function addTransaction(tx: Omit<Transaction, "id" | "createdAt">) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    transactions: [...d.transactions, { ...cleanTx(tx, d), id: newId(), createdAt: Date.now() }],
  });
}

export function updateTransaction(id: string, patch: Partial<Transaction>) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    transactions: d.transactions.map((t) => (t.id === id ? { ...t, ...cleanTx(patch, d) } : t)),
  });
}

export function deleteTransaction(id: string) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    transactions: d.transactions.filter((t) => t.id !== id),
  });
}

/** Duplicate a transaction into the following month — handy for fixed costs. */
export function repeatTransactionNextMonth(id: string) {
  return (d: BudgetData): BudgetData => {
    const src = d.transactions.find((t) => t.id === id);
    if (!src) return d;
    const dt = new Date(`${src.date}T12:00:00`);
    dt.setMonth(dt.getMonth() + 1);
    const p = (n: number) => String(n).padStart(2, "0");
    const date = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
    return {
      ...d,
      transactions: [
        ...d.transactions,
        { ...src, id: newId(), createdAt: Date.now(), date, monthKey: periodKeyFor(date, d.settings.payDay) },
      ],
    };
  };
}

// ---- accounts ----

export function setAccountOpening(id: string, opening: number) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    accounts: d.accounts.map((a) => (a.id === id ? { ...a, opening: num(opening) } : a)),
  });
}

/**
 * Add an account. Rand accounts also get a matching category so you can save
 * into them from the transaction sheet; USD accounts are driven by the ledger.
 */
export function addAccount(account: Omit<Account, "id">, bucket?: string) {
  return (d: BudgetData): BudgetData => {
    const taken = [...d.accounts.map((a) => a.name), ...d.settings.categories.map((c) => c.name)];
    const name = uniqueName(account.name, taken);
    const id = newId();
    const next: BudgetData = {
      ...d,
      accounts: [
        ...d.accounts,
        {
          ...account,
          name,
          id,
          opening: num(account.opening),
          goal: account.goal ? num(account.goal) : undefined,
          order: account.order ?? d.accounts.length,
        },
      ],
    };
    if (account.kind !== "zar") return next;
    const savings =
      (bucket && d.settings.buckets.find((b) => b.name === bucket)?.name) ??
      d.settings.buckets.find((b) => /saving/i.test(b.name))?.name ??
      d.settings.buckets[0]?.name ??
      "";
    return {
      ...next,
      settings: {
        ...next.settings,
        categories: [...next.settings.categories, { name, bucket: savings }],
      },
    };
  };
}

/** Update an account; a name change cascades to its category and transactions. */
export function updateAccount(id: string, patch: Partial<Account>) {
  return (d: BudgetData): BudgetData => {
    const current = d.accounts.find((a) => a.id === id);
    if (!current) return d;

    const clean: Partial<Account> = { ...patch };
    if ("opening" in clean) clean.opening = num(clean.opening);
    if ("goal" in clean) clean.goal = clean.goal ? num(clean.goal) : undefined;

    let next: BudgetData = {
      ...d,
      accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...clean, name: a.name } : a)),
    };

    const wanted = clean.name?.trim();
    if (wanted && wanted !== current.name) {
      const taken = [
        ...d.accounts.filter((a) => a.id !== id).map((a) => a.name),
        ...d.settings.categories.filter((c) => c.name !== current.name).map((c) => c.name),
      ];
      const unique = uniqueName(wanted, taken);
      next = {
        ...next,
        accounts: next.accounts.map((a) => (a.id === id ? { ...a, name: unique } : a)),
        settings: {
          ...next.settings,
          categories: next.settings.categories.map((c) =>
            c.name === current.name ? { ...c, name: unique } : c,
          ),
        },
        transactions: next.transactions.map((t) => ({
          ...t,
          category: t.category === current.name ? unique : t.category,
          transferTo: t.transferTo === current.name ? unique : t.transferTo,
        })),
      };
    }
    return next;
  };
}

export function moveAccount(id: string, direction: -1 | 1) {
  return (d: BudgetData): BudgetData => {
    const sorted = d.accounts.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const i = sorted.findIndex((a) => a.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= sorted.length) return d;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    const order = new Map(sorted.map((a, idx) => [a.id, idx]));
    return { ...d, accounts: d.accounts.map((a) => ({ ...a, order: order.get(a.id) ?? 0 })) };
  };
}

/**
 * Delete an account and everything that only made sense alongside it: its
 * matching category, its USD ledger entries, and (optionally) its history.
 */
export function deleteAccount(id: string, withTransactions = false) {
  return (d: BudgetData): BudgetData => {
    const acc = d.accounts.find((a) => a.id === id);
    if (!acc) return d;
    const usdAccounts = d.accounts.filter((a) => a.kind === "usd");
    const wasFirstUsd = usdAccounts[0]?.id === id;

    return {
      ...d,
      accounts: d.accounts.filter((a) => a.id !== id),
      settings: {
        ...d.settings,
        categories: d.settings.categories.filter((c) => c.name !== acc.name),
      },
      usdLedger:
        acc.kind === "usd"
          ? d.usdLedger.filter((e) => (e.accountId ?? (wasFirstUsd ? id : undefined)) !== id)
          : d.usdLedger,
      transactions: withTransactions
        ? d.transactions.filter((t) => t.category !== acc.name && t.transferTo !== acc.name)
        : d.transactions.map((t) =>
            t.transferTo === acc.name ? { ...t, transferTo: undefined, toAmount: undefined } : t,
          ),
    };
  };
}

/** How much history an account carries — shown before deleting. */
export function accountUsage(d: BudgetData, id: string): { txs: number; usd: number } {
  const acc = d.accounts.find((a) => a.id === id);
  if (!acc) return { txs: 0, usd: 0 };
  const usdAccounts = d.accounts.filter((a) => a.kind === "usd");
  const wasFirstUsd = usdAccounts[0]?.id === id;
  return {
    txs: d.transactions.filter((t) => t.category === acc.name || t.transferTo === acc.name).length,
    usd:
      acc.kind === "usd"
        ? d.usdLedger.filter((e) => (e.accountId ?? (wasFirstUsd ? id : undefined)) === id).length
        : 0,
  };
}

// ---- usd ledger ----

export function addUsdEntry(entry: Omit<UsdEntry, "id">) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    usdLedger: [
      ...d.usdLedger,
      {
        ...entry,
        id: newId(),
        usdIn: round2(Math.abs(num(entry.usdIn))),
        usdOut: round2(Math.abs(num(entry.usdOut))),
        accountId: entry.accountId ?? d.accounts.find((a) => a.kind === "usd")?.id,
      },
    ],
  });
}

export function deleteUsdEntry(id: string) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    usdLedger: d.usdLedger.filter((e) => e.id !== id),
  });
}

// ---- groceries ----

function emptyList(key: string, d: BudgetData): GroceryList {
  const food =
    d.settings.categories.find((c) => /food|grocer/i.test(c.name))?.name ??
    d.settings.categories[0]?.name ??
    "";
  return { key, items: [], category: food };
}

export function groceryList(d: BudgetData, key: string): GroceryList {
  return d.groceries?.[key] ?? emptyList(key, d);
}

function withList(d: BudgetData, key: string, fn: (l: GroceryList) => GroceryList): BudgetData {
  const list = groceryList(d, key);
  return { ...d, groceries: { ...d.groceries, [key]: fn(list) } };
}

export function addGroceryItem(key: string, item: { name: string; qty?: string; estimate?: number }) {
  return (d: BudgetData): BudgetData =>
    withList(d, key, (l) => ({
      ...l,
      items: [
        ...l.items,
        {
          id: newId(),
          name: item.name.trim(),
          qty: item.qty?.trim() || undefined,
          estimate: round2(Math.abs(num(item.estimate))),
          bought: false,
        },
      ],
    }));
}

export function updateGroceryItem(key: string, id: string, patch: Partial<GroceryItem>) {
  return (d: BudgetData): BudgetData =>
    withList(d, key, (l) => ({
      ...l,
      items: l.items.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, ...patch };
        if ("estimate" in patch) next.estimate = round2(Math.abs(num(patch.estimate)));
        if ("actual" in patch) {
          const v = round2(Math.abs(num(patch.actual)));
          next.actual = v > 0 ? v : undefined;
        }
        if ("name" in patch) next.name = String(patch.name ?? "").trim() || i.name;
        return next;
      }),
    }));
}

/** Tick an item into the trolley; untickng clears whatever it actually cost. */
export function toggleGroceryItem(key: string, id: string) {
  return (d: BudgetData): BudgetData =>
    withList(d, key, (l) => ({
      ...l,
      items: l.items.map((i) =>
        i.id === id ? { ...i, bought: !i.bought, actual: i.bought ? undefined : i.actual } : i,
      ),
    }));
}

export function deleteGroceryItem(key: string, id: string) {
  return (d: BudgetData): BudgetData =>
    withList(d, key, (l) => ({ ...l, items: l.items.filter((i) => i.id !== id) }));
}

export function setGroceryCategory(key: string, category: string) {
  return (d: BudgetData): BudgetData => withList(d, key, (l) => ({ ...l, category }));
}

/** Start this period's list from another one — groceries repeat every month. */
export function copyGroceryList(fromKey: string, toKey: string) {
  return (d: BudgetData): BudgetData => {
    const src = d.groceries?.[fromKey];
    if (!src) return d;
    return withList(d, toKey, (l) => ({
      ...l,
      category: l.items.length ? l.category : src.category,
      items: [
        ...l.items,
        ...src.items.map((i) => ({
          id: newId(),
          name: i.name,
          qty: i.qty,
          // last month's actual price is the best estimate for this month
          estimate: round2(num(i.actual) || num(i.estimate)),
          bought: false,
        })),
      ],
    }));
  };
}

/** Clear the whole list, or just what has already been bought. */
export function clearGroceryList(key: string, onlyBought = false) {
  return (d: BudgetData): BudgetData =>
    withList(d, key, (l) => ({
      ...l,
      items: onlyBought ? l.items.filter((i) => !i.bought) : [],
      loggedTxId: onlyBought ? l.loggedTxId : undefined,
    }));
}

/** What the trolley currently costs, and what is still outstanding. */
export function groceryTotals(list: GroceryList) {
  let spent = 0;
  let remaining = 0;
  let planned = 0;
  let bought = 0;
  for (const i of list.items) {
    const est = num(i.estimate);
    planned += est;
    if (i.bought) {
      spent += num(i.actual) || est;
      bought++;
    } else {
      remaining += est;
    }
  }
  return {
    planned: round2(planned),
    spent: round2(spent),
    remaining: round2(remaining),
    bought,
    total: list.items.length,
  };
}

/**
 * Book what is in the trolley to the budget. Re-logging updates the same
 * transaction rather than adding a second one for the same shop.
 */
export function logGroceryShop(key: string, date: string) {
  return (d: BudgetData): BudgetData => {
    const list = groceryList(d, key);
    const { spent, bought } = groceryTotals(list);
    if (spent <= 0 || !list.category) return d;

    const description = `Groceries · ${bought} item${bought === 1 ? "" : "s"}`;
    const bucket = d.settings.categories.find((c) => c.name === list.category)?.bucket ?? "";
    const existing = list.loggedTxId
      ? d.transactions.find((t) => t.id === list.loggedTxId)
      : undefined;

    const next = existing
      ? updateTransaction(existing.id, {
          date,
          category: list.category,
          bucket,
          amount: spent,
          description,
        })(d)
      : addTransaction({
          date,
          monthKey: periodKeyFor(date, d.settings.payDay),
          category: list.category,
          bucket,
          type: "expense",
          amount: spent,
          description,
        })(d);

    const txId = existing ? existing.id : next.transactions[next.transactions.length - 1].id;
    return withList(next, key, (l) => ({ ...l, loggedTxId: txId, loggedAt: Date.now() }));
  };
}

// ---- debtors ----

export function addDebtor(debtor: Omit<Debtor, "id">) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    debtors: [...d.debtors, { ...debtor, id: newId(), lent: num(debtor.lent), repaid: num(debtor.repaid) }],
  });
}

export function updateDebtor(id: string, patch: Partial<Debtor>) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    debtors: d.debtors.map((x) => {
      if (x.id !== id) return x;
      const next = { ...x, ...patch };
      if ("lent" in patch) next.lent = num(patch.lent);
      if ("repaid" in patch) next.repaid = num(patch.repaid);
      return next;
    }),
  });
}

export function deleteDebtor(id: string) {
  return (d: BudgetData): BudgetData => ({
    ...d,
    debtors: d.debtors.filter((x) => x.id !== id),
  });
}

/** Start a fresh year: keep settings/accounts, roll closing balances into openings, clear activity. */
export function startNewYear(
  nextYear: number,
  closingByAccount: Record<string, number>,
  usdClosingByAccount: Record<string, number>,
) {
  return (d: BudgetData): BudgetData => {
    const accounts = d.accounts.map((a) => ({
      ...a,
      opening: round2(
        a.kind === "usd"
          ? usdClosingByAccount[a.id] ?? num(a.opening)
          : closingByAccount[a.id] ?? num(a.opening),
      ),
    }));
    return {
      ...clone(d),
      settings: { ...d.settings, budgetYear: nextYear },
      accounts,
      months: {},
      transactions: [],
      usdLedger: [],
      groceries: {},
      // debtors carry over (still outstanding)
    };
  };
}
