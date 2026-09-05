"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "@/components/providers";
import { Card, Money, SectionTitle, NumberInput, ConfirmDelete, Notice, Button } from "@/components/ui";
import { AddTransactionSheet } from "@/components/add-transaction";
import {
  MONTH_SHORT,
  computeYear,
  hasPctOverride,
  keyToMonthIndex,
  monthKeys,
  monthLabel,
  summaryFor,
} from "@/lib/budget";
import {
  currentPeriodKey,
  daysLeftInPeriod,
  defaultDateForPeriod,
  isCalendarCycle,
  periodNoun,
  periodRangeLabel,
} from "@/lib/period";
import {
  clearPctOverrides,
  copyIncomeForward,
  deleteTransaction,
  repeatTransactionNextMonth,
  setPctOverride,
  upsertMonth,
} from "@/lib/mutations";
import type { Transaction } from "@/lib/types";
import { Plus, Copy, RotateCcw, Pencil, AlertTriangle } from "lucide-react";

export default function MonthsPage() {
  const { data, mutate } = useData();
  const [selected, setSelected] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const year = useMemo(() => (data ? computeYear(data) : []), [data]);
  const keys = useMemo(() => (data ? monthKeys(data.settings.budgetYear) : []), [data]);
  const key = selected && keys.includes(selected) ? selected : keys[0] ?? "";

  // Jump to the current month once the data (and so the budget year) is known,
  // and follow along if the budget year is changed in Settings.
  useEffect(() => {
    if (!data) return;
    setSelected((prev) =>
      prev && prev.startsWith(String(data.settings.budgetYear))
        ? prev
        : currentPeriodKey(data.settings.budgetYear, data.settings.payDay),
    );
  }, [data?.settings.budgetYear, data?.settings.payDay, data]);

  const summary = summaryFor(year, key);
  const monthDoc = data?.months[key];
  // A period is a month only when the pay day is the 1st; otherwise saying
  // "this month" on a 25 Aug – 24 Sep period misdescribes what is on screen.
  const noun = periodNoun(data?.settings.payDay);

  const txs = useMemo(
    () =>
      (data?.transactions ?? [])
        .filter((t) => t.monthKey === key)
        .sort((a, b) => (a.date === b.date ? (b.createdAt ?? 0) - (a.createdAt ?? 0) : a.date < b.date ? 1 : -1)),
    [data, key],
  );

  if (!data || !summary) return null;

  const overridden = data.settings.buckets.some((b) => hasPctOverride(data, key, b.name));
  const defaultDate = defaultDateForPeriod(key, data.settings.payDay);

  function openEdit(t: Transaction) {
    setEditing(t);
    setAddOpen(true);
  }
  function closeSheet() {
    setAddOpen(false);
    setEditing(null);
  }

  return (
    <div>
      <div className="mt-2 px-1">
        <h1 className="text-lg font-extrabold sm:text-xl">{monthLabel(key)}</h1>
        {!isCalendarCycle(data.settings.payDay) ? (
          <p className="text-sm muted">
            {periodRangeLabel(key, data.settings.payDay)}
            {key === currentPeriodKey(data.settings.budgetYear, data.settings.payDay)
              ? ` · ${daysLeftInPeriod(key, data.settings.payDay)} days to pay day`
              : ""}
          </p>
        ) : null}
      </div>

      {/* month picker — scrolls on phones, wraps once there is room */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-x-visible">
        {keys.map((k) => {
          const has = (data.months[k]?.income ?? 0) + (data.months[k]?.extraIncome ?? 0) > 0;
          return (
            <button
              key={k}
              onClick={() => setSelected(k)}
              className={clsx(
                "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition",
                k === key ? "bg-brand-500 text-white" : "muted",
              )}
              style={k === key ? undefined : { background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {MONTH_SHORT[keyToMonthIndex(k)]}
              {has ? (
                <span
                  className={clsx(
                    "ml-1 inline-block h-1.5 w-1.5 rounded-full",
                    k === key ? "bg-white" : "bg-brand-500",
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {summary.orphanSpent !== 0 ? (
        <div className="mt-3">
          <Notice tone="error">
            <span className="flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <Money value={summary.orphanSpent} /> this {noun} sits in{" "}
                {summary.orphanBuckets.join(", ") || "a missing bucket"}, which no longer exists, so it is not
                in the totals below. Re-create the bucket in Settings or edit those transactions.
              </span>
            </span>
          </Notice>
        </div>
      ) : null}

      {/* Income and the bucket split sit side by side; transactions get the
          full width below, where there is room for a real table. */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-x-6">
        <div className="lg:col-span-1">
          {/* income */}
          <SectionTitle
            action={
              (monthDoc?.income ?? 0) > 0 ? (
                <button
                  onClick={() => mutate(copyIncomeForward(key))}
                  className="flex items-center gap-1 text-[13px] font-semibold text-brand-500"
                  title={`Copy this base income to every later ${noun}`}
                >
                  <Copy size={14} /> Copy forward
                </button>
              ) : null
            }
          >
            Income
          </SectionTitle>
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Base income</span>
              <NumberInput
                value={monthDoc?.income ?? 0}
                onCommit={(v) => mutate(upsertMonth(key, { income: v }))}
                prefix="R"
                min={0}
                className="w-40"
                ariaLabel="Base income"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Additional income</span>
              <NumberInput
                value={monthDoc?.extraIncome ?? 0}
                onCommit={(v) => mutate(upsertMonth(key, { extraIncome: v }))}
                prefix="R"
                min={0}
                className="w-40"
                ariaLabel="Additional income"
              />
            </div>
            <div
              className="flex items-center justify-between border-t pt-2 text-sm font-bold"
              style={{ borderColor: "var(--border)" }}
            >
              <span>Total income</span>
              <Money value={summary.totalIncome} />
            </div>
          </Card>

        </div>

        <div className="lg:col-span-2">
          {/* allocation table with rollover */}
          <SectionTitle
            action={
              overridden ? (
                <button
                  onClick={() => mutate(clearPctOverrides(key))}
                  className="flex items-center gap-1 text-[13px] font-semibold text-brand-500"
                  title={`Return this ${noun} to the default split`}
                >
                  <RotateCcw size={14} /> Reset %
                </button>
              ) : null
            }
          >
            Buckets · allocation &amp; rollover
          </SectionTitle>
          <Card className="!p-0 overflow-hidden">
            <div
              className="grid grid-cols-12 border-b px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider muted"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="col-span-5">Bucket</span>
              <span className="col-span-2 text-center">%</span>
              <span className="col-span-2 text-right">Spent</span>
              <span className="col-span-3 text-right">Balance c/f</span>
            </div>
            {summary.buckets.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm muted">
                No buckets yet — add some in Settings to split your income.
              </p>
            ) : null}
            {summary.buckets.map((b) => (
              <div
                key={b.bucket}
                className="grid grid-cols-12 items-center border-b px-3 py-1.5 text-[13px] last:border-0"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="col-span-5 pr-1 font-medium leading-tight">
                  {b.bucket}
                  {hasPctOverride(data, key, b.bucket) ? (
                    <span className="ml-1 text-[10px] font-bold uppercase text-brand-500" title={`Overridden for this ${noun}`}>
                      ·
                    </span>
                  ) : null}
                </span>
                <span className="col-span-2 flex justify-center">
                  <NumberInput
                    value={Math.round(b.pct * 1000) / 10}
                    onCommit={(v) => mutate(setPctOverride(key, b.bucket, v / 100))}
                    min={0}
                    inputClassName="!w-14 !px-1 !py-1 text-center !text-[12px]"
                    ariaLabel={`${b.bucket} percentage for ${monthLabel(key)}`}
                  />
                </span>
                <span className="col-span-2 text-right">
                  <Money value={b.spent} />
                </span>
                <span className="col-span-3 text-right font-bold">
                  <Money value={b.balance} />
                </span>
              </div>
            ))}
            <div
              className="grid grid-cols-12 items-center px-3 py-2 text-[13px] font-bold"
              style={{ background: "var(--bg)" }}
            >
              <span className="col-span-5">Total</span>
              <span
                className={clsx(
                  "col-span-2 text-center",
                  Math.abs(summary.pctTotal - 1) > 0.0005 && "text-amber-500",
                )}
                title={
                  Math.abs(summary.pctTotal - 1) > 0.0005
                    ? "Your percentages do not add up to 100%"
                    : undefined
                }
              >
                {(summary.pctTotal * 100).toFixed(0)}%
              </span>
              <span className="col-span-2 text-right">
                <Money value={summary.totalSpent} />
              </span>
              <span className="col-span-3 text-right">
                <Money value={summary.totalBalance} />
              </span>
            </div>
          </Card>
          {Math.abs(summary.unallocated) > 0.5 ? (
            <p className="mt-2 px-1 text-xs text-amber-600">
              <Money value={summary.unallocated} /> of this {noun}&apos;s income is not allocated to any bucket
              ({(summary.pctTotal * 100).toFixed(0)}% split).
            </p>
          ) : null}
          <p className="mt-2 px-1 text-xs muted">
            Each bucket&apos;s balance carries into the next {noun}. Edit a % to change just this {noun}&apos;s split.
          </p>
        </div>

      </div>

      {/* transactions — full width, so the desktop view can be a real table */}
      <div>
          <SectionTitle
            action={
              <button
                onClick={() => {
                  setEditing(null);
                  setAddOpen(true);
                }}
                className="flex items-center gap-1 text-[13px] font-semibold text-brand-500"
              >
                <Plus size={16} /> Add
              </button>
            }
          >
            Transactions ({txs.length})
          </SectionTitle>
          {txs.length === 0 ? (
            <Card className="space-y-3 text-center text-sm muted">
              <p>No transactions yet this {noun}.</p>
              <Button
                onClick={() => {
                  setEditing(null);
                  setAddOpen(true);
                }}
                variant="ghost"
              >
                <Plus size={16} /> Add the first one
              </Button>
            </Card>
          ) : (
            <>
              {/* desktop: a proper table — one row per transaction, columns aligned */}
              <Card className="hidden !p-0 lg:block">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr
                      className="border-b text-[10px] font-bold uppercase tracking-wider muted"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <th className="px-3 py-2 text-left font-bold">Date</th>
                      <th className="px-3 py-2 text-left font-bold">Category</th>
                      <th className="px-3 py-2 text-left font-bold">Bucket</th>
                      <th className="px-3 py-2 text-left font-bold">Description</th>
                      <th className="px-3 py-2 text-left font-bold">Type</th>
                      <th className="px-3 py-2 text-right font-bold">Amount</th>
                      <th className="w-24 px-3 py-2" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b last:border-0 hover:bg-black/[0.02]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums muted">{t.date}</td>
                        <td className="px-3 py-1.5 font-semibold">{t.category}</td>
                        <td className="px-3 py-1.5 muted">{t.bucket}</td>
                        <td className="max-w-[22ch] truncate px-3 py-1.5 muted">
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
                          {t.type === "transfer" && t.toAmount && t.toAmount !== t.amount ? (
                            <span className="ml-1 text-[11px] muted">
                              → <Money value={t.toAmount} currency="$" />
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">
                          {/* quiet at rest on a mouse, always there on touch — see .row-actions */}
                          <div className="row-actions flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(t)}
                              aria-label={`Edit ${t.category}`}
                              className="text-slate-400 transition hover:text-brand-500"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => mutate(repeatTransactionNextMonth(t.id))}
                              aria-label={`Repeat ${t.category} next ${noun}`}
                              title={`Repeat next ${noun}`}
                              className="text-slate-400 transition hover:text-brand-500"
                            >
                              <Copy size={14} />
                            </button>
                            <ConfirmDelete
                              title={`Delete ${t.category}`}
                              size={14}
                              onConfirm={() => mutate(deleteTransaction(t.id))}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* phone / tablet: a table would scroll sideways, so keep cards */}
              <div className="grid gap-2 md:grid-cols-2 lg:hidden">
                {txs.map((t) => (
                  <Card key={t.id} className="!p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold">{t.category}</span>
                          <span
                            className={clsx(
                              "chip shrink-0",
                              t.type === "expense" && "bg-rose-100 text-rose-600",
                              t.type === "income" && "bg-emerald-100 text-emerald-700",
                              t.type === "transfer" && "bg-slate-200 text-slate-700",
                            )}
                          >
                            {t.type}
                          </span>
                        </div>
                        <div className="truncate text-xs muted">
                          {t.date}
                          {t.type === "transfer" && t.transferTo ? ` → ${t.transferTo}` : ""}
                          {t.description ? ` · ${t.description}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-right">
                          <Money
                            value={t.amount}
                            className={clsx(
                              "text-[13px] font-bold tabular-nums",
                              t.type === "income" ? "text-emerald-600" : undefined,
                            )}
                          />
                          {t.type === "transfer" && t.toAmount && t.toAmount !== t.amount ? (
                            <div className="text-[11px] muted">
                              → <Money value={t.toAmount} currency="$" />
                            </div>
                          ) : null}
                        </div>
                        <button
                          onClick={() => openEdit(t)}
                          aria-label={`Edit ${t.category}`}
                          className="text-slate-400 transition hover:text-brand-500"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => mutate(repeatTransactionNextMonth(t.id))}
                          aria-label={`Repeat ${t.category} next ${noun}`}
                          title={`Repeat next ${noun}`}
                          className="text-slate-400 transition hover:text-brand-500"
                        >
                          <Copy size={15} />
                        </button>
                        <ConfirmDelete
                          title={`Delete ${t.category}`}
                          size={15}
                          onConfirm={() => mutate(deleteTransaction(t.id))}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
      </div>

      <AddTransactionSheet
        open={addOpen}
        onClose={closeSheet}
        defaultDate={defaultDate}
        edit={editing}
      />
    </div>
  );
}
