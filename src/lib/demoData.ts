import { bucketForCategory } from "./budget";
import { defaultData } from "./defaults";
import {
  addDebtor,
  addStaple,
  addTransaction,
  addUsdEntry,
  setAccountOpening,
  setSettings,
  upsertMonth,
} from "./mutations";
import type { BudgetData, TxType } from "./types";

/**
 * Sample data for the signed-out tour.
 *
 * Nobody can judge a budgeting app from an empty screen, so a visitor gets a
 * furnished one to poke at. It is built by replaying the same mutations a real
 * user's typing would, so every total, rollover and period key is genuinely
 * computed rather than hand-written — a faked screenshot would drift from the
 * real behaviour the moment the maths changed.
 *
 * Two periods are seeded: last month in full, so the carried-over balances the
 * app is built around are actually visible, and this month up to today. It is
 * anchored to the current date rather than fixed dates, so the tour never looks
 * abandoned.
 *
 * This never reaches storage — see `memoryRepo` — and is discarded the moment
 * someone signs in.
 */

const DEMO_INCOME = 18000;

/** Day of the month, amount, category and description for one sample row. */
type Row = [day: number, category: string, type: TxType, amount: number, description: string];

/** A full month, sized so every bucket finishes in the black with something
 *  left to carry — the tour should open on a budget that is working, and the
 *  leftovers are what make the following month's carry-in visible. */
const LAST_MONTH: Row[] = [
  [1, "Rent", "expense", 3800, "Monthly rent"],
  [2, "Savings", "expense", 4000, "Payday transfer"],
  [3, "Groceries", "expense", 820.5, "Big shop"],
  [4, "Airtime & Data", "expense", 349, "Monthly data"],
  [6, "Transport & Fuel", "expense", 500, "Fuel"],
  [8, "Family", "expense", 800, "Home support"],
  [9, "Tools & Subscriptions", "expense", 289, "Design software"],
  [12, "Eating out", "expense", 246, "Lunch with a client"],
  [16, "Marketing", "expense", 450, "Boosted a post"],
  [18, "Charity", "expense", 300, "Monthly giving"],
  [21, "Household stuff", "expense", 120, "Cleaning supplies"],
  [23, "Business Transport", "expense", 380, "Client visit"],
  [25, "Friends", "expense", 220, "Birthday dinner"],
];

/** This month so far. Trimmed to whatever has actually happened by today, so
 *  the tour never shows transactions dated in the future. */
const THIS_MONTH: Row[] = [
  [1, "Rent", "expense", 3800, "Monthly rent"],
  [2, "Savings", "expense", 4000, "Payday transfer"],
  [3, "Groceries", "expense", 780.4, "Big shop"],
  [4, "Airtime & Data", "expense", 349, "Monthly data"],
  [5, "Transport & Fuel", "expense", 480, "Fuel"],
  [7, "Eating out", "expense", 189.5, "Coffee and lunch"],
  [9, "Tools & Subscriptions", "expense", 289, "Design software"],
  [11, "Household stuff", "expense", 264, "Lightbulbs and batteries"],
  [13, "Marketing", "expense", 600, "Flyers for the side hustle"],
  [15, "Business Finance", "income", 3500, "Side hustle invoice paid"],
  [17, "Family", "expense", 800, "Home support"],
  [19, "Groceries", "expense", 540.8, "Top-up shop"],
  [22, "Gifts", "expense", 350, "Baby shower gift"],
  [24, "Business Transport", "expense", 310, "Client visit"],
];

function iso(year: number, month0: number, day: number): string {
  const mm = String(month0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function monthKeyOf(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

function applyRows(d: BudgetData, rows: Row[], year: number, month0: number): BudgetData {
  let next = d;
  for (const [day, category, type, amount, description] of rows) {
    const date = iso(year, month0, day);
    next = addTransaction({
      date,
      monthKey: "", // derived from the date, so it files into the right period
      category,
      bucket: bucketForCategory(next, category),
      type,
      amount,
      description,
    })(next);
  }
  return next;
}

export function buildDemoData(now = new Date()): BudgetData {
  const year = now.getFullYear();
  const month0 = now.getMonth();
  const today = now.getDate();

  const prev = new Date(year, month0 - 1, 1);
  const prevYear = prev.getFullYear();
  const prevMonth0 = prev.getMonth();

  // payDay 1 keeps the sample on plain calendar months, so the dates below
  // read the way a visitor expects rather than straddling two period keys.
  let d = defaultData(year);
  d = setSettings({ typicalIncome: DEMO_INCOME, usdRate: 18.5, payDay: 1 })(d);

  d = setAccountOpening("acc-savings", 12500)(d);
  d = setAccountOpening("acc-usd", 150)(d);

  d = upsertMonth(monthKeyOf(prevYear, prevMonth0), { income: DEMO_INCOME, extraIncome: 0 })(d);
  d = upsertMonth(monthKeyOf(year, month0), { income: DEMO_INCOME, extraIncome: 0 })(d);

  d = applyRows(d, LAST_MONTH, prevYear, prevMonth0);
  d = applyRows(
    d,
    THIS_MONTH.filter(([day]) => day <= today),
    year,
    month0,
  );

  d = addUsdEntry({
    date: iso(year, month0, Math.min(6, today)),
    description: "Bought dollars",
    usdIn: 50,
    usdOut: 0,
  })(d);

  d = addDebtor({
    date: iso(prevYear, prevMonth0, 20),
    name: "Sipho",
    description: "Covered a car repair",
    lent: 1500,
    repaid: 500,
  })(d);

  for (const staple of [
    { name: "Milk", qty: "2 L", estimate: 42 },
    { name: "Bread", qty: "2 loaves", estimate: 38 },
    { name: "Rice", qty: "2 kg", estimate: 95 },
    { name: "Cooking oil", qty: "750 ml", estimate: 65 },
    { name: "Washing powder", estimate: 120 },
  ]) {
    d = addStaple(staple)(d);
  }

  return d;
}
