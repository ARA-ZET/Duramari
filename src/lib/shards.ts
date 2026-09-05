import { dateToMonthKey } from "./budget";
import { periodKeyFor } from "./period";
import type { BudgetData, GroceryList, MonthDoc, Transaction, UsdEntry } from "./types";

/**
 * The document shapes a budget is split into, and the pure functions that
 * split and reassemble it. Shared by every storage backend (localStorage,
 * Google Drive) so they can't drift from each other — a backend only has to
 * read and write these documents by name, never touch `BudgetData` directly.
 */

/** The part of a month that lives in its own document. */
export interface MonthShard {
  key: string;
  income: number;
  extraIncome: number;
  pctOverrides?: Record<string, number>;
  transactions: Transaction[];
  usdLedger: UsdEntry[];
  /** This period's shopping list, stored alongside the spending it explains. */
  grocery?: GroceryList;
}

/** The small always-loaded document. */
export interface CoreShard {
  settings: BudgetData["settings"];
  accounts: BudgetData["accounts"];
  debtors: BudgetData["debtors"];
  /** Small, always relevant and not tied to any period — so it lives here. */
  staples?: BudgetData["staples"];
  version?: number;
}

export const strip = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Split an in-memory budget into the documents it is stored as. */
export function toShards(data: BudgetData): { core: CoreShard; months: Record<string, MonthShard> } {
  const months: Record<string, MonthShard> = {};

  const ensure = (key: string): MonthShard => {
    if (!months[key]) {
      const md = data.months[key];
      months[key] = {
        key,
        income: md?.income ?? 0,
        extraIncome: md?.extraIncome ?? 0,
        pctOverrides: md?.pctOverrides,
        transactions: [],
        usdLedger: [],
      };
    }
    return months[key];
  };

  const payDay = data.settings?.payDay ?? 1;
  for (const key of Object.keys(data.months ?? {})) ensure(key);
  for (const t of data.transactions ?? []) ensure(t.monthKey || dateToMonthKey(t.date)).transactions.push(t);
  // USD entries carry a date, so they file into the period that date falls in
  for (const e of data.usdLedger ?? []) ensure(periodKeyFor(e.date, payDay)).usdLedger.push(e);
  for (const [key, list] of Object.entries(data.groceries ?? {})) {
    if (list?.items?.length || list?.loggedTxId) ensure(key).grocery = list;
  }

  return {
    core: {
      settings: data.settings,
      accounts: data.accounts,
      debtors: data.debtors,
      staples: data.staples,
      version: data.version,
    },
    months,
  };
}

/** Rebuild the in-memory budget from its documents. */
export function fromShards(core: CoreShard, shards: MonthShard[]): BudgetData {
  const months: Record<string, MonthDoc> = {};
  const transactions: Transaction[] = [];
  const usdLedger: UsdEntry[] = [];
  const groceries: Record<string, GroceryList> = {};

  for (const s of shards) {
    if (!s?.key) continue;
    if (s.grocery) groceries[s.key] = s.grocery;
    months[s.key] = {
      key: s.key,
      income: s.income ?? 0,
      extraIncome: s.extraIncome ?? 0,
      pctOverrides: s.pctOverrides,
    };
    for (const t of s.transactions ?? []) transactions.push(t);
    for (const e of s.usdLedger ?? []) usdLedger.push(e);
  }

  return {
    settings: core.settings,
    accounts: core.accounts ?? [],
    debtors: core.debtors ?? [],
    staples: core.staples ?? [],
    months,
    transactions,
    usdLedger,
    groceries,
    version: core.version,
  };
}

/** A month document with nothing in it is deleted rather than stored empty. */
export function isEmptyShard(s: MonthShard): boolean {
  return (
    !s.income &&
    !s.extraIncome &&
    !s.transactions.length &&
    !s.usdLedger.length &&
    !s.grocery?.items?.length &&
    !Object.keys(s.pctOverrides ?? {}).length
  );
}

/** Snapshot of what a backend believes is currently in storage. */
export interface ShardFingerprint {
  core: string;
  months: Record<string, string>;
}

/** Fingerprint of what is currently in storage, used as the diff baseline. */
export function fingerprintOf(data: BudgetData): ShardFingerprint {
  const shards = toShards(data);
  const months: Record<string, string> = {};
  for (const [k, v] of Object.entries(shards.months)) months[k] = JSON.stringify(strip(v));
  return { core: JSON.stringify(strip(shards.core)), months };
}

export interface ShardDiff {
  coreChanged: boolean;
  /** Month keys whose document needs writing (new or changed). */
  changed: string[];
  /** Month keys whose document should be deleted. */
  removed: string[];
  fingerprint: ShardFingerprint;
}

/** Which documents actually changed since the last write. */
export function diffShards(
  next: { core: CoreShard; months: Record<string, MonthShard> },
  prev: ShardFingerprint | null,
): ShardDiff {
  const nextMonths: Record<string, string> = {};
  for (const [k, v] of Object.entries(next.months)) nextMonths[k] = JSON.stringify(strip(v));
  const nextCore = JSON.stringify(strip(next.core));

  const changed: string[] = [];
  const removed: string[] = [];

  for (const [k, json] of Object.entries(nextMonths)) {
    if (!prev || prev.months[k] !== json) changed.push(k);
  }
  if (prev) {
    for (const k of Object.keys(prev.months)) {
      if (!(k in nextMonths)) removed.push(k);
    }
  }

  return {
    coreChanged: !prev || prev.core !== nextCore,
    changed,
    removed,
    fingerprint: { core: nextCore, months: nextMonths },
  };
}
