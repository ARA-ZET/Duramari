"use client";

import { useMemo, useState } from "react";
import { useAuth, useData } from "@/components/providers";
import {
  Card,
  SectionTitle,
  Button,
  Field,
  Money,
  NumberInput,
  TextInput,
  ConfirmDelete,
  Notice,
  Select,
} from "@/components/ui";
import { accountBalances, findIssues, num } from "@/lib/budget";
import { buildSheetSeed } from "@/lib/seedData";
import {
  PAY_DAY_MAX,
  PAY_DAY_MIN,
  clampPayDay,
  currentPeriodKey,
  isCalendarCycle,
  periodRangeLabel,
} from "@/lib/period";
import {
  accountUsage,
  addAccount,
  addBucket,
  addCategory,
  categoryUsage,
  deleteAccount,
  deleteBucket,
  deleteCategory,
  moveAccount,
  normalizeBucketPcts,
  renameBucket,
  renameCategory,
  setBucketPct,
  setCategoryBucket,
  setPayDay,
  setSettings,
  updateAccount,
} from "@/lib/mutations";
import { Plus, LogOut, ChevronUp, ChevronDown, AlertTriangle, HardDrive, RefreshCw, Upload } from "lucide-react";

export default function SettingsPage() {
  const { data, archives, mutate, archiveAndStartYear, reset, driveReauthNeeded, reconnectDrive } = useData();
  const { user, mode, signOutUser } = useAuth();
  const [newCat, setNewCat] = useState({ name: "", bucket: "" });
  const [newAcc, setNewAcc] = useState({ name: "", kind: "zar" as "zar" | "usd", opening: "", goal: "" });
  const [confirmYear, setConfirmYear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);

  const issues = useMemo(() => (data ? findIssues(data) : []), [data]);
  const balances = useMemo(() => (data ? accountBalances(data) : []), [data]);

  if (!data) return null;
  const s = data.settings;
  const pctTotal = s.buckets.reduce((a, b) => a + num(b.pct), 0);
  const bucketOptions = s.buckets.map((b) => ({ value: b.name, label: b.name }));

  async function doNewYear() {
    setConfirmYear(false);
    await archiveAndStartYear();
  }

  return (
    <div>
      <h1 className="mt-2 px-1 text-lg font-extrabold sm:text-xl">Settings</h1>

      {issues.length > 0 ? (
        <div className="mt-3 space-y-2">
          {issues.map((i, idx) => (
            <Notice key={idx} tone={i.level === "error" ? "error" : "warn"}>
              <span className="flex items-start gap-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {i.message}
              </span>
            </Notice>
          ))}
        </div>
      ) : null}

      {/* profile */}
      <SectionTitle>Account</SectionTitle>
      <Card className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{user?.email ?? user?.displayName ?? "Local user"}</div>
          <div className="text-xs muted">
            {mode === "firebase" ? "Signed in with Google" : "Local mode (this browser only)"}
          </div>
        </div>
        {mode === "firebase" ? (
          <Button variant="ghost" onClick={() => signOutUser()} className="!py-2">
            <LogOut size={16} /> Sign out
          </Button>
        ) : null}
      </Card>

      {/* storage */}
      <SectionTitle>Storage</SectionTitle>
      <Card>
        <div className="flex items-center gap-3">
          <div
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
              driveReauthNeeded ? "bg-amber-100 text-amber-600" : "bg-brand-50 text-brand-600"
            }`}
          >
            <HardDrive size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">
              {mode === "firebase" ? "Your Google Drive" : "This browser only"}
            </div>
            <div className="text-xs muted">
              {mode === "firebase"
                ? "Stored in a private, hidden folder only this app can see — not on our servers."
                : "No account connected, so nothing leaves this device."}
            </div>
          </div>
          {driveReauthNeeded ? (
            <Button onClick={() => void reconnectDrive()} className="!px-3 !py-2 text-xs">
              <RefreshCw size={14} /> Reconnect
            </Button>
          ) : null}
        </div>
        {mode === "firebase" ? (
          <p className="mt-3 border-t pt-3 text-xs muted" style={{ borderColor: "var(--border)" }}>
            We keep your name and email so you can sign in — nothing about your budget, income or
            spending ever reaches our database.
          </p>
        ) : null}
      </Card>

      {/* year + income */}
      <SectionTitle>Budget basics</SectionTitle>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm">Budget year</span>
          <NumberInput
            value={s.budgetYear}
            onCommit={(v) => mutate(setSettings({ budgetYear: Math.trunc(v) }))}
            inputClassName="!w-28"
            ariaLabel="Budget year"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Typical monthly income</span>
          <NumberInput
            value={s.typicalIncome}
            onCommit={(v) => mutate(setSettings({ typicalIncome: v }))}
            prefix="R"
            min={0}
            inputClassName="!w-28"
            ariaLabel="Typical monthly income"
          />
        </div>
        <div
          className="flex items-center justify-between border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="pr-3">
            <span className="text-sm">Pay date</span>
            <p className="text-xs muted">
              {isCalendarCycle(s.payDay)
                ? "Budget periods run 1st to month end."
                : `Budget periods run pay day to pay day — this one is ${periodRangeLabel(
                    currentPeriodKey(s.budgetYear, s.payDay),
                    s.payDay,
                  )}.`}
            </p>
          </div>
          <NumberInput
            value={clampPayDay(s.payDay)}
            onCommit={(v) => mutate(setPayDay(v))}
            min={PAY_DAY_MIN}
            inputClassName="!w-20"
            ariaLabel="Pay date"
          />
        </div>
        <p className="-mt-1 text-xs muted">
          Any day from {PAY_DAY_MIN} to {PAY_DAY_MAX}. Spending is filed against the pay cheque that
          covers it, so a purchase the day after pay day counts towards the new period.
          {clampPayDay(s.payDay) >= 16
            ? " Because your pay date is late in the month, each period takes the name of the month it mostly falls in."
            : ""}
          {" "}Changing it re-files every existing transaction.
        </p>

        <div
          className="flex items-center justify-between border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-sm">USD → ZAR rate</span>
          <NumberInput
            value={s.usdRate}
            onCommit={(v) => mutate(setSettings({ usdRate: v }))}
            prefix="R"
            suffix="/ $"
            min={0}
            step={0.01}
            inputClassName="!w-24"
            ariaLabel="USD to ZAR rate"
          />
        </div>
      </Card>

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8">
        <div>
          {/* buckets */}
          <SectionTitle
            action={
              <button
                onClick={() => mutate(addBucket())}
                className="flex items-center gap-1 text-[13px] font-semibold text-brand-500"
              >
                <Plus size={16} /> Add
              </button>
            }
          >
            Buckets &amp; default %
          </SectionTitle>
          <Card className="space-y-2">
            {s.buckets.length === 0 ? (
              <p className="py-2 text-center text-sm muted">
                No buckets yet — add one to start splitting your income.
              </p>
            ) : null}
            {s.buckets.map((b) => {
              const others = s.buckets.filter((x) => x.name !== b.name);
              return (
                <div key={b.name} className="flex items-center gap-2">
                  <TextInput
                    value={b.name}
                    onCommit={(v) => mutate(renameBucket(b.name, v))}
                    className="flex-1"
                    ariaLabel={`Bucket name ${b.name}`}
                  />
                  <NumberInput
                    value={Math.round(num(b.pct) * 1000) / 10}
                    onCommit={(v) => mutate(setBucketPct(b.name, v / 100))}
                    suffix="%"
                    min={0}
                    inputClassName="!w-16"
                    ariaLabel={`${b.name} percentage`}
                  />
                  <ConfirmDelete
                    title={`Delete ${b.name}`}
                    onConfirm={() => mutate(deleteBucket(b.name, others[0]?.name))}
                  />
                </div>
              );
            })}
            <div
              className="flex items-center justify-between border-t pt-2 text-sm font-bold"
              style={{ borderColor: "var(--border)" }}
            >
              <span>Total</span>
              <span className="flex items-center gap-2">
                <span className={Math.abs(pctTotal - 1) > 0.0005 ? "text-amber-500" : undefined}>
                  {(pctTotal * 100).toFixed(1)}%
                </span>
                {Math.abs(pctTotal - 1) > 0.0005 && pctTotal > 0 ? (
                  <button
                    onClick={() => mutate(normalizeBucketPcts())}
                    className="text-xs font-semibold text-brand-500"
                  >
                    Make 100%
                  </button>
                ) : null}
              </span>
            </div>
            {s.buckets.length > 1 ? (
              <p className="text-xs muted">
                Deleting a bucket moves its categories and history into{" "}
                <b>{s.buckets.find((x) => x.name !== s.buckets[0]?.name)?.name ?? s.buckets[0]?.name}</b> rather
                than losing them.
              </p>
            ) : null}
          </Card>
        </div>

        <div>
          {/* categories */}
          <SectionTitle>Expense categories</SectionTitle>
          <Card className="space-y-2">
            {s.categories.map((c) => {
              const uses = categoryUsage(data, c.name);
              const isAccount = data.accounts.some((a) => a.name === c.name);
              return (
                <div key={c.name} className="flex items-center gap-2">
                  <TextInput
                    value={c.name}
                    onCommit={(v) => mutate(renameCategory(c.name, v))}
                    className="min-w-0 flex-1"
                    ariaLabel={`Category name ${c.name}`}
                  />
                  <Select
                    value={c.bucket}
                    onChange={(v) => mutate(setCategoryBucket(c.name, v))}
                    options={bucketOptions}
                    className="min-w-0 flex-1"
                    ariaLabel={`Bucket for ${c.name}`}
                  />
                  {isAccount ? (
                    <span className="shrink-0 text-[10px] font-bold uppercase muted" title="Backed by an account — delete it from the account list">
                      acct
                    </span>
                  ) : (
                    <ConfirmDelete
                      title={uses ? `Delete ${c.name} and its ${uses} transaction(s)` : `Delete ${c.name}`}
                      onConfirm={() => mutate(deleteCategory(c.name))}
                    />
                  )}
                </div>
              );
            })}
            <div className="flex items-end gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0 flex-1">
                <Field label="New category">
                  <input
                    className="input !py-1.5 text-sm"
                    value={newCat.name}
                    onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCat.name && newCat.bucket) {
                        mutate(addCategory({ name: newCat.name.trim(), bucket: newCat.bucket }));
                        setNewCat({ name: "", bucket: "" });
                      }
                    }}
                    placeholder="e.g. Medical"
                  />
                </Field>
              </div>
              <Select
                value={newCat.bucket}
                onChange={(v) => setNewCat({ ...newCat, bucket: v })}
                options={bucketOptions}
                placeholder="Bucket…"
                className="!w-32 shrink-0 !py-2"
                ariaLabel="Bucket for the new category"
              />
              <Button
                className="!py-2"
                disabled={!newCat.name.trim() || !newCat.bucket}
                onClick={() => {
                  mutate(addCategory({ name: newCat.name.trim(), bucket: newCat.bucket }));
                  setNewCat({ name: "", bucket: "" });
                }}
              >
                Add
              </Button>
            </div>
            <p className="text-xs muted">
              Deleting a category keeps its past transactions — they stay in their bucket totals.
            </p>
          </Card>
        </div>
      </div>

      {/* accounts */}
      <SectionTitle>Savings accounts</SectionTitle>
      <Card className="space-y-2">
        {balances.map((b, i) => {
          const uses = accountUsage(data, b.account.id);
          return (
            <div
              key={b.account.id}
              className="space-y-2 border-b pb-3 last:border-0 last:pb-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <TextInput
                  value={b.account.name}
                  onCommit={(v) => mutate(updateAccount(b.account.id, { name: v }))}
                  className="min-w-0 flex-1"
                  ariaLabel={`Account name ${b.account.name}`}
                />
                <span className="shrink-0 text-[10px] font-bold uppercase muted">
                  {b.account.kind === "usd" ? "USD" : "ZAR"}
                </span>
                <div className="flex shrink-0 flex-col">
                  <button
                    onClick={() => mutate(moveAccount(b.account.id, -1))}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="muted disabled:opacity-25"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => mutate(moveAccount(b.account.id, 1))}
                    disabled={i === balances.length - 1}
                    aria-label="Move down"
                    className="muted disabled:opacity-25"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <ConfirmDelete
                  title={`Delete ${b.account.name}`}
                  onConfirm={() => mutate(deleteAccount(b.account.id))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs muted">
                <span className="flex items-center gap-1">
                  Opening
                  <NumberInput
                    value={b.account.opening}
                    onCommit={(v) => mutate(updateAccount(b.account.id, { opening: v }))}
                    prefix={b.account.kind === "usd" ? "$" : "R"}
                    inputClassName="!w-24 !py-1 text-xs"
                    ariaLabel={`${b.account.name} opening balance`}
                  />
                </span>
                <span className="flex items-center gap-1">
                  Goal
                  <NumberInput
                    value={b.account.goal ?? 0}
                    onCommit={(v) => mutate(updateAccount(b.account.id, { goal: v }))}
                    prefix={b.account.kind === "usd" ? "$" : "R"}
                    min={0}
                    inputClassName="!w-24 !py-1 text-xs"
                    ariaLabel={`${b.account.name} savings goal`}
                  />
                </span>
                <span>
                  Balance{" "}
                  <Money
                    value={b.balance}
                    currency={b.account.kind === "usd" ? "$" : "R"}
                    className="font-semibold"
                  />
                </span>
                {uses.txs + uses.usd > 0 ? (
                  <span>
                    {uses.txs} transaction{uses.txs === 1 ? "" : "s"}
                    {uses.usd ? `, ${uses.usd} $ entries` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap items-end gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-[8rem] flex-1">
            <Field label="New account">
              <input
                className="input !py-1.5 text-sm"
                value={newAcc.name}
                onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })}
                placeholder="e.g. Emergency fund"
              />
            </Field>
          </div>
          <Select
            value={newAcc.kind}
            onChange={(v) => setNewAcc({ ...newAcc, kind: v as "zar" | "usd" })}
            options={[
              { value: "zar", label: "Rand" },
              { value: "usd", label: "USD" },
            ]}
            className="!w-24 shrink-0 !py-2"
            ariaLabel="Account currency"
          />
          <div className="w-28 shrink-0">
            <Field label="Opening">
              <input
                className="input !py-1.5 text-right text-sm"
                type="number"
                inputMode="decimal"
                value={newAcc.opening}
                onChange={(e) => setNewAcc({ ...newAcc, opening: e.target.value })}
                placeholder="0"
              />
            </Field>
          </div>
          <div className="w-28 shrink-0">
            <Field label="Goal">
              <input
                className="input !py-1.5 text-right text-sm"
                type="number"
                inputMode="decimal"
                value={newAcc.goal}
                onChange={(e) => setNewAcc({ ...newAcc, goal: e.target.value })}
                placeholder="optional"
              />
            </Field>
          </div>
          <Button
            className="!py-2"
            disabled={!newAcc.name.trim()}
            onClick={() => {
              mutate(
                addAccount({
                  name: newAcc.name.trim(),
                  kind: newAcc.kind,
                  opening: num(newAcc.opening),
                  goal: num(newAcc.goal) > 0 ? num(newAcc.goal) : undefined,
                  order: data.accounts.length,
                }),
              );
              setNewAcc({ name: "", kind: "zar", opening: "", goal: "" });
            }}
          >
            Add
          </Button>
        </div>
        <p className="text-xs muted">
          Rand accounts also appear in your category list so you can save into them. Deleting an account keeps
          its transactions — only the account and its category go.
        </p>
      </Card>

      {/* One-off import of the August 2026 budget sheet. Safe to delete this
          whole block (and src/lib/seedData.ts) once it has been used. */}
      <SectionTitle>Import</SectionTitle>
      <Card className="space-y-2">
        {confirmImport ? (
          <div className="space-y-2">
            <Notice tone="error">
              This replaces everything currently in this budget with the August 2026 sheet — 23
              transactions, 4 accounts and their opening balances. Anything already here is lost.
            </Notice>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  mutate(() => buildSheetSeed());
                  setConfirmImport(false);
                }}
                className="btn flex-1 bg-rose-500 text-white"
              >
                Replace with the sheet
              </button>
              <Button variant="ghost" onClick={() => setConfirmImport(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <button onClick={() => setConfirmImport(true)} className="btn-ghost w-full">
              <Upload size={16} /> Import the August 2026 sheet
            </button>
            <p className="text-xs muted">
              Loads R16,000 income, the 40/10/35/15 split, 23 transactions dated 25&ndash;29 August, and
              opening balances of R1,000 / R0 / R12,606 / $120 so the account totals land on
              R5,000, R1,000, R14,006 and $120.
            </p>
          </>
        )}
      </Card>

      {/* danger / lifecycle */}
      <SectionTitle>Manage</SectionTitle>
      <Card className="space-y-2">
        {confirmYear ? (
          <div className="space-y-2">
            <Notice tone="info">
              {s.budgetYear} is rolled up into an archive first, so your reports keep its history. The live
              year is then cleared and each account&apos;s opening balance becomes this year&apos;s closing
              balance. Debtors carry over.
            </Notice>
            <div className="flex gap-2">
              <Button onClick={doNewYear} className="flex-1">
                Yes, start {s.budgetYear + 1}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmYear(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmYear(true)} className="btn-ghost w-full">
            Archive {s.budgetYear} and start {s.budgetYear + 1}
          </button>
        )}

        {confirmReset ? (
          <div className="space-y-2">
            <Notice tone="error">
              This wipes every account, transaction and setting and restores the defaults. It cannot be undone.
            </Notice>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  reset();
                  setConfirmReset(false);
                }}
                className="btn flex-1 bg-rose-500 text-white"
              >
                Erase everything
              </button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="btn w-full border border-rose-200 text-rose-600"
          >
            Reset all data
          </button>
        )}
      </Card>

      {archives.length > 0 ? (
        <>
          <SectionTitle>Archived years</SectionTitle>
          <Card className="space-y-2">
            {archives.map((a) => (
              <div key={a.year} className="flex items-center justify-between text-sm">
                <span className="font-semibold">{a.year}</span>
                <span className="flex items-center gap-3 text-xs muted">
                  <span>{a.months.filter((m) => m.totalIncome > 0 || m.totalSpent > 0).length} months</span>
                  <span>
                    closed at <Money value={a.closingSavingsRand} className="font-semibold" />
                  </span>
                </span>
              </div>
            ))}
            <p className="pt-1 text-xs muted">
              Each closed year is one rolled-up document, so the reports read years of history cheaply.
            </p>
          </Card>
        </>
      ) : null}

      <p className="mt-6 px-1 text-center text-xs muted">
        Duramari · {mode === "firebase" ? "Firebase" : "Local"} · v0.1
      </p>
    </div>
  );
}
