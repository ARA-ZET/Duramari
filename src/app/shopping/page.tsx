"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "@/components/providers";
import {
  Card,
  Money,
  SectionTitle,
  Button,
  Field,
  Sheet,
  NumberInput,
  ConfirmDelete,
  Notice,
  Select,
  ProgressBar,
} from "@/components/ui";
import { categoryPlan, computeYear, monthKeys, monthLabel, randFmt, summaryFor } from "@/lib/budget";
import {
  currentPeriodKey,
  defaultDateForPeriod,
  isCalendarCycle,
  periodNoun,
  periodRangeLabel,
} from "@/lib/period";
import { DEFAULT_SIZE, GROCERY_CATALOG, SIZE_OPTIONS, type CatalogItem } from "@/lib/groceryCatalog";
import {
  addStaple,
  addStaplesToList,
  deleteStaple,
  saveItemAsStaple,
  toggleStapleLow,
  updateStaple,
  addGroceryItem,
  clearGroceryList,
  copyGroceryList,
  deleteGroceryItem,
  groceryList,
  groceryTotals,
  logGroceryShop,
  setGroceryCategory,
  toggleGroceryItem,
  updateGroceryItem,
} from "@/lib/mutations";
import { Plus, Check, Copy, ShoppingCart, Undo2, Search, X, Star, AlertCircle, ListPlus } from "lucide-react";

