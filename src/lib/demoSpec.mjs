/**
 * The sample budget behind the signed-out tour, as plain data.
 *
 * Deliberately dependency-free ESM so both sides can use the one definition:
 * the app imports it (see `demoData.ts`), and `scripts/publish-demo.mjs` runs
 * it under plain node to publish the Firestore copy. Two copies of these
 * figures would drift apart the first time either was edited.
 *
 * Rows carry a month (0-11) and a day, never a year — the year is filled in
 * when the tour is built, so the sample never ages.
 */

export const DEMO_INCOME = 10000;

/**
 * A R10,000 income will not stretch over the app's default 40/10/35/15 split:
 * that leaves R3,500 for rent, food and everything household, which no honest
 * set of figures fits into. The tour uses a split sized for the income it shows.
 */
export const DEMO_BUCKETS = [
  { name: "Rent, Food & Household", pct: 0.5 },
  { name: "Savings", pct: 0.25 },
  { name: "Side Hustle", pct: 0.15 },
  { name: "Family & Friends", pct: 0.1 },
];

/** Small deterministic PRNG, so the sample varies month to month but comes out
 *  the same for every visitor and every rebuild. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vary an amount and round it to something a person would actually type. */
function jitter(base, spread, r) {
  return Math.round((base + (r() * 2 - 1) * spread) / 10) * 10;
}

/**
 * One month of spending, sized to finish just inside each budget so there is
 * something left to carry. The carry-over is the whole point of the app and is
 * invisible if every month lands on zero. August overspends on purpose — a tour
 * where nothing ever goes wrong is not a credible one.
 */
function monthRows(m) {
  const r = rng(m * 7919 + 13);
  const rows = [
    { m, d: 1, c: "Rent", t: "expense", a: 2600, n: "Monthly rent" },
    { m, d: 2, c: "Savings", t: "expense", a: 2300, n: "Payday transfer" },
    { m, d: 3, c: "Groceries", t: "expense", a: jitter(640, 90, r), n: "Big shop" },
    { m, d: 4, c: "Airtime & Data", t: "expense", a: 199, n: "Monthly data" },
    { m, d: 6, c: "Transport & Fuel", t: "expense", a: jitter(430, 70, r), n: "Taxi fare" },
    { m, d: 8, c: "Family", t: "expense", a: 500, n: "Home support" },
    { m, d: 9, c: "Tools & Subscriptions", t: "expense", a: 289, n: "Design software" },
    { m, d: 12, c: "Eating out", t: "expense", a: jitter(170, 50, r), n: "Lunch out" },
    { m, d: 16, c: "Marketing", t: "expense", a: jitter(420, 90, r), n: "Boosted a post" },
    { m, d: 18, c: "Groceries", t: "expense", a: jitter(380, 70, r), n: "Top-up shop" },
    { m, d: 19, c: "Charity", t: "expense", a: 150, n: "Monthly giving" },
    { m, d: 23, c: "Business Transport", t: "expense", a: jitter(330, 60, r), n: "Client visit" },
    { m, d: 26, c: "Business Finance", t: "expense", a: jitter(250, 60, r), n: "Bank charges" },
  ];

  // Months should not all have the same shape. Driven off the seed so the
  // variation is stable between builds rather than random per visitor.
  if (r() > 0.5) rows.push({ m, d: 21, c: "Household stuff", t: "expense", a: jitter(150, 50, r), n: "Cleaning supplies" });
  if (r() > 0.6) rows.push({ m, d: 25, c: "Friends", t: "expense", a: jitter(160, 40, r), n: "Birthday dinner" });
  if (r() > 0.7) rows.push({ m, d: 27, c: "Gifts", t: "expense", a: jitter(150, 40, r), n: "Baby shower gift" });

  // One bad month, so an overspent budget appears somewhere in the history.
  if (m === 7) rows.push({ m, d: 14, c: "Transport & Fuel", t: "expense", a: 2400, n: "Car repair" });

  return rows;
}

/**
 * Side-hustle invoices arrive as extra income for the month, not as a payment
 * into the Side Hustle budget. Paying it into the budget would mean the money
 * could only ever be spent on the side hustle, and the bucket would swell month
 * after month until the tour showed R19,000 sitting in it on a R10,000 income.
 * As extra income it is split across every budget the way real money is.
 */
const EXTRA_INCOME = [
  { m: 1, amount: 1800 },
  { m: 4, amount: 2400 },
  { m: 6, amount: 1500 },
  { m: 9, amount: 2200 },
];

export function buildDemoSpec() {
  const rows = [];
  for (let m = 0; m < 12; m += 1) rows.push(...monthRows(m));
  return {
    income: DEMO_INCOME,
    usdRate: 18.5,
    payDay: 1,
    buckets: DEMO_BUCKETS,
    categories: [],
    extraIncome: EXTRA_INCOME,
    openingSavings: 8200,
    openingUsd: 120,
    rows,
    debtors: [{ m: 4, d: 20, name: "Sipho", note: "Covered a car repair", lent: 1500, repaid: 500 }],
    usd: [
      { m: 2, d: 6, note: "Bought dollars", in: 40 },
      { m: 6, d: 9, note: "Bought dollars", in: 35 },
    ],
    staples: [
      { name: "Milk", qty: "2 L", estimate: 42 },
      { name: "Bread", qty: "2 loaves", estimate: 38 },
      { name: "Rice", qty: "2 kg", estimate: 95 },
      { name: "Cooking oil", qty: "750 ml", estimate: 65 },
      { name: "Washing powder", estimate: 120 },
    ],
  };
}
