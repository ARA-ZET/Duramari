"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "@/components/providers";
import { Card, Money, SectionTitle, NumberInput, ProgressBar, Notice, Button } from "@/components/ui";
import {
  accountCategoryNames,
  bucketPlan,
  computeYear,
  monthKeys,
  monthLabel,
  num,
  summaryFor,
} from "@/lib/budget";
import {
  currentPeriodKey,
  isCalendarCycle,
  periodNoun,
  periodRangeLabel,
} from "@/lib/period";
import { normalizeBucketPcts, setBucketPct, setCategoryLimit } from "@/lib/mutations";
import { AlertTriangle, Wand2 } from "lucide-react";

export default function BudgetPage() {
  const { data, mutate } = useData();
  const [key, setKey] = useState("");

  useEffect(() => {
    if (!data) return;
    setKey((prev) =>
      prev && prev.startsWith(String(data.settings.budgetYear))
        ? prev
        : currentPeriodKey(data.settings.budgetYear, data.settings.payDay),
    );
  }, [data?.settings.budgetYear, data?.settings.payDay, data]);

  const model = useMemo(() => {
    if (!data || !key) return null;
    const summary = summaryFor(computeYear(data), key);
    const plan = bucketPlan(data, summary, key);
    const income = summary?.totalIncome ?? 0;
    const planned = plan.reduce((s, b) => s + b.planned, 0);
    const spent = plan.reduce((s, b) => s + b.spent, 0);
    const pctTotal = data.settings.buckets.reduce((s, b) => s + num(b.pct), 0);
    return {
      summary,
      plan,
      income,
      planned,
      spent,
      pctTotal,
      keys: monthKeys(data.settings.budgetYear),
      unplanned: plan.reduce(
        (s, b) => s + b.categories.filter((c) => c.limit <= 0 && c.spent > 0).length,
        0,
      ),
    };
  }, [data, key]);

  if (!data || !model) return null;
  const { plan, income, planned, spent, pctTotal } = model;
  const noun = periodNoun(data.settings.payDay);
  const pctOff = Math.abs(pctTotal - 1) > 0.0005;
  const savingsNames = accountCategoryNames(data);
  /** A budget whose every category is a savings account has nothing to limit. */
  const savingsOnly = (bucket: string) => {
    const own = data.settings.categories.filter((c) => c.bucket === bucket);
    return own.length > 0 && own.every((c) => savingsNames.has(c.name));
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mt-2 px-1">
        <h1 className="text-lg font-extrabold sm:text-xl">Budget</h1>
        <p className="text-sm muted">
          {monthLabel(key)}
          {!isCalendarCycle(data.settings.payDay)
            ? ` · ${periodRangeLabel(key, data.settings.payDay)}`
            : ""}{" "}
          · what you plan to spend, and what you have spent
        </p>
      </div>

      {/* period picker */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-x-visible">
        {model.keys.map((k) => (
          <button
            key={k}
            onClick={() => setKey(k)}
            className={clsx(
              "shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition",
              k === key ? "bg-brand-500 text-white" : "muted",
            )}
            style={k === key ? undefined : { background: "var(--card)", border: "1px solid var(--border)" }}
          >
            {monthLabel(k).slice(0, 3)}
          </button>
        ))}
      </div>

      {/* headline: income -> planned -> spent */}
      <Card className="mt-4">
        <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
          <div>
            <div className="text-[11px] uppercase tracking-wide muted">Income</div>
            <div className="text-base font-extrabold sm:text-lg">
              <Money value={income} />
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide muted">Planned</div>
            <div className="text-base font-extrabold sm:text-lg">
              <Money value={planned} />
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide muted">Spent</div>
            <div className="text-base font-extrabold sm:text-lg">
              <Money value={spent} />
            </div>
          </div>
        </div>
        {planned > 0 ? (
          <div className="mt-3">
            <ProgressBar value={spent} max={planned} />
            <p className="mt-1.5 text-xs muted">
              {Math.round((spent / planned) * 100)}% of the plan used
              {planned > income && income > 0 ? (
                <span className="text-amber-600">
                  {" "}
                  · your plan is <Money value={planned - income} /> more than this {noun}&apos;s income
                </span>
              ) : null}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs muted">
            Set a limit against a category below and this fills in.
          </p>
        )}
      </Card>

      {pctOff ? (
        <div className="mt-3">
          <Notice tone="warn">
            <span className="flex flex-wrap items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              Your shares add up to {(pctTotal * 100).toFixed(1)}%, not 100%.
              <Button variant="ghost" onClick={() => mutate(normalizeBucketPcts())} className="!py-1 !text-xs">
                <Wand2 size={13} /> Even them out
              </Button>
            </span>
          </Notice>
        </div>
      ) : null}

      <SectionTitle>How your income is split</SectionTitle>
      <p className="-mt-1 mb-2 px-1 text-xs muted">
        Each share is a slice of the {noun}&apos;s income. Whatever a budget does not spend carries
        into the next {noun}.
      </p>

      <div className="space-y-3">
        {plan.map((b) => {
          const over = b.spent > b.allocated && b.allocated > 0;
          return (
            <Card key={b.bucket} className="!p-0 overflow-hidden">
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2.5"
                style={{ borderColor: "var(--border)", background: "var(--bg)" }}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{b.bucket}</span>
                <span className="flex items-center gap-1.5">
                  <NumberInput
                    value={Math.round((data.settings.buckets.find((x) => x.name === b.bucket)?.pct ?? 0) * 1000) / 10}
                    onCommit={(v) => mutate(setBucketPct(b.bucket, v / 100))}
                    min={0}
                    inputClassName="!w-16 !px-1 !py-1 text-center !text-[12px]"
                    ariaLabel={`${b.bucket} share of income`}
                  />
                  <span className="text-xs muted">%</span>
                </span>
                <span className="text-right text-[13px]">
                  <Money value={b.allocated} className="font-bold" />
                  <span className="text-[11px] muted"> this {noun}</span>
                </span>
              </div>

              <div className="px-3 py-2">
                <ProgressBar value={b.spent} max={b.allocated || b.planned || 1} />
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] muted">
                  <span>
                    spent <Money value={b.spent} /> of <Money value={b.allocated} />
                    {b.planned > 0 ? (
                      <>
                        {" "}
                        · planned <Money value={b.planned} />
                      </>
                    ) : null}
                  </span>
                  {b.planned > b.allocated && b.allocated > 0 ? (
                    <span className="text-amber-600">
                      plan exceeds the share by <Money value={b.planned - b.allocated} />
                    </span>
                  ) : over ? (
                    <span className="text-rose-500">
                      over by <Money value={b.spent - b.allocated} />
                    </span>
                  ) : null}
                </div>
              </div>

              {b.categories.length === 0 ? (
                <p className="border-t px-3 py-2.5 text-xs muted" style={{ borderColor: "var(--border)" }}>
                  {savingsOnly(b.bucket) ? (
                    <>
                      This one funds your savings accounts, so there is nothing to cap — its share of
                      income is the plan.
                    </>
                  ) : (
                    <>
                      No categories in this budget yet — add some in{" "}
                      <a href="/settings" className="font-semibold text-brand-500">
                        Settings
                      </a>
                      .
                    </>
                  )}
                </p>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {b.categories.map((c) => {
                    const has = c.limit > 0;
                    const overspent = has && c.left < 0;
                    return (
                      <div
                        key={c.name}
                        className="px-3 py-2"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {c.name}
                          </span>
                          <NumberInput
                            value={c.limit}
                            onCommit={(v) => mutate(setCategoryLimit(c.name, v))}
                            prefix="R"
                            min={0}
                            inputClassName="!w-24 !py-1 !text-[12px]"
                            ariaLabel={`Limit for ${c.name}`}
                          />
                        </div>
                        {has ? (
                          <>
                            <div className="mt-1.5">
                              <ProgressBar value={c.spent} max={c.limit} />
                            </div>
                            <div className="mt-1 flex justify-between gap-2 text-[11px] muted">
                              <span>
                                spent <Money value={c.spent} /> of <Money value={c.limit} />
                              </span>
                              <span className={overspent ? "font-semibold text-rose-500" : undefined}>
                                {overspent ? "over by " : ""}
                                <Money value={Math.abs(c.left)} />
                                {overspent ? "" : " left"}
                              </span>
                            </div>
                          </>
                        ) : c.spent > 0 ? (
                          <p className="mt-1 text-[11px] muted">
                            <Money value={c.spent} /> spent, no limit set
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {model.unplanned > 0 ? (
        <p className="mt-3 px-1 text-xs muted">
          {model.unplanned} categor{model.unplanned === 1 ? "y has" : "ies have"} spending but no
          limit. Set one and it starts tracking here.
        </p>
      ) : null}

      <p className="mt-4 px-1 text-xs muted">
        Limits are a plan, not a wall — nothing stops you spending over one. They apply to every{" "}
        {noun}, and only change what this page and the shopping list compare against.
      </p>
    </div>
  );
}