export default function ShoppingPage() {
  const { data, mutate } = useData();
  const [key, setKey] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [shopMode, setShopMode] = useState(false);
  const [stapleOpen, setStapleOpen] = useState(false);

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
    const list = groceryList(data, key);
    const totals = groceryTotals(list);
    const summary = summaryFor(computeYear(data), key);
    const bucket = data.settings.categories.find((c) => c.name === list.category)?.bucket ?? "";
    const bucketRow = summary?.buckets.find((b) => b.bucket === bucket);
    const keys = monthKeys(data.settings.budgetYear);
    const prevKey = keys[keys.indexOf(key) - 1];
    const prevHasItems = prevKey ? (data.groceries?.[prevKey]?.items.length ?? 0) > 0 : false;
    // The limit set for the category this shop is booked to, and what has
    // already gone out on it this period — including shops already logged.
    const planRow = categoryPlan(data, key).find((c) => c.name === list.category);
    const staples = data.staples ?? [];
    const onList = new Set(list.items.map((i) => i.name.toLowerCase()));
    return {
      list, totals, bucket, bucketRow, keys, prevKey, prevHasItems, planRow, staples, onList,
      lowCount: staples.filter((s) => s.low && !onList.has(s.name.toLowerCase())).length,
      missingCount: staples.filter((s) => !onList.has(s.name.toLowerCase())).length,
    };
  }, [data, key]);

  if (!data || !model) return null;
  const { list, totals, bucket, bucketRow, keys, prevKey, prevHasItems, planRow, staples, onList } = model;
  const noun = periodNoun(data.settings.payDay);

  const sorted = [...list.items].sort((a, b) => Number(a.bought) - Number(b.bought));
  const catOptions = data.settings.categories.map((c) => ({ value: c.name, label: c.name }));
  // what is left in the bucket once this trolley is paid for
  const leftAfter = bucketRow ? bucketRow.balance - totals.spent : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-lg font-extrabold sm:text-xl">Shopping list</h1>
          <p className="text-sm muted">
            {monthLabel(key)}
            {!isCalendarCycle(data.settings.payDay)
              ? ` · ${periodRangeLabel(key, data.settings.payDay)}`
              : ""}
          </p>
        </div>
        <button
          onClick={() => setShopMode((v) => !v)}
          className={clsx(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition",
            shopMode ? "bg-brand-500 text-white" : "muted",
          )}
          style={shopMode ? undefined : { background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <ShoppingCart size={16} />
          {shopMode ? "Shopping" : "Start shopping"}
        </button>
      </div>

      {/* period picker */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-x-visible">
        {keys.map((k) => {
          const n = data.groceries?.[k]?.items.length ?? 0;
          return (
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
              {n > 0 ? <span className="ml-1 opacity-70">{n}</span> : null}
            </button>
          );
        })}
      </div>

      {/* trolley summary — the numbers you want while standing in the aisle */}
      <Card className="mt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs muted">In the trolley</div>
            <div className="text-xl font-extrabold leading-tight">
              <Money value={totals.spent} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs muted">Still to get</div>
            <div className="text-lg font-bold">
              <Money value={totals.remaining} />
            </div>
          </div>
        </div>

        <div className="mt-3">
          <ProgressBar value={totals.bought} max={totals.total || 1} />
          <div className="mt-1.5 flex justify-between text-xs muted">
            <span>
              {totals.bought} of {totals.total} item{totals.total === 1 ? "" : "s"}
            </span>
            <span>planned {randFmt(totals.planned)}</span>
          </div>
        </div>

        {/* This shop's own budget: the limit set for the category it books to.
            The bucket balance below is the wider pot it comes out of. */}
        {planRow && planRow.limit > 0 ? (
          <div className="mt-3 border-t pt-2.5" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="muted">
                {list.category} budget this {noun}
              </span>
              <span className="font-semibold tabular-nums">
                <Money value={planRow.spent + totals.spent} /> of <Money value={planRow.limit} />
              </span>
            </div>
            <div className="mt-1.5">
              <ProgressBar value={planRow.spent + totals.spent} max={planRow.limit} />
            </div>
            <p className="mt-1 text-[11px] muted">
              {planRow.limit - planRow.spent - totals.spent < 0 ? (
                <span className="font-semibold text-rose-500">
                  <Money value={Math.abs(planRow.limit - planRow.spent - totals.spent)} /> over the
                  budget
                </span>
              ) : (
                <>
                  <Money value={planRow.limit - planRow.spent - totals.spent} /> left after this
                  trolley
                </>
              )}
              {planRow.spent > 0 ? (
                <> · <Money value={planRow.spent} /> already spent this {noun}</>
              ) : null}
            </p>
          </div>
        ) : null}

        {bucketRow ? (
          <div
            className="mt-3 flex items-center justify-between border-t pt-2.5 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="muted">
              {bucket} has <Money value={bucketRow.balance} className="font-semibold" /> left
            </span>
            {leftAfter !== null ? (
              <span className={clsx("font-semibold", leftAfter < 0 ? "text-rose-500" : "text-emerald-600")}>
                {leftAfter < 0 ? "over by " : "leaves "}
                <Money value={Math.abs(leftAfter)} />
              </span>
            ) : null}
          </div>
        ) : null}
        {planRow && planRow.limit <= 0 ? (
          <p className="mt-2 text-[11px] muted">
            No budget set for {list.category} —{" "}
            <a href="/budget" className="font-semibold text-brand-500">
              set one on the Budget page
            </a>{" "}
            to track this shop against it.
          </p>
        ) : null}
      </Card>

      {leftAfter !== null && leftAfter < 0 ? (
        <div className="mt-3">
          <Notice tone="warn">
            This trolley puts {bucket} <Money value={Math.abs(leftAfter)} /> over what it has left for{" "}
            {monthLabel(key)}.
          </Notice>
        </div>
      ) : null}

      {/* Staples: the master copy. Never ticked off — it is copied onto a
          period's list, so next month never starts from a blank page. */}
      <SectionTitle
        action={
          <button
            onClick={() => setStapleOpen(true)}
            className="flex items-center gap-1 text-[13px] font-semibold text-brand-500"
          >
            <Plus size={16} /> Add staple
          </button>
        }
      >
        Things I always buy ({staples.length})
      </SectionTitle>

      {staples.length === 0 ? (
        <Card className="text-center text-sm muted">
          <p>
            The things you re-buy every {noun} live here — milk, bread, washing powder. Add them
            once and pull them onto any list with one tap.
          </p>
          <Button onClick={() => setStapleOpen(true)} variant="ghost" className="mx-auto mt-3">
            <Plus size={16} /> Add the first one
          </Button>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {staples.map((st) => {
              const already = onList.has(st.name.toLowerCase());
              return (
                <div
                  key={st.id}
                  className="flex items-center gap-2 px-3 py-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  <button
                    onClick={() => mutate(toggleStapleLow(st.id))}
                    aria-pressed={Boolean(st.low)}
                    aria-label={st.low ? `${st.name} is no longer running low` : `Mark ${st.name} as running low`}
                    title={st.low ? "Running low — tap to clear" : "Mark as running low"}
                    className={clsx(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 transition",
                      st.low ? "border-amber-500 bg-amber-50 text-amber-600" : "muted",
                    )}
                    style={st.low ? undefined : { borderColor: "var(--border)" }}
                  >
                    <AlertCircle size={16} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">
                      {st.name}
                      {st.low ? (
                        <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                          low
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs muted">
                      {st.qty ? `${st.qty} · ` : ""}usually {randFmt(st.estimate)}
                    </div>
                  </div>

                  <NumberInput
                    value={st.estimate}
                    onCommit={(v) => mutate(updateStaple(st.id, { estimate: v }))}
                    prefix="R"
                    min={0}
                    inputClassName="!w-24 !py-1.5 text-sm"
                    ariaLabel={`Usual price for ${st.name}`}
                  />

                  <button
                    onClick={() => mutate(addStaplesToList(key, { ids: [st.id] }))}
                    disabled={already}
                    aria-label={`Add ${st.name} to this list`}
                    title={already ? "Already on this list" : "Add to this list"}
                    className={clsx(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition",
                      already ? "muted opacity-40" : "text-brand-500 hover:bg-brand-50",
                    )}
                  >
                    <ListPlus size={17} />
                  </button>

                  <ConfirmDelete
                    title={`Remove ${st.name} from your staples`}
                    size={16}
                    onConfirm={() => mutate(deleteStaple(st.id))}
                  />
                </div>
              );
            })}
          </div>

          {model.missingCount > 0 ? (
            <div
              className="flex flex-wrap gap-2 border-t px-3 py-2.5"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              {model.lowCount > 0 ? (
                <Button
                  onClick={() => mutate(addStaplesToList(key, { onlyLow: true }))}
                  className="!py-1.5 !text-[13px]"
                >
                  <ListPlus size={15} /> Add {model.lowCount} low item
                  {model.lowCount === 1 ? "" : "s"}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => mutate(addStaplesToList(key))}
                className="!py-1.5 !text-[13px]"
              >
                Add all {model.missingCount} to {monthLabel(key).slice(0, 3)}
              </Button>
            </div>
          ) : (
            <p
              className="border-t px-3 py-2.5 text-xs muted"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              Every staple is already on this list.
            </p>
          )}
        </Card>
      )}

      {/* the list */}
      <SectionTitle
        action={
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1 text-[13px] font-semibold text-brand-500"
          >
            <Plus size={16} /> Add item
          </button>
        }
      >
        Items ({totals.total})
      </SectionTitle>

      {list.items.length === 0 ? (
        <Card className="space-y-3 text-center text-sm muted">
          <p>Nothing on the list yet.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setAddOpen(true)} variant="ghost">
              <Plus size={16} /> Add the first item
            </Button>
            {prevHasItems && prevKey ? (
              <Button onClick={() => mutate(copyGroceryList(prevKey, key))} variant="ghost">
                <Copy size={16} /> Copy {monthLabel(prevKey).slice(0, 3)}&apos;s list
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => (
            <Card key={item.id} className={clsx("!p-2.5", item.bought && "opacity-60")}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => mutate(toggleGroceryItem(key, item.id))}
                  aria-label={item.bought ? `Un-tick ${item.name}` : `Tick off ${item.name}`}
                  aria-pressed={item.bought}
                  className={clsx(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 transition",
                    item.bought ? "border-brand-500 bg-brand-500 text-white" : "muted",
                  )}
                  style={item.bought ? undefined : { borderColor: "var(--border)" }}
                >
                  {item.bought ? <Check size={18} strokeWidth={3} /> : null}
                </button>

                <div className="min-w-0 flex-1">
                  <div
                    className={clsx(
                      "truncate text-[13px] font-semibold",
                      item.bought && "line-through",
                    )}
                  >
                    {item.name}
                  </div>
                  <div className="text-xs muted">
                    {item.qty ? `${item.qty} · ` : ""}
                    est. {randFmt(item.estimate)}
                  </div>
                </div>

                {item.bought ? (
                  <NumberInput
                    value={item.actual ?? item.estimate}
                    onCommit={(v) => mutate(updateGroceryItem(key, item.id, { actual: v }))}
                    prefix="R"
                    min={0}
                    inputClassName="!w-24 !py-1.5 text-sm"
                    ariaLabel={`What ${item.name} actually cost`}
                  />
                ) : (
                  <NumberInput
                    value={item.estimate}
                    onCommit={(v) => mutate(updateGroceryItem(key, item.id, { estimate: v }))}
                    prefix="R"
                    min={0}
                    inputClassName="!w-24 !py-1.5 text-sm"
                    ariaLabel={`Estimated price for ${item.name}`}
                  />
                )}

                {!shopMode ? (
                  <>
                    <button
                      onClick={() => mutate(saveItemAsStaple(key, item.id))}
                      disabled={staples.some(
                        (st) => st.name.toLowerCase() === item.name.toLowerCase(),
                      )}
                      aria-label={`Keep ${item.name} in your staples`}
                      title="Keep this in the things I always buy"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-brand-500 transition hover:bg-brand-50 disabled:opacity-30"
                    >
                      <Star size={16} />
                    </button>
                    <ConfirmDelete
                      title={`Remove ${item.name}`}
                      size={16}
                      onConfirm={() => mutate(deleteGroceryItem(key, item.id))}
                    />
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* book it to the budget */}
      {totals.spent > 0 ? (
        <>
          <SectionTitle>Log this shop</SectionTitle>
          <Card className="space-y-3">
            <Field label="Book it to" hint={bucket ? `Budget: ${bucket}` : undefined}>
              <Select
                value={list.category}
                onChange={(v) => mutate(setGroceryCategory(key, v))}
                options={catOptions}
                placeholder="Pick a category…"
                className="!py-2.5"
                ariaLabel="Category for this shop"
              />
            </Field>
            <Button
              onClick={() =>
                mutate(logGroceryShop(key, defaultDateForPeriod(key, data.settings.payDay)))
              }
              disabled={!list.category}
              className="w-full"
            >
              {list.loggedTxId ? "Update the logged amount" : "Log"} {randFmt(totals.spent)} to{" "}
              {list.category || "…"}
            </Button>
            {list.loggedTxId ? (
              <p className="text-xs muted">
                Already logged — this updates the same transaction rather than adding another.
              </p>
            ) : (
              <p className="text-xs muted">
                Adds one expense for what is in the trolley. You can re-log after adding more.
              </p>
            )}
          </Card>
        </>
      ) : null}

      {/* housekeeping */}
      {list.items.length > 0 ? (
        <>
          <SectionTitle>Tidy up</SectionTitle>
          <Card className="flex flex-wrap gap-2">
            {prevHasItems && prevKey ? (
              <Button variant="ghost" onClick={() => mutate(copyGroceryList(prevKey, key))} className="!py-2">
                <Copy size={15} /> Add {monthLabel(prevKey).slice(0, 3)}&apos;s items
              </Button>
            ) : null}
            {totals.bought > 0 ? (
              <Button
                variant="ghost"
                onClick={() => mutate(clearGroceryList(key, true))}
                className="!py-2"
              >
                <Undo2 size={15} /> Remove bought items
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-1.5 text-xs muted">
              Clear the whole list
              <ConfirmDelete
                label="Clear list"
                title="Clear the whole list"
                onConfirm={() => mutate(clearGroceryList(key))}
              />
            </div>
          </Card>
        </>
      ) : null}

      <AddGrocerySheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(item) => mutate(addGroceryItem(key, item))}
      />
      <AddGrocerySheet
        open={stapleOpen}
        onClose={() => setStapleOpen(false)}
        title="Add to your staples"
        onAdd={(item) => mutate(addStaple(item))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------

type AddMode = "catalog" | "custom";

function AddGrocerySheet({
  open,
  onClose,
  onAdd,
  title = "Add to the list",
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: { name: string; qty?: string; estimate: number }) => void;
  /** The staples list reuses this sheet, so it names itself. */
  title?: string;
}) {
  const [mode, setMode] = useState<AddMode>("catalog");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [size, setSize] = useState("");
  const [catalogEstimate, setCatalogEstimate] = useState("");

  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [estimate, setEstimate] = useState("");

  // Re-seed every time the sheet opens, so the next item starts from a clean slate.
  useEffect(() => {
    if (!open) return;
    setMode("catalog");
    setSearch("");
    setSelected(null);
    setSize("");
    setCatalogEstimate("");
    setName("");
    setQty("");
    setEstimate("");
  }, [open]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCategory = new Map<string, CatalogItem[]>();
    for (const item of GROCERY_CATALOG) {
      if (q && !item.name.toLowerCase().includes(q)) continue;
      const arr = byCategory.get(item.category);
      if (arr) arr.push(item);
      else byCategory.set(item.category, [item]);
    }
    return byCategory;
  }, [search]);

  function selectCatalogItem(item: CatalogItem) {
    setSelected(item);
    setSize(DEFAULT_SIZE[item.unit]);
    setCatalogEstimate("");
  }

  function addFromCatalog(keepOpen: boolean) {
    if (!selected) return;
    onAdd({ name: selected.name, qty: size || undefined, estimate: parseFloat(catalogEstimate) || 0 });
    setSelected(null);
    setSize("");
    setCatalogEstimate("");
    if (keepOpen) setSearch("");
    else onClose();
  }

  function addCustom(keepOpen: boolean) {
    if (!name.trim()) return;
    onAdd({ name, qty: qty || undefined, estimate: parseFloat(estimate) || 0 });
    setName("");
    setQty("");
    setEstimate("");
    if (!keepOpen) onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode("catalog")}
            className={clsx(
              "rounded-xl border px-3 py-2 text-sm font-semibold transition",
              mode === "catalog" ? "border-brand-500 bg-brand-50 text-brand-700" : "muted",
            )}
            style={mode === "catalog" ? undefined : { borderColor: "var(--border)" }}
          >
            Common items
          </button>
          <button
            onClick={() => setMode("custom")}
            className={clsx(
              "rounded-xl border px-3 py-2 text-sm font-semibold transition",
              mode === "custom" ? "border-brand-500 bg-brand-50 text-brand-700" : "muted",
            )}
            style={mode === "custom" ? undefined : { borderColor: "var(--border)" }}
          >
            Custom item
          </button>
        </div>

        {mode === "catalog" ? (
          selected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5 text-brand-700">
                <span className="text-sm font-semibold">{selected.name}</span>
                <button
                  onClick={() => setSelected(null)}
                  className="flex items-center gap-1 text-xs font-semibold"
                >
                  <X size={13} /> Change
                </button>
              </div>

              <Field label="Size">
                <Select
                  value={size}
                  onChange={setSize}
                  options={SIZE_OPTIONS[selected.unit].map((s) => ({ value: s, label: s }))}
                  className="!py-2.5"
                  ariaLabel={`Size for ${selected.name}`}
                />
              </Field>

              <Field label="Estimated price (R)">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  autoFocus
                  value={catalogEstimate}
                  onChange={(e) => setCatalogEstimate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addFromCatalog(true);
                  }}
                  placeholder="0.00"
                />
              </Field>

              <div className="flex gap-2">
                <Button onClick={() => addFromCatalog(true)} className="flex-1">
                  Add
                </Button>
                <Button variant="ghost" onClick={() => addFromCatalog(false)}>
                  Add &amp; close
                </Button>
              </div>
              <p className="text-xs muted">
                Adding keeps the sheet open so you can run down a list in one go.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" />
                <input
                  className="input pl-9"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search common items…"
                />
              </div>

              <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
                {[...grouped.entries()].map(([category, items]) => (
                  <div key={category}>
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide muted">
                      {category}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((item) => (
                        <button
                          key={item.name}
                          onClick={() => selectCatalogItem(item)}
                          className="rounded-full border px-3 py-1.5 text-sm font-medium transition hover:border-brand-500 hover:text-brand-600"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {grouped.size === 0 ? (
                  <p className="py-8 text-center text-sm muted">
                    No matches — try <b>Custom item</b> instead.
                  </p>
                ) : null}
              </div>
            </div>
          )
        ) : (
          <div className="space-y-4">
            <Field label="Item">
              <input
                className="input"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustom(true);
                }}
                placeholder="e.g. Peri-peri sauce"
              />
            </Field>
            <Field label="Quantity" hint="Optional — whatever makes sense to you.">
              <input
                className="input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 2 bottles"
              />
            </Field>
            <Field label="Estimated price (R)">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustom(true);
                }}
                placeholder="0.00"
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => addCustom(true)} disabled={!name.trim()} className="flex-1">
                Add
              </Button>
              <Button variant="ghost" onClick={() => addCustom(false)} disabled={!name.trim()}>
                Add &amp; close
              </Button>
            </div>
            <p className="text-xs muted">
              Adding keeps the sheet open so you can run down a list in one go.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
