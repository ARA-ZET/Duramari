"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "./providers";
import { Button, Field, Sheet, Notice } from "./ui";
import { addTransaction, updateTransaction } from "@/lib/mutations";
import { bucketForCategory, todayISO } from "@/lib/budget";
import { periodKeyFor, periodLabel, periodRangeLabel } from "@/lib/period";
import type { Transaction, TxType } from "@/lib/types";

const TYPES: { key: TxType; label: string; hint: string }[] = [
  { key: "expense", label: "Expense", hint: "Money out of a bucket — a purchase, or a deposit into a savings account." },
  { key: "income", label: "Income", hint: "Money into a bucket — a top-up, refund, or a withdrawal back out of savings." },
  { key: "transfer", label: "Transfer", hint: "Move money between two of your own accounts. Buckets are untouched." },
];

export function AddTransactionSheet({
  open,
  onClose,
  defaultDate,
  edit,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate?: string;
  /** When supplied the sheet edits this transaction instead of creating one. */
  edit?: Transaction | null;
}) {
  const { data, mutate } = useData();
  const [date, setDate] = useState(defaultDate ?? todayISO());
  const [category, setCategory] = useState("");
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [toAmount, setToAmount] = useState("");
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
      setDesc(edit.description ?? "");
    } else {
      setDate(defaultDate ?? todayISO());
      setCategory("");
      setType("expense");
      setAmount("");
      setTransferTo("");
      setToAmount("");
      setDesc("");
    }
  }, [open, edit, defaultDate]);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const accountNames = useMemo(() => new Set(accounts.map((a) => a.name)), [accounts]);

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

  if (!data) return null;

  const amt = parseFloat(amount);
  const validAmount = Number.isFinite(amt) && amt > 0;
  const needsDest = type === "transfer";
  const validDest = !needsDest || Boolean(transferTo);
  const toAmt = parseFloat(toAmount);
  const validToAmount = !crossCurrency || (Number.isFinite(toAmt) && toAmt > 0);
  const canSave = Boolean(category) && validAmount && validDest && validToAmount;

  function save() {
    if (!canSave || !data) return;
    const payload = {
      date,
      monthKey: periodKeyFor(date, data.settings.payDay),
      category,
      bucket: bucketForCategory(data, category),
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

  const period = periodKeyFor(date, data.settings.payDay);
  const inYear = period.startsWith(String(data.settings.budgetYear));

  return (
    <Sheet open={open} onClose={onClose} title={edit ? "Edit transaction" : "Add transaction"}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
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

        <Field
          label={type === "transfer" ? "From account" : "Category"}
          hint={
            type === "transfer"
              ? "Transfers can only come out of an account."
              : bucket
                ? `Bucket: ${bucket}`
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
        {type === "transfer" && sourceOptions.length === 0 ? (
          <Notice tone="warn">You need at least one account before you can record a transfer.</Notice>
        ) : null}

        <Field label={crossCurrency ? "Amount leaving (R)" : "Amount (R)"}>
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

        <Button onClick={save} disabled={!canSave} className="w-full">
          {edit ? "Save changes" : "Save transaction"}
        </Button>
      </div>
    </Sheet>
  );
}
