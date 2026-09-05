"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "./providers";
import { Button, Field, Sheet, Notice } from "./ui";
import { addTransaction, updateTransaction } from "@/lib/mutations";
import {
  accountBalances as accountBalancesOf,
  bucketForCategory,
  computeYear,
  randFmt,
  summaryFor,
  todayISO,
} from "@/lib/budget";
import { periodKeyFor, periodLabel, periodRangeLabel } from "@/lib/period";
import type { Transaction, TxType } from "@/lib/types";

/** A move's source is either a bucket or a savings account, so the picker
 *  values are prefixed to say which — the two name spaces can overlap. */
const BUCKET = "b:";
const ACCOUNT = "a:";

const TYPES: { key: TxType; label: string; hint: string }[] = [
  { key: "expense", label: "Expense", hint: "Money out of a budget — a purchase, or a deposit into savings." },
  { key: "income", label: "Income", hint: "Money into a budget — a top-up, refund, or a withdrawal back out of savings." },
  { key: "transfer", label: "Transfer", hint: "Move money between two of your own savings accounts. Budgets are untouched." },
  { key: "move", label: "Move", hint: "Cover one budget from another, or from savings. Nothing is spent — your total is unchanged." },
];

export function AddTransactionSheet({
  open,
  onClose,
  defaultDate,
  edit,
  defaultType,
  defaultMoveTo,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate?: string;
  /** When supplied the sheet edits this transaction instead of creating one. */
  edit?: Transaction | null;
  /** Opens the sheet on this tab — used by "Cover" on an overspent bucket. */
  defaultType?: TxType;
  /** Pre-selects the bucket a move should land in. */
  defaultMoveTo?: string;
}) {
  const { data, mutate } = useData();
  const [date, setDate] = useState(defaultDate ?? todayISO());
  const [category, setCategory] = useState("");
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [moveFrom, setMoveFrom] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [desc, setDesc] = useState("");

  // Re-seed every time the sheet opens. Without this the sheet keeps the date
  // (and everything else) from the first time it was opened.
  useEffect(() => {
    if (!open) return;
    if (edit) {
      setDate(edit.date);
      setCategory(edit.category);
      setType(edit.type);
      setAmount(String(edit.amount ?? ""));
      setTransferTo(edit.transferTo ?? "");
      setToAmount(edit.toAmount ? String(edit.toAmount) : "");
      setMoveFrom(edit.bucket ? BUCKET + edit.bucket : edit.category ? ACCOUNT + edit.category : "");
      setMoveTo(edit.bucketTo ?? "");
      setDesc(edit.description ?? "");
    } else {
      setDate(defaultDate ?? todayISO());
      setCategory("");
      setType(defaultType ?? "expense");
      setAmount("");
      setTransferTo("");
      setToAmount("");
      setMoveFrom("");
      setMoveTo(defaultMoveTo ?? "");
      setDesc("");
    }
  }, [open, edit, defaultDate, defaultType, defaultMoveTo]);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const accountNames = useMemo(() => new Set(accounts.map((a) => a.name)), [accounts]);
  // Only rand accounts can fund a bucket: a dollar account would need a rate,
  // and guessing one would quietly put the wrong number in the budget.
  const accountBalances = useMemo(
    () => (data ? accountBalancesOf(data).filter((a) => a.account.kind === "zar") : []),
    [data],
  );

  // A transfer can only leave an account, so narrow the picker for that case.
  const sourceOptions = useMemo(() => {
    const cats = data?.settings.categories ?? [];
    return type === "transfer" ? cats.filter((c) => accountNames.has(c.name)) : cats;
  }, [data, type, accountNames]);

  const destOptions = useMemo(
    () => accounts.filter((a) => a.name !== category),
    [accounts, category],
  );

  const destAccount = useMemo(
    () => accounts.find((a) => a.name === transferTo),
    [accounts, transferTo],
  );
  const crossCurrency = destAccount?.kind === "usd";

  const bucket = useMemo(
    () => (data && category ? bucketForCategory(data, category) : ""),
    [data, category],
  );

  // A transfer out of an account the source picker no longer offers is invalid.
  useEffect(() => {
    if (type === "transfer" && category && !accountNames.has(category)) setCategory("");
  }, [type, category, accountNames]);

  // What each bucket has left in the period this entry lands in, so the sheet
  // can show what the move does before it is saved.
  const period = data ? periodKeyFor(date, data.settings.payDay) : "";
  const summary = useMemo(
    () => (data ? summaryFor(computeYear(data), period) : undefined),
    [data, period],
  );
  const balanceOf = (bucketName: string) =>
    summary?.buckets.find((b) => b.bucket === bucketName)?.balance ?? 0;

  const moveFromName = moveFrom.slice(2);
  const moveFromIsAccount = moveFrom.startsWith(ACCOUNT);
  const moveFromBalance = moveFrom
    ? moveFromIsAccount
      ? (accountBalances.find((a) => a.account.name === moveFromName)?.balance ?? 0)
      : balanceOf(moveFromName)
    : 0;

  if (!data) return null;

  const amt = parseFloat(amount);
  const validAmount = Number.isFinite(amt) && amt > 0;
  const needsDest = type === "transfer";
  const validDest = !needsDest || Boolean(transferTo);
  const toAmt = parseFloat(toAmount);
  const validToAmount = !crossCurrency || (Number.isFinite(toAmt) && toAmt > 0);
  const validMove =
    type !== "move" || (Boolean(moveFrom) && Boolean(moveTo) && moveFromName !== moveTo);
  const canSave =
    validAmount &&
    validDest &&
    validToAmount &&
    validMove &&
    (type === "move" ? Boolean(moveFrom) && Boolean(moveTo) : Boolean(category));

  function save() {
    if (!canSave || !data) return;
    const isMove = type === "move";
    const payload = {
      date,
      monthKey: periodKeyFor(date, data.settings.payDay),
      // A move records exactly one source: the account it was drawn from, or
      // the bucket it came out of. Never both, or it would debit two places.
      category: isMove ? (moveFromIsAccount ? moveFromName : "") : category,
      bucket: isMove
        ? moveFromIsAccount
          ? ""
          : moveFromName
        : bucketForCategory(data, category),
      bucketTo: isMove ? moveTo : undefined,
      type,
      amount: Math.abs(amt),
      transferTo: type === "transfer" ? transferTo : undefined,
      toAmount:
        type === "transfer"
          ? crossCurrency
            ? Math.abs(toAmt)
            : Math.abs(amt)
          : undefined,
      description: desc.trim() || undefined,
    };
    mutate(edit ? updateTransaction(edit.id, payload) : addTransaction(payload));
    onClose();
  }

  const inYear = period.startsWith(String(data.settings.budgetYear));

  return (
    <Sheet open={open} onClose={onClose} title={edit ? "Edit transaction" : "Add transaction"}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={clsx(
                "rounded-xl border px-2 py-2 text-sm font-semibold transition",
                type === t.key ? "border-brand-500 bg-brand-50 text-brand-700" : "muted",
              )}
              style={type === t.key ? undefined : { borderColor: "var(--border)" }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-xs muted">{TYPES.find((t) => t.key === type)?.hint}</p>

        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {!inYear ? (
          <Notice tone="warn">
            This date falls outside your {data.settings.budgetYear} budget year, so it will not show up in
            the Months view. Change the budget year in Settings if that is intentional.
          </Notice>
        ) : data.settings.payDay > 1 ? (
          <p className="-mt-2 text-xs muted">
            Counts towards <b>{periodLabel(period)}</b> ({periodRangeLabel(period, data.settings.payDay)}).
          </p>
        ) : null}

        {type === "move" ? (
          <>
            <Field
              label="Take it from"
              hint="A budget with money to spare, or one of your savings accounts."
            >
              <select
                className="input"
                value={moveFrom}
                onChange={(e) => setMoveFrom(e.target.value)}
              >
                <option value="">Select…</option>
                <optgroup label="Budgets">
                  {(summary?.buckets ?? []).map((b) => (
                    <option key={b.bucket} value={BUCKET + b.bucket}>
                      {b.bucket} — {randFmt(b.balance)} left
                    </option>
                  ))}
                </optgroup>
                {accountBalances.length ? (
                  <optgroup label="Savings accounts">
                    {accountBalances.map((a) => (
                      <option key={a.account.id} value={ACCOUNT + a.account.name}>
                        {a.account.name} — {randFmt(a.balance)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </Field>

            <Field label="Give it to" hint="The budget that is short.">
              <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Select…</option>
                {(summary?.buckets ?? [])
                  .filter((b) => b.bucket !== moveFromName)
                  .map((b) => (
                    <option key={b.bucket} value={b.bucket}>
                      {b.bucket} — {randFmt(b.balance)} left
                    </option>
                  ))}
              </select>
            </Field>
          </>
        ) : (
        <Field
          label={type === "transfer" ? "From account" : "Category"}
          hint={
            type === "transfer"
              ? "Transfers can only come out of an account."
              : bucket
                ? `Budget: ${bucket}`
                : "Pick a category or savings account"
          }
        >
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select…</option>
            {sourceOptions.map((c) => (
              <option key={c.name} value={c.name}>
                {type === "transfer" ? c.name : `${c.name} — ${c.bucket}`}
              </option>
            ))}
          </select>
        </Field>
        )}
        {type === "transfer" && sourceOptions.length === 0 ? (
          <Notice tone="warn">You need at least one account before you can record a transfer.</Notice>
        ) : null}

        <Field label={crossCurrency ? "Amount leaving (R)" : type === "move" ? "Amount to move (R)" : "Amount (R)"}>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>

        {/* The whole point of a move is that the two sides still add up, so
            show both of them changing rather than asking for trust. */}
        {type === "move" && moveFrom && moveTo && validAmount ? (
          <div
            className="rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate muted">{moveFromName}</span>
              <span className="shrink-0 tabular-nums">
                {randFmt(moveFromBalance)} →{" "}
                <b className={moveFromBalance - amt < 0 ? "text-rose-500" : undefined}>
                  {randFmt(moveFromBalance - amt)}
                </b>
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="truncate muted">{moveTo}</span>
              <span className="shrink-0 tabular-nums">
                {randFmt(balanceOf(moveTo))} →{" "}
                <b className={balanceOf(moveTo) + amt < 0 ? "text-rose-500" : undefined}>
                  {randFmt(balanceOf(moveTo) + amt)}
                </b>
              </span>
            </div>
            {moveFromBalance - amt < 0 ? (
              <p className="mt-1.5 text-[11px] text-amber-600">
                This leaves {moveFromName} overdrawn. The money still balances, but the shortfall
                just moves across.
              </p>
            ) : null}
          </div>
        ) : null}

        {type === "transfer" ? (
          <>
            <Field label="To account">
              <select className="input" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                <option value="">Select…</option>
                {destOptions.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name} {a.kind === "usd" ? "($)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            {crossCurrency ? (
              <Field
                label="Dollars received ($)"
                hint={
                  validAmount && Number.isFinite(toAmt) && toAmt > 0
                    ? `Rate: R${(amt / toAmt).toFixed(2)} / $`
                    : "Both legs are recorded from this one entry."
                }
              >
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={toAmount}
                  onChange={(e) => setToAmount(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            ) : null}
          </>
        ) : null}

        <Field label="Description">
          <input
            className="input"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Groceries"
          />
        </Field>

        {amount && !validAmount ? (
          <Notice tone="error">Enter an amount greater than zero.</Notice>
        ) : null}
        {type === "move" && moveFrom && moveTo && moveFromName === moveTo ? (
          <Notice tone="error">Pick two different places — a move to itself changes nothing.</Notice>
        ) : null}

        <Button onClick={save} disabled={!canSave} className="w-full">
          {edit ? "Save changes" : "Save transaction"}
        </Button>
      </div>
    </Sheet>
  );
}
