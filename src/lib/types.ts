// ---- Core domain types (mirrors the Arazet budget spreadsheet) ----

export type TxType = "expense" | "income" | "transfer";

export interface BucketDef {
  /** Bucket name, e.g. "Savings", "Rent, Food & Household". Unique, and the join key. */
  name: string;
  /** Default share of income as a fraction (0.40 = 40%). */
  pct: number;
}

export interface CategoryDef {
  /** Category / account name shown in the transaction picker. Unique. */
  name: string;
  /** Which bucket this category rolls up to. */
  bucket: string;
}

export interface Settings {
  budgetYear: number;
  /**
   * Day of the month you are paid (1-28). Budget periods run pay date to pay
   * date rather than 1st to month end, so spending lands in the period whose
   * income actually paid for it. 1 means plain calendar months.
   */
  payDay: number;
  /** Reminder of your usual monthly income (rand). */
  typicalIncome: number;
  /** USD -> ZAR exchange rate used to value USD accounts. */
  usdRate: number;
  buckets: BucketDef[];
  categories: CategoryDef[];
}

export type AccountKind = "zar" | "usd";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Opening balance in the account's own currency (R for zar, $ for usd). */
  opening: number;
  order?: number;
  /** Optional savings target in the account's own currency. */
  goal?: number;
  /** Free-text note, e.g. what this pot is for. */
  note?: string;
}

export interface MonthDoc {
  /** "YYYY-MM" */
  key: string;
  income: number;
  extraIncome: number;
  /** Optional per-month percentage overrides, keyed by bucket name (fractions). */
  pctOverrides?: Record<string, number>;
}

export interface Transaction {
  id: string;
  /** ISO date "YYYY-MM-DD". */
  date: string;
  /** "YYYY-MM" derived from date, used for fast month grouping. */
  monthKey: string;
  /** Category name, or — for a transfer — the source account name. */
  category: string;
  bucket: string;
  type: TxType;
  /** Amount in the source's currency. Always positive. */
  amount: number;
  /** Transfers only: destination account name. */
  transferTo?: string;
  /**
   * Transfers only: amount landing in the destination, in the destination's
   * currency. Lets a ZAR -> USD move record both legs in one entry.
   */
  toAmount?: number;
  description?: string;
  createdAt?: number;
}

/** A dollar movement on a USD account. */
export interface UsdEntry {
  id: string;
  date: string;
  description?: string;
  usdIn: number;
  usdOut: number;
  /** Which USD account this belongs to. Legacy entries fall back to the first one. */
  accountId?: string;
}

/** One line on a shopping list. */
export interface GroceryItem {
  id: string;
  name: string;
  /** Free text — "2 kg", "a pack", "6" — friendlier than a number field. */
  qty?: string;
  /** What you expect it to cost. */
  estimate: number;
  bought: boolean;
  /** What it actually cost, once it is in the trolley. */
  actual?: number;
}

/** A shopping list for one budget period. */
export interface GroceryList {
  /** Period key this list belongs to. */
  key: string;
  items: GroceryItem[];
  /** Category the shop is booked to when logged. */
  category: string;
  /** The transaction created by "log this shop", so it can be updated not duplicated. */
  loggedTxId?: string;
  /** When the shop was last logged to the budget. */
  loggedAt?: number;
}

export interface Debtor {
  id: string;
  date: string;
  name: string;
  description?: string;
  lent: number;
  repaid: number;
}

export interface BudgetData {
  settings: Settings;
  accounts: Account[];
  months: Record<string, MonthDoc>;
  transactions: Transaction[];
  usdLedger: UsdEntry[];
  debtors: Debtor[];
  /** Shopping lists, keyed by budget period. */
  groceries: Record<string, GroceryList>;
  /** Schema version, bumped by migrations in `normalize()`. */
  version?: number;
}
