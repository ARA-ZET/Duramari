import { bucketForCategory } from "./budget";
import { defaultData } from "./defaults";
import {
  addAccount,
  addCategory,
  addTransaction,
  setBuckets,
  setSettings,
  upsertMonth,
} from "./mutations";
import type { BudgetData, TxType } from "./types";

/**
 * One-off import of the August 2026 budget sheet.
 *
 * Built by replaying the real mutations rather than hand-writing a BudgetData
 * object, so ids, period keys and bucket mapping come out exactly as they
 * would if every row had been typed into the app by hand.
 *
 * Opening balances are the sheet's "Balance to date" minus that account's
 * "This month" movement — i.e. what each account held going *into* August,
 * so that replaying August's own deposits lands back on the sheet's figures.
 */

const BUCKETS = [
  { name: "Savings", pct: 0.4 },
  { name: "Family & Friends", pct: 0.1 },
  { name: "Rent, Food & Household", pct: 0.35 },
  { name: "Business – Arazet Design", pct: 0.15 },
];

/** Categories the sheet actually uses. Account-backed ones (Longterm Cash,
 *  Longterm ZAR/USD Cash, Wealth Group) are created by `addAccount` instead. */
const CATEGORIES: { name: string; bucket: string }[] = [
  { name: "Rent", bucket: "Rent, Food & Household" },
  { name: "Household stuff", bucket: "Rent, Food & Household" },
  { name: "Lunch", bucket: "Rent, Food & Household" },
  { name: "Parking", bucket: "Rent, Food & Household" },
  { name: "Airtime", bucket: "Rent, Food & Household" },
  { name: "Car Expenses & Fuel", bucket: "Rent, Food & Household" },
  { name: "Family", bucket: "Family & Friends" },
  { name: "Friends", bucket: "Family & Friends" },
  { name: "Charity", bucket: "Family & Friends" },
  { name: "Family Outing", bucket: "Family & Friends" },
  { name: "Google", bucket: "Business – Arazet Design" },
  { name: "Tech Events & Transport", bucket: "Business – Arazet Design" },
  { name: "Business Finance", bucket: "Business – Arazet Design" },
];

const ACCOUNTS: { name: string; kind: "zar" | "usd"; opening: number }[] = [
  { name: "Longterm Cash", kind: "zar", opening: 1000 },
  { name: "Longterm ZAR/USD Cash", kind: "zar", opening: 0 },
  { name: "Wealth Group", kind: "zar", opening: 12606 },
  { name: "USD Account", kind: "usd", opening: 120 },
];

const TRANSACTIONS: {
  date: string;
  category: string;
  type: TxType;
  amount: number;
  description: string;
}[] = [
  { date: "2026-08-25", category: "Business Finance", type: "income", amount: 53.0, description: "Balance Brought Forward" },
  { date: "2026-08-26", category: "Household stuff", type: "expense", amount: 324.32, description: "Spar Groceries" },
  { date: "2026-08-26", category: "Charity", type: "expense", amount: 200.0, description: "Baba Bhaudi" },
  { date: "2026-08-26", category: "Charity", type: "expense", amount: 100.0, description: "Baba Bhaudi" },
  { date: "2026-08-26", category: "Family", type: "expense", amount: 260.0, description: "Mhamha Mai Chanakira" },
  { date: "2026-08-27", category: "Rent", type: "expense", amount: 3800.0, description: "Home Rent" },
  { date: "2026-08-27", category: "Family", type: "expense", amount: 100.0, description: "Mai Charmaine" },
  { date: "2026-08-27", category: "Lunch", type: "expense", amount: 401.0, description: "Work Lunch" },
  { date: "2026-08-27", category: "Household stuff", type: "income", amount: 540.0, description: "Remittance on Car Usage" },
  { date: "2026-08-27", category: "Parking", type: "expense", amount: 10.0, description: "Howard Center" },
  { date: "2026-08-27", category: "Airtime", type: "expense", amount: 10.0, description: "Airtime" },
  { date: "2026-08-27", category: "Car Expenses & Fuel", type: "expense", amount: 100.0, description: "Shell" },
  { date: "2026-08-27", category: "Family Outing", type: "expense", amount: 400.0, description: "Bosa Bellville" },
  { date: "2026-08-27", category: "Google", type: "expense", amount: 14.99, description: "Google One" },
  { date: "2026-08-27", category: "Longterm Cash", type: "expense", amount: 4000.0, description: "Sent to savings" },
  { date: "2026-08-27", category: "Longterm ZAR/USD Cash", type: "expense", amount: 1000.0, description: "Sent to savings" },
  { date: "2026-08-27", category: "Wealth Group", type: "expense", amount: 1400.0, description: "Sent to savings" },
  { date: "2026-08-28", category: "Household stuff", type: "expense", amount: 59.0, description: "Groceries" },
  { date: "2026-08-28", category: "Lunch", type: "expense", amount: 22.0, description: "PNP Pinelands" },
  { date: "2026-08-28", category: "Friends", type: "expense", amount: 104.0, description: "Discam" },
  { date: "2026-08-28", category: "Car Expenses & Fuel", type: "expense", amount: 100.0, description: "Car Cleaning" },
  { date: "2026-08-29", category: "Household stuff", type: "expense", amount: 150.0, description: "Groceries" },
  { date: "2026-08-29", category: "Tech Events & Transport", type: "expense", amount: 580.0, description: "Clothing" },
];

/** What the sheet says the month should come to — asserted by the seed test. */
export const SHEET_TOTALS = {
  income: 16000,
  spent: 13135.31,
  topup: 593.0,
  remaining: 3457.69,
  buckets: {
    Savings: { allocated: 6400, spent: 6400, remaining: 0 },
    "Family & Friends": { allocated: 1600, spent: 1164, remaining: 436 },
    "Rent, Food & Household": { allocated: 5600, spent: 4976.32, remaining: 1163.68 },
    "Business – Arazet Design": { allocated: 2400, spent: 594.99, remaining: 1858.01 },
  },
  accountBalances: {
    "Longterm Cash": 5000,
    "Longterm ZAR/USD Cash": 1000,
    "Wealth Group": 14006,
    "USD Account": 120,
  },
};

export function buildSheetSeed(): BudgetData {
  let d = defaultData(2026);

  // The sheet is a plain calendar month, so periods must run 1st to month end —
  // on a late pay date these August rows would file into September instead.
  d = setSettings({ typicalIncome: 16000, usdRate: 16.9, payDay: 1 })(d);
  d = setBuckets(BUCKETS)(d);

  // start from an empty category list so nothing from the defaults lingers
  d = { ...d, settings: { ...d.settings, categories: [] }, accounts: [] };
  for (const c of CATEGORIES) d = addCategory(c)(d);
  for (const a of ACCOUNTS) d = addAccount(a, "Savings")(d);

  d = upsertMonth("2026-08", { income: 16000, extraIncome: 0 })(d);

  for (const t of TRANSACTIONS) {
    d = addTransaction({
      date: t.date,
      monthKey: "", // derived from the date by `cleanTx`
      category: t.category,
      bucket: bucketForCategory(d, t.category),
      type: t.type,
      amount: t.amount,
      description: t.description,
    })(d);
  }

  return d;
}
