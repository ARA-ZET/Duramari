import { doc, getDoc } from "firebase/firestore";
import { buildDemoSpec } from "./demoSpec.mjs";
import { bucketForCategory } from "./budget";
import { db } from "./firebase";
import { defaultData } from "./defaults";
import {
  addDebtor,
  addStaple,
  addTransaction,
  addUsdEntry,
  setAccountOpening,
  setBuckets,
  setSettings,
  upsertMonth,
} from "./mutations";
import type { BudgetData, TxType } from "./types";

/**
 * Sample data for the signed-out tour.
 *
 * Nobody can judge a budgeting app from an empty screen, so a visitor gets a
 * furnished one to poke at: every month from January to today, on a R10,000
 * income. It is assembled by replaying the same mutations a real user's typing
 * would, so the totals, rollovers and period keys are genuinely computed — a
 * hand-written set of figures would drift from the real behaviour the moment
 * the maths changed.
 *
 * Rows carry a month and a day rather than a date, and the year is filled in
 * when the tour is built, so the sample never ages out of the current year.
 *
 * The spec lives in a single Firestore document (`demo/budget`) so the figures
 * can be tuned without a deploy; `BUILT_IN_DEMO` below is the same data
 * compiled in, used when that read fails so the tour still works offline and
 * costs nothing when Firestore is unreachable.
 *
 * None of this ever reaches storage — see `memoryRepo` — and it is discarded
 * the moment someone signs in.
 */

export const DEMO_DOC_PATH = ["demo", "budget"] as const;

/** One sample transaction: month (0-11), day of month, and what it was. */
export interface DemoRow {
  m: number;
  d: number;
  c: string;
  t: TxType;
  a: number;
  n: string;
}

export interface DemoSpec {
  income: number;
  usdRate: number;
  payDay: number;
  buckets: { name: string; pct: number }[];
  categories: { name: string; bucket: string }[];
  /** Side-hustle invoices and the like, by month index. */
  extraIncome?: { m: number; amount: number }[];
  openingSavings: number;
  openingUsd: number;
  rows: DemoRow[];
  debtors: { m: number; d: number; name: string; note: string; lent: number; repaid: number }[];
  usd: { m: number; d: number; note: string; in: number }[];
  staples: { name: string; qty?: string; estimate: number }[];
}

/** The compiled-in copy, and the source the Firestore document is published
 *  from — see `scripts/publish-demo.mjs`. */
export const BUILT_IN_DEMO: DemoSpec = buildDemoSpec() as DemoSpec;

/** Read the tuned copy from Firestore. Returns null on any failure so the
 *  caller can fall back rather than leaving a visitor staring at a spinner. */
export async function fetchDemoSpec(): Promise<DemoSpec | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, DEMO_DOC_PATH[0], DEMO_DOC_PATH[1]));
    if (!snap.exists()) return null;
    const spec = snap.data() as DemoSpec;
    return Array.isArray(spec?.rows) && spec.rows.length > 0 ? spec : null;
  } catch {
    return null;
  }
}

function iso(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKeyOf(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

/** Everything up to and including today, and nothing after it — a tour dated
 *  into the future reads as broken. */
function hasHappened(row: { m: number; d: number }, month0: number, today: number): boolean {
  return row.m < month0 || (row.m === month0 && row.d <= today);
}

export function buildDemoData(spec: DemoSpec = BUILT_IN_DEMO, now = new Date()): BudgetData {
  const year = now.getFullYear();
  const month0 = now.getMonth();
  const today = now.getDate();

  // payDay 1 keeps the sample on plain calendar months, so "January" means
  // what a visitor expects rather than straddling two period keys.
  let d = defaultData(year);
  d = setSettings({ typicalIncome: spec.income, usdRate: spec.usdRate, payDay: spec.payDay || 1 })(d);
  if (spec.buckets?.length) d = setBuckets(spec.buckets)(d);
  if (spec.categories?.length) {
    d = { ...d, settings: { ...d.settings, categories: spec.categories.map((c) => ({ ...c })) } };
  }

  d = setAccountOpening("acc-savings", spec.openingSavings)(d);
  d = setAccountOpening("acc-usd", spec.openingUsd)(d);

  // Every month of the year to date gets its income, so the months list reads
  // as a full year rather than starting wherever the first receipt landed.
  for (let m = 0; m <= month0; m += 1) {
    const extra = spec.extraIncome?.find((e) => e.m === m)?.amount ?? 0;
    d = upsertMonth(monthKeyOf(year, m), { income: spec.income, extraIncome: extra })(d);
  }

  for (const row of spec.rows) {
    if (!hasHappened(row, month0, today)) continue;
    const date = iso(year, row.m, row.d);
    d = addTransaction({
      date,
      monthKey: "", // derived from the date, so it files into the right period
      category: row.c,
      bucket: bucketForCategory(d, row.c),
      type: row.t,
      amount: row.a,
      description: row.n,
    })(d);
  }

  for (const e of spec.usd) {
    if (!hasHappened(e, month0, today)) continue;
    d = addUsdEntry({ date: iso(year, e.m, e.d), description: e.note, usdIn: e.in, usdOut: 0 })(d);
  }

  for (const t of spec.debtors) {
    if (!hasHappened(t, month0, today)) continue;
    d = addDebtor({
      date: iso(year, t.m, t.d),
      name: t.name,
      description: t.note,
      lent: t.lent,
      repaid: t.repaid,
    })(d);
  }

  for (const staple of spec.staples) d = addStaple(staple)(d);

  return d;
}
