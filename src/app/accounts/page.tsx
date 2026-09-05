"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/components/providers";
import {
  Card,
  Money,
  SectionTitle,
  Button,
  Field,
  Sheet,
  NumberInput,
  TextInput,
  ConfirmDelete,
  ProgressBar,
  Notice,
  Select,
} from "@/components/ui";
import {
  accountBalances,
  debtorOutstanding,
  todayISO,
  totalSavingsRand,
  usdBalance,
  usdEntriesFor,
  num,
} from "@/lib/budget";
import {
  addAccount,
  addDebtor,
  addUsdEntry,
  deleteAccount,
  deleteDebtor,
  deleteUsdEntry,
  setSettings,
  updateAccount,
  updateDebtor,
} from "@/lib/mutations";
import { Plus, ArrowDownRight, ArrowUpRight } from "lucide-react";

export default function AccountsPage() {
  const { data, mutate } = useData();
  const [usdOpen, setUsdOpen] = useState<string | null>(null);
  const [debtorOpen, setDebtorOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const balances = useMemo(() => (data ? accountBalances(data) : []), [data]);
  const usd = useMemo(() => (data ? usdBalance(data) : { usd: 0, usdIn: 0, usdOut: 0 }), [data]);
  const total = useMemo(() => (data ? totalSavingsRand(data) : 0), [data]);
  const owed = useMemo(() => (data ? debtorOutstanding(data) : 0), [data]);

  if (!data) return null;
  const zar = balances.filter((b) => b.account.kind === "zar");
  const usdAccounts = balances.filter((b) => b.account.kind === "usd");

  return (
    <div>
      <div className="mt-2 flex items-center justify-between px-1">
        <h1 className="text-lg font-extrabold sm:text-xl">Accounts</h1>
        <Button onClick={() => setAddOpen(true)} className="!px-3 sm:!px-4">
          <Plus size={18} /> Account
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4">
        <Card>
          <div className="text-xs muted">Total savings (R)</div>
          <div className="mt-1 text-xl font-extrabold">
            <Money value={total} />
          </div>
        </Card>
        <Card>
          <div className="text-xs muted">Owed to you</div>
          <div className="mt-1 text-xl font-extrabold">
            <Money value={owed} />
          </div>
        </Card>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8">
        <div>
          {/* exchange rate */}
          <SectionTitle>Exchange rate</SectionTitle>
          <Card className="flex items-center justify-between">
            <span className="text-sm">USD → ZAR</span>
            <NumberInput
              value={data.settings.usdRate}
              onCommit={(v) => mutate(setSettings({ usdRate: v }))}
              prefix="R"
              suffix="/ $"
              min={0}
              step={0.01}
              inputClassName="!w-24"
              ariaLabel="USD to ZAR rate"
            />
          </Card>
          {num(data.settings.usdRate) <= 0 && usdAccounts.length > 0 ? (
            <div className="mt-2">
              <Notice tone="warn">Set a rate above zero or your dollar balances count as R0.</Notice>
            </div>
          ) : null}

          {/* rand accounts */}
          <SectionTitle>Rand accounts</SectionTitle>
          {zar.length === 0 ? (
            <Card className="text-center text-sm muted">
              No rand accounts yet — add one to start tracking savings.
            </Card>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {zar.map((b) => (
                <Card key={b.account.id} className="!p-3">
                  <div className="flex items-center justify-between gap-2">
                    <TextInput
                      value={b.account.name}
                      onCommit={(v) => mutate(updateAccount(b.account.id, { name: v }))}
                      className="min-w-0 flex-1 !border-transparent !bg-transparent !px-0 !text-[13px] font-semibold"
                      ariaLabel={`Rename ${b.account.name}`}
                    />
                    <Money value={b.balance} className="shrink-0 text-[15px] font-bold tabular-nums" />
                    <ConfirmDelete
                      title={`Delete ${b.account.name}`}
                      size={15}
                      onConfirm={() => mutate(deleteAccount(b.account.id))}
                    />
                  </div>

                  {b.goalProgress !== null ? (
                    <div className="mt-2">
                      <ProgressBar value={b.balance} max={num(b.account.goal)} />
                      <div className="mt-1 text-xs muted">
                        {Math.round(b.goalProgress * 100)}% of <Money value={num(b.account.goal)} /> goal
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center justify-between text-xs muted">
                    <span>Opening balance</span>
                    <NumberInput
                      value={b.account.opening}
                      onCommit={(v) => mutate(updateAccount(b.account.id, { opening: v }))}
                      prefix="R"
                      inputClassName="!w-28 !py-1 text-xs"
                      ariaLabel={`${b.account.name} opening balance`}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs muted">
                    <span>Savings goal</span>
                    <NumberInput
                      value={b.account.goal ?? 0}
                      onCommit={(v) => mutate(updateAccount(b.account.id, { goal: v }))}
                      prefix="R"
                      min={0}
                      inputClassName="!w-28 !py-1 text-xs"
                      ariaLabel={`${b.account.name} goal`}
                    />
                  </div>
                  <div className="mt-1 text-xs muted">
                    Movement this year: <Money value={b.movement} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          {/* USD accounts */}
          <SectionTitle>
            {usdAccounts.length > 1 ? "USD accounts (in dollars)" : "USD account (in dollars)"}
          </SectionTitle>
          {usdAccounts.length === 0 ? (
            <Card className="text-center text-sm muted">No dollar account yet.</Card>
          ) : (
            <div className="space-y-2">
              {usdAccounts.map((b) => {
                const entries = usdEntriesFor(data, b.account.id)
                  .slice()
                  .sort((x, y) => (x.date < y.date ? 1 : -1));
                return (
                  <Card key={b.account.id}>
                    <div className="flex items-center justify-between gap-2">
                      <TextInput
                        value={b.account.name}
                        onCommit={(v) => mutate(updateAccount(b.account.id, { name: v }))}
                        className="min-w-0 flex-1 !border-transparent !bg-transparent !px-0 !text-[13px] font-semibold"
                        ariaLabel={`Rename ${b.account.name}`}
                      />
                      <div className="shrink-0 text-right">
                        <Money value={b.balance} currency="$" className="text-[15px] font-bold tabular-nums" />
                        <div className="text-xs muted">
                          ≈ <Money value={b.balanceRand} />
                        </div>
                      </div>
                      <ConfirmDelete
                        title={`Delete ${b.account.name}`}
                        size={15}
                        onConfirm={() => mutate(deleteAccount(b.account.id))}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs muted">
                      <span>Opening balance ($)</span>
                      <NumberInput
                        value={b.account.opening}
                        onCommit={(v) => mutate(updateAccount(b.account.id, { opening: v }))}
                        prefix="$"
                        inputClassName="!w-24 !py-1 text-xs"
                        ariaLabel={`${b.account.name} opening balance`}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs muted">
                        {entries.length} movement{entries.length === 1 ? "" : "s"}
                      </span>
                      <button
                        onClick={() => setUsdOpen(b.account.id)}
                        className="flex items-center gap-1 text-[13px] font-semibold text-brand-500"
                      >
                        <Plus size={15} /> Movement
                      </button>
                    </div>

                    {entries.length > 0 ? (
                      <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                        {entries.map((e) => (
                          <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate muted">
                              {e.date}
                              {e.description ? ` · ${e.description}` : ""}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {e.usdIn ? (
                                <span className="flex items-center gap-0.5 text-emerald-600">
                                  <ArrowDownRight size={13} /> <Money value={e.usdIn} currency="$" />
                                </span>
                              ) : null}
                              {e.usdOut ? (
                                <span className="flex items-center gap-0.5 text-rose-500">
                                  <ArrowUpRight size={13} /> <Money value={e.usdOut} currency="$" />
                                </span>
                              ) : null}
                              <ConfirmDelete
                                title="Delete movement"
                                size={13}
                                onConfirm={() => mutate(deleteUsdEntry(e.id))}
                              />
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
          {usdAccounts.length > 0 ? (
            <p className="mt-2 px-1 text-xs muted">
              Buying dollars: add a <b>Transfer</b> from the rand account to this one and enter the dollars
              received — both sides are recorded from that one entry. Use <b>Movement</b> only for dollars that
              arrive from outside your rand accounts.
            </p>
          ) : null}
          {usdAccounts.length > 0 ? (
            <p className="mt-1 px-1 text-xs muted">
              Combined dollar position: <Money value={usd.usd} currency="$" />
            </p>
          ) : null}

          {/* debtors */}
          <SectionTitle
            action={
              <button
                onClick={() => setDebtorOpen(true)}
                className="flex items-center gap-1 text-[13px] font-semibold text-brand-500"
              >
                <Plus size={16} /> Add
              </button>
            }
          >
            Debtors
          </SectionTitle>
          {data.debtors.length === 0 ? (
            <Card className="text-center text-sm muted">Nobody owes you right now.</Card>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {data.debtors.map((d) => {
                const out = num(d.lent) - num(d.repaid);
                const settled = out <= 0;
                return (
                  <Card key={d.id} className="!p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{d.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {settled ? (
                          <span className="chip bg-emerald-100 text-emerald-700">settled</span>
                        ) : null}
                        <Money value={out} className="text-sm font-bold" />
                      </span>
                    </div>
                    <div className="truncate text-xs muted">
                      {d.date}
                      {d.description ? ` · ${d.description}` : ""}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="flex shrink-0 items-center gap-1 muted">
                        Lent
                        <NumberInput
                          value={d.lent}
                          onCommit={(v) => mutate(updateDebtor(d.id, { lent: v }))}
                          prefix="R"
                          min={0}
                          inputClassName="!w-20 !py-1 text-xs"
                          ariaLabel={`Amount lent to ${d.name}`}
                        />
                      </span>
                      <span className="flex shrink-0 items-center gap-1 muted">
                        Repaid
                        <NumberInput
                          value={d.repaid}
                          onCommit={(v) => mutate(updateDebtor(d.id, { repaid: v }))}
                          prefix="R"
                          min={0}
                          inputClassName="!w-20 !py-1 text-xs"
                          ariaLabel={`Amount ${d.name} repaid`}
                        />
                      </span>
                      <ConfirmDelete
                        title={`Delete ${d.name}`}
                        size={15}
                        onConfirm={() => mutate(deleteDebtor(d.id))}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AddUsdSheet accountId={usdOpen} onClose={() => setUsdOpen(null)} />
      <AddDebtorSheet open={debtorOpen} onClose={() => setDebtorOpen(false)} />
      <AddAccountSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function AddUsdSheet({ accountId, onClose }: { accountId: string | null; onClose: () => void }) {
  const { data, mutate } = useData();
  const [date, setDate] = useState(todayISO());
  const [dir, setDir] = useState<"in" | "out">("in");
  const [amt, setAmt] = useState("");
  const [desc, setDesc] = useState("");

  const open = accountId !== null;
  useEffect(() => {
    if (!open) return;
    setDate(todayISO());
    setDir("in");
    setAmt("");
    setDesc("");
  }, [open]);

  const n = parseFloat(amt);
  const valid = Number.isFinite(n) && n > 0;
  const account = data?.accounts.find((a) => a.id === accountId);

  function save() {
    if (!valid || !accountId) return;
    mutate(
      addUsdEntry({
        date,
        description: desc.trim() || undefined,
        usdIn: dir === "in" ? n : 0,
        usdOut: dir === "out" ? n : 0,
        accountId,
      }),
    );
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={account ? `${account.name} — movement` : "USD movement"}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(["in", "out"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDir(d)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                dir === d ? "border-brand-500 bg-brand-50 text-brand-700" : "muted"
              }`}
              style={dir === d ? undefined : { borderColor: "var(--border)" }}
            >
              Dollars {d}
            </button>
          ))}
        </div>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Amount ($)">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Description">
          <input
            className="input"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Client payment"
          />
        </Field>
        <Button onClick={save} disabled={!valid} className="w-full">
          Save
        </Button>
      </div>
    </Sheet>
  );
}

function AddDebtorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mutate } = useData();
  const [date, setDate] = useState(todayISO());
  const [name, setName] = useState("");
  const [amt, setAmt] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!open) return;
    setDate(todayISO());
    setName("");
    setAmt("");
    setDesc("");
  }, [open]);

  const n = parseFloat(amt);
  const valid = Boolean(name.trim()) && Number.isFinite(n) && n > 0;

  function save() {
    if (!valid) return;
    mutate(addDebtor({ date, name: name.trim(), description: desc.trim() || undefined, lent: n, repaid: 0 }));
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add debtor">
      <div className="space-y-4">
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Who owes you" />
        </Field>
        <Field label="Amount lent (R)">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Description">
          <input
            className="input"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Short-term loan"
          />
        </Field>
        <Button onClick={save} disabled={!valid} className="w-full">
          Save
        </Button>
      </div>
    </Sheet>
  );
}

function AddAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, mutate } = useData();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"zar" | "usd">("zar");
  const [opening, setOpening] = useState("");
  const [goal, setGoal] = useState("");
  const [bucket, setBucket] = useState("");

  useEffect(() => {
    if (!open || !data) return;
    setName("");
    setKind("zar");
    setOpening("");
    setGoal("");
    setBucket(
      data.settings.buckets.find((b) => /saving/i.test(b.name))?.name ??
        data.settings.buckets[0]?.name ??
        "",
    );
  }, [open, data]);

  if (!data) return null;
  const valid = Boolean(name.trim());

  function save() {
    if (!valid) return;
    mutate(
      addAccount(
        {
          name: name.trim(),
          kind,
          opening: num(opening),
          goal: num(goal) > 0 ? num(goal) : undefined,
          order: data!.accounts.length,
        },
        bucket,
      ),
    );
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="New savings account">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(["zar", "usd"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                kind === k ? "border-brand-500 bg-brand-50 text-brand-700" : "muted"
              }`}
              style={kind === k ? undefined : { borderColor: "var(--border)" }}
            >
              {k === "zar" ? "Rand (R)" : "Dollars ($)"}
            </button>
          ))}
        </div>

        <Field label="Account name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency fund"
          />
        </Field>

        <Field label={`Opening balance (${kind === "usd" ? "$" : "R"})`}>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0.00"
          />
        </Field>

        <Field label={`Savings goal (${kind === "usd" ? "$" : "R"})`} hint="Optional — shows a progress bar.">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="optional"
          />
        </Field>

        {kind === "zar" ? (
          <Field label="Saves out of which bucket?" hint="A matching category is created so you can deposit into it.">
            <Select
              value={bucket}
              onChange={setBucket}
              options={data.settings.buckets.map((b) => ({ value: b.name, label: b.name }))}
              className="!py-2.5"
              ariaLabel="Bucket for the new account"
            />
          </Field>
        ) : (
          <Notice tone="info">
            Dollar accounts are funded with a <b>Transfer</b> from a rand account, or a manual movement.
          </Notice>
        )}

        <Button onClick={save} disabled={!valid} className="w-full">
          Add account
        </Button>
      </div>
    </Sheet>
  );
}
