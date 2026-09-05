"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "@/components/providers";
import { Card, Money, SectionTitle, Stat, ProgressBar, Button, Notice } from "@/components/ui";
import { AddTransactionSheet } from "@/components/add-transaction";
import { TrajectoryChart } from "@/components/charts";
import {
  accountBalances,
  accountCategoryNames,
  computeYear,
  debtorOutstanding,
  findIssues,
  monthLabel,
  num,
  randFmt,
  summaryFor,
  totalSavingsRand,
  transactionLabel,
  usdBalance,
} from "@/lib/budget";
import {
  currentPeriodKey,
  daysLeftInPeriod,
  isCalendarCycle,
  periodNoun,
  periodProgress,
  periodRangeLabel,
} from "@/lib/period";
import { buildInsights, lastN, reportSeries } from "@/lib/reports";
import { Plus, TrendingUp, HandCoins, Landmark, AlertTriangle, ShoppingCart, Target } from "lucide-react";

/** Newest first: by date, then by entry order within the same day. */
function newestFirst<T extends { date: string; createdAt?: number }>(a: T, b: T): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return num(b.createdAt) - num(a.createdAt);
}

export default function DashboardPage() {
  const { data, archives } = useData();
  const [addOpen, setAddOpen] = useState(false);

  const model = useMemo(() => {
    if (!data) return null;
    const year = computeYear(data);
    const curKey = currentPeriodKey(data.settings.budgetYear, data.settings.payDay);
    const current = summaryFor(year, curKey);
    const accounts = accountBalances(data);

    // ---- the wider picture, shared with Reports ----
    const series = reportSeries(data, archives);
    const insights = buildInsights(data, series, curKey);

    // ---- this period's spending, by category ----
    const savingsNames = accountCategoryNames(data);
    const byCategory = new Map<string, number>();
    for (const t of data.transactions ?? []) {
      if (t.monthKey !== curKey || t.type !== "expense") continue;
      // deposits into a savings account are not spending
      if (savingsNames.has(t.category)) continue;
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + num(t.amount));
    }
    const topCategories = [...byCategory]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const list = data.groceries?.[curKey];
    const listItems = list?.items ?? [];

    return {
      year,
      curKey,
      current,
      accounts,
      savings: totalSavingsRand(data),
      owed: debtorOutstanding(data),
      usd: usdBalance(data),
      issues: findIssues(data),
      series,
      topInsight: insights[0] ?? null,
      topCategories: topCategories.slice(0, 6),
      categoryTotal: topCategories.reduce((s, c) => s + c.amount, 0),
      recent: [...(data.transactions ?? [])].sort(newestFirst).slice(0, 8),
      goals: accounts.filter((a) => num(a.account.goal) > 0),
      pace: periodProgress(curKey, data.settings.payDay),
      shopping: listItems.length
        ? {
            total: listItems.length,
            bought: listItems.filter((i) => i.bought).length,
            spent: listItems
              .filter((i) => i.bought)
              .reduce((s, i) => s + (i.actual ?? num(i.estimate)), 0),
            budget: listItems.reduce((s, i) => s + num(i.estimate), 0),
          }
        : null,
    };
  }, [data, archives]);

  if (!data || !model) return null;
  const { current, pace } = model;

  // What there actually is to spend: this month's allocation plus whatever the
  // buckets carried in. Measuring against the allocation alone makes any month
  // with rollover — or one whose income is not in yet — read as fully spent.
  const spendable = current ? current.totalSpent + current.totalBalance : 0;
  // Spending against the calendar: 80% of the money gone on day 5 of 30 is the
  // number worth surfacing, and it only means anything next to elapsed days.
  const spentShare = current && spendable > 0 ? current.totalSpent / spendable : 0;
  const aheadOfPace = pace.fraction > 0 && spentShare - pace.fraction > 0.1;
  // "This month" is a lie on a pay cycle: the period runs pay day to pay day.
  const noun = periodNoun(data.settings.payDay);

  return (
    <div>
      <div className="mt-2 flex items-center justify-between px-1">
        <div>
          <h1 className="text-lg font-extrabold sm:text-xl">Overview</h1>
          {/* On a pay cycle the label alone ("September 2026") would be read as
              1–30 Sep, so the dates it really covers go right beside it. */}
          <p className="text-sm muted">
            {current ? monthLabel(current.key) : data.settings.budgetYear}
            {current && !isCalendarCycle(data.settings.payDay)
              ? ` · ${periodRangeLabel(current.key, data.settings.payDay)} · ${daysLeftInPeriod(current.key, data.settings.payDay)} days to pay day`
              : ""}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="!px-3 sm:!px-4">
          <Plus size={18} /> Add
        </Button>
      </div>

      {model.issues.some((i) => i.level === "error") ? (
        <div className="mt-3">
          <Notice tone="error">
            <span className="flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {model.issues.filter((i) => i.level === "error")[0].message}{" "}
                <a href="/settings" className="font-bold underline">
                  Fix in Settings
                </a>
              </span>
            </span>
          </Notice>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total savings" value={<Money value={model.savings} />} tone="brand" sub="all accounts, in rand" />
        <Stat
          label="Available now"
          value={<Money value={current?.totalBalance ?? 0} />}
          tone="green"
          sub="carried across all budgets"
        />
        <Stat label="Owed to you" value={<Money value={model.owed} />} tone="amber" sub="debtors outstanding" />
        <Stat
          label={model.accounts.filter((a) => a.account.kind === "usd").length > 1 ? "USD accounts" : "USD account"}
          value={<Money value={model.usd.usd} currency="$" />}
          tone="slate"
          sub={<Money value={model.usd.usd * num(data.settings.usdRate)} />}
        />
      </div>

      {/* The single most useful reading of the numbers, with the rest a click
          away — the desktop has the room for it, the phone does not. */}
      {model.topInsight ? (
        <div className="mt-2 hidden lg:block">
          <Card className="flex items-center gap-3 !py-2.5">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
              style={{
                background: {
                  good: "var(--s3)",
                  warn: "var(--s4)",
                  info: "var(--s1)",
                  critical: "var(--over)",
                }[model.topInsight.tone],
              }}
              aria-hidden="true"
            >
              {model.topInsight.glyph}
            </span>
            <p className="min-w-0 flex-1 truncate text-[13px]">
              <span className="font-semibold">{model.topInsight.headline}</span>{" "}
              <span className="muted">{model.topInsight.detail}</span>
            </p>
            <a href="/reports" className="shrink-0 text-xs font-semibold text-brand-500">
              Reports →
            </a>
          </Card>
        </div>
      ) : null}

      {current && (
        <>
          <SectionTitle>This {noun}</SectionTitle>
          <Card className="sm:flex sm:items-center sm:gap-8">
            <div className="sm:flex sm:shrink-0 sm:gap-8">
              <div className="flex items-center justify-between text-sm sm:block">
                <span className="muted">Income</span>
                <Money value={current.totalIncome} className="font-semibold sm:mt-0.5 sm:block sm:text-lg" />
              </div>
              <div className="mt-1 flex items-center justify-between text-sm sm:mt-0 sm:block">
                <span className="muted">Spent so far</span>
                <Money value={current.totalSpent} className="font-semibold sm:mt-0.5 sm:block sm:text-lg" />
              </div>
              <div className="mt-1 hidden text-sm lg:mt-0 lg:block">
                <span className="muted">Left to spend</span>
                <Money
                  value={current.totalBalance}
                  className="font-semibold lg:mt-0.5 lg:block lg:text-lg"
                />
              </div>
            </div>
            <div className="mt-2 sm:mt-0 sm:flex-1">
              <ProgressBar value={current.totalSpent} max={Math.max(spendable, 1)} />
              {pace.total > 0 ? (
                <p className="mt-1.5 hidden text-[11px] muted lg:block">
                  Day {pace.day} of {pace.total}
                  {!isCalendarCycle(data.settings.payDay)
                    ? ` (${periodRangeLabel(current.key, data.settings.payDay)})`
                    : ""}{" "}
                  — {Math.round(pace.fraction * 100)}% of the cycle gone,{" "}
                  <span className={clsx(aheadOfPace && "font-semibold text-amber-600")}>
                    {Math.round(spentShare * 100)}% of the money spent
                  </span>
                  {aheadOfPace ? " — ahead of pace" : ""}.
                </p>
              ) : null}
            </div>
          </Card>
        </>
      )}

      <div className="lg:grid lg:grid-cols-3 lg:gap-x-6">
        {current && (
          <section className="lg:col-span-2">
            <SectionTitle>Budgets — left to spend</SectionTitle>
            {current.buckets.length === 0 ? (
              <Card className="text-center text-sm muted">
                No budgets yet —{" "}
                <a href="/budget" className="font-semibold text-brand-500">
                  set up your split on the Budget page
                </a>
                .
              </Card>
            ) : null}
            {/* One dense list rather than a grid of cards: uniform row heights,
                no orphaned last row, and the balances line up to be scanned. */}
            <Card className="divide-y !p-0" >
              {current.buckets
                .filter((b) => b.bucket)
                .map((b) => (
                  <div
                    key={b.bucket}
                    className="px-3 py-2 first:pt-2.5 last:pb-2.5"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] font-semibold">{b.bucket}</span>
                      <Money value={b.balance} className="shrink-0 text-[13px] font-bold tabular-nums" />
                    </div>
                    <div className="mt-1.5">
                      <ProgressBar value={b.spent} max={b.spendable || 1} />
                    </div>
                    <div className="mt-1 flex justify-between gap-2 text-[11px] muted">
                      <span className="truncate">
                        spent <Money value={b.spent} /> of <Money value={b.spendable} />
                      </span>
                      {b.carryIn ? (
                        <span className="shrink-0">incl. <Money value={b.carryIn} /> c/f</span>
                      ) : null}
                    </div>
                  </div>
                ))}
            </Card>
          </section>
        )}

        <section>
          <SectionTitle>Accounts</SectionTitle>
          <Card className="divide-y">
            {model.accounts.length === 0 ? (
              <div className="py-2 text-center text-sm muted">
                No accounts yet —{" "}
                <a href="/accounts" className="font-semibold text-brand-500">
                  add one
                </a>
                .
              </div>
            ) : null}
            {model.accounts.map((a) => (
              <div key={a.account.id} className="flex items-center justify-between py-1.5 text-[13px] first:pt-0 last:pb-0"
                style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  {a.account.kind === "usd" ? <TrendingUp size={16} className="muted" /> : <Landmark size={16} className="muted" />}
                  <span className="truncate font-medium">{a.account.name}</span>
                </div>
                <div className="text-right">
                  {a.account.kind === "usd" ? (
                    <>
                      <Money value={a.balance} currency="$" className="font-semibold tabular-nums" />
                      <div className="text-xs muted"><Money value={a.balanceRand} /></div>
                    </>
                  ) : (
                    <Money value={a.balance} className="font-semibold tabular-nums" />
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between py-1.5 text-[13px] last:pb-0">
              <span className="flex items-center gap-2 font-medium"><HandCoins size={14} className="muted" /> Owed to you</span>
              <Money value={model.owed} className="font-semibold tabular-nums" />
            </div>
          </Card>

          {/* Goals and the shopping list ride under Accounts rather than in a
              row of their own: the buckets column is much the taller of the
              two, so this is exactly the space that was standing empty. */}
          <div className="hidden lg:block">
            <SectionTitle>Goals</SectionTitle>
            <Card className="!p-3">
              {model.goals.length === 0 ? (
                <p className="text-[12px] muted">
                  No targets set. Give an account a goal in{" "}
                  <a href="/accounts" className="font-semibold text-brand-500">
                    Accounts
                  </a>{" "}
                  to track it here.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {model.goals.map((a) => (
                    <div key={a.account.id}>
                      <div className="flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Target size={13} className="shrink-0 muted" />
                          <span className="truncate font-medium">{a.account.name}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {Math.round((a.goalProgress ?? 0) * 100)}%
                        </span>
                      </div>
                      <div className="mt-1">
                        <ProgressBar value={a.balance} max={num(a.account.goal) || 1} />
                      </div>
                      <p className="mt-1 text-[11px] muted">
                        <Money value={a.balance} currency={a.account.kind === "usd" ? "$" : "R"} /> of{" "}
                        <Money value={num(a.account.goal)} currency={a.account.kind === "usd" ? "$" : "R"} />
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <SectionTitle action={<a href="/shopping" className="text-xs font-semibold text-brand-500">Open →</a>}>
              Shopping list
            </SectionTitle>
            <Card className="!p-3">
              {!model.shopping ? (
                <p className="text-[12px] muted">
                  No list for this {noun} yet —{" "}
                  <a href="/shopping" className="font-semibold text-brand-500">
                    start one
                  </a>
                  .
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ShoppingCart size={13} className="muted" />
                      {model.shopping.bought} of {model.shopping.total} bought
                    </span>
                    <Money value={model.shopping.spent} className="font-semibold tabular-nums" />
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar value={model.shopping.bought} max={model.shopping.total || 1} />
                  </div>
                  <p className="mt-1 text-[11px] muted">
                    {randFmt(model.shopping.spent)} of a {randFmt(model.shopping.budget)} list
                    {model.shopping.bought < model.shopping.total
                      ? ` · ${model.shopping.total - model.shopping.bought} still to get`
                      : " · all done"}
                  </p>
                </>
              )}
            </Card>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------------
          Desktop only. The phone dashboard is deliberately a single scan —
          balance, buckets, accounts — and everything below would bury it.
          On a wide screen the same fold is half empty, so it carries the
          history and the recent entries as well.
      ------------------------------------------------------------------ */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-3 gap-x-6">
          <section className="col-span-2">
            <SectionTitle action={<a href="/reports" className="text-xs font-semibold text-brand-500">All reports →</a>}>
              Savings trajectory
            </SectionTitle>
            <Card>
              {model.series.length >= 2 ? (
                <TrajectoryChart
                  points={lastN(model.series, 8).map((p) => ({ label: p.label, value: p.savingsRand }))}
                />
              ) : (
                <p className="py-10 text-center text-sm muted">
                  Two months of history will draw this chart.
                </p>
              )}
            </Card>
          </section>

          <section>
            <SectionTitle>Where it went this {noun}</SectionTitle>
            <Card className="!p-3">
              {model.topCategories.length === 0 ? (
                <p className="py-10 text-center text-sm muted">Nothing spent yet this {noun}.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {model.topCategories.map((c) => (
                      <div key={c.name}>
                        <div className="flex items-baseline justify-between gap-2 text-[12px]">
                          <span className="truncate font-medium">{c.name}</span>
                          <Money value={c.amount} className="shrink-0 font-semibold tabular-nums" />
                        </div>
                        <div className="mt-1">
                          <ProgressBar value={c.amount} max={model.topCategories[0].amount || 1} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 border-t pt-2 text-[11px] muted" style={{ borderColor: "var(--border)" }}>
                    Top {model.topCategories.length} of {randFmt(model.categoryTotal)} spent.
                    Savings deposits are not counted.
                  </p>
                </>
              )}
            </Card>
          </section>
        </div>

        <div>
          <section>
            <SectionTitle action={<a href="/months" className="text-xs font-semibold text-brand-500">All transactions →</a>}>
              Recent activity
            </SectionTitle>
            <Card className="!p-0">
              {model.recent.length === 0 ? (
                <p className="py-10 text-center text-sm muted">
                  No entries yet — use <span className="font-semibold">Add</span> to record your first one.
                </p>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr
                      className="border-b text-[10px] font-bold uppercase tracking-wider muted"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <th className="px-3 py-2 text-left font-bold">Date</th>
                      <th className="px-3 py-2 text-left font-bold">Category</th>
                      <th className="px-3 py-2 text-left font-bold">Budget</th>
                      <th className="px-3 py-2 text-left font-bold">Description</th>
                      <th className="px-3 py-2 text-left font-bold">Type</th>
                      <th className="px-3 py-2 text-right font-bold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.recent.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b last:border-0 hover:bg-black/[0.02]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums muted">{t.date}</td>
                        <td className="px-3 py-1.5 font-semibold">{transactionLabel(t)}</td>
                        <td className="px-3 py-1.5 muted">{t.bucket}</td>
                        <td className="max-w-[32ch] truncate px-3 py-1.5 muted">
                          {t.description ?? ""}
                          {t.type === "transfer" && t.transferTo ? ` → ${t.transferTo}` : ""}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={clsx(
                              "chip",
                              t.type === "expense" && "bg-rose-100 text-rose-600",
                              t.type === "income" && "bg-emerald-100 text-emerald-700",
                              t.type === "transfer" && "bg-slate-200 text-slate-700",
                              t.type === "move" && "bg-sky-100 text-sky-700",
                            )}
                          >
                            {t.type}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">
                          <Money
                            value={t.amount}
                            className={clsx(
                              "font-bold tabular-nums",
                              t.type === "income" ? "text-emerald-600" : undefined,
                            )}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>
        </div>
      </div>

      <AddTransactionSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
