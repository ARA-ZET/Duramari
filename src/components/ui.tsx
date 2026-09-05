"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { num, randFmt, usdFmt } from "@/lib/budget";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx("card", className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-4 flex items-center justify-between px-0.5">
      <h2 className="text-[11px] font-bold uppercase tracking-wider muted">{children}</h2>
      {action}
    </div>
  );
}

export function Money({
  value,
  currency = "R",
  decimals,
  className,
}: {
  value: number;
  currency?: "R" | "$";
  decimals?: number;
  className?: string;
}) {
  const neg = value < 0;
  const text =
    currency === "$"
      ? usdFmt(value, decimals ?? 2)
      : randFmt(value, decimals ?? 0);
  return (
    <span className={clsx(neg && "text-rose-500", className)}>{text}</span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "brand",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "brand" | "green" | "amber" | "slate";
}) {
  const tones: Record<string, string> = {
    brand: "from-brand-500 to-brand-700",
    // teal, not green — the brand itself is green now, and two green tiles
    // side by side on the dashboard stopped reading as separate figures
    green: "from-teal-500 to-teal-700",
    amber: "from-amber-500 to-orange-600",
    slate: "from-slate-600 to-slate-800",
  };
  return (
    <div className={clsx("rounded-xl2 bg-gradient-to-br p-3 text-white shadow-card", tones[tone])}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold leading-tight sm:text-xl">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] leading-tight opacity-80">{sub}</div> : null}
    </div>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button className={clsx(variant === "primary" ? "btn-primary" : "btn-ghost", className)} {...props} />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs muted">{hint}</span> : null}
    </label>
  );
}

/** Bottom sheet on phones; a centred dialog from `sm` up. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // stop the page behind the sheet from scrolling with it
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative z-10 max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl sm:max-w-lg sm:rounded-3xl safe-bottom"
        style={{ background: "var(--card)" }}
      >
        <div className="sticky top-0 flex items-center justify-between border-b px-5 py-4"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="text-sm font-semibold muted">
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const v = num(value);
  const m = num(max);
  const pct = m > 0 ? Math.max(0, Math.min(100, (v / m) * 100)) : 0;
  // Only "over budget" when there was a budget to exceed.
  const over = m > 0 && v > m;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
      <div
        className={clsx("h-full rounded-full", over ? "bg-rose-500" : "bg-brand-500")}
        style={{ width: `${over ? 100 : pct}%` }}
      />
    </div>
  );
}

/**
 * A number field that commits on blur or Enter.
 *
 * It tracks `value` while unfocused, so reusing the same field for a different
 * row (switching months, say) shows the new number instead of committing the
 * previous row's stale draft back over it.
 */
export function NumberInput({
  value,
  onCommit,
  prefix,
  suffix,
  className,
  inputClassName,
  min,
  step,
  ariaLabel,
}: {
  value: number;
  onCommit: (v: number) => void;
  prefix?: string;
  suffix?: string;
  className?: string;
  inputClassName?: string;
  min?: number;
  step?: number;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(() => String(value ?? 0));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value ?? 0));
  }, [value]);

  function commit() {
    focused.current = false;
    const trimmed = draft.trim();
    if (trimmed === "") {
      setDraft(String(value ?? 0));
      return;
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n)) {
      setDraft(String(value ?? 0));
      return;
    }
    const clamped = min !== undefined ? Math.max(min, n) : n;
    setDraft(String(clamped));
    if (clamped !== num(value)) onCommit(clamped);
  }

  return (
    <div className={clsx("flex items-center gap-1", className)}>
      {prefix ? <span className="text-sm muted">{prefix}</span> : null}
      <input
        className={clsx("input !py-1.5 text-right", inputClassName)}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        aria-label={ariaLabel}
        value={draft}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(String(value ?? 0));
            focused.current = false;
            e.currentTarget.blur();
          }
        }}
      />
      {suffix ? <span className="text-sm muted">{suffix}</span> : null}
    </div>
  );
}

/** Text field with the same commit-on-blur behaviour, for renames. */
export function TextInput({
  value,
  onCommit,
  className,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  function commit() {
    focused.current = false;
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(value);
      return;
    }
    if (trimmed !== value) onCommit(trimmed);
  }

  return (
    <input
      className={clsx("input !py-1.5 text-sm", className)}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          focused.current = false;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** A delete control that asks for a second tap instead of firing straight away. */
export function ConfirmDelete({
  onConfirm,
  label = "Delete",
  title,
  size = 16,
  className,
}: {
  onConfirm: () => void;
  label?: string;
  title?: string;
  size?: number;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (armed) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            setArmed(false);
            onConfirm();
          }}
          className="rounded-lg bg-rose-500 px-2 py-1 text-xs font-bold text-white"
        >
          {label}?
        </button>
        <button
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            setArmed(false);
          }}
          className="text-xs font-semibold muted"
        >
          No
        </button>
      </span>
    );
  }
  return (
    <button
      title={title ?? label}
      aria-label={title ?? label}
      onClick={() => {
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 4000);
      }}
      className={clsx("shrink-0 text-slate-400 transition hover:text-rose-500", className)}
    >
      <TrashIcon size={size} />
    </button>
  );
}

function TrashIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Inline warning/error strip used for data-integrity notices. */
export function Notice({
  tone = "warn",
  children,
  onDismiss,
}: {
  tone?: "warn" | "error" | "info";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const tones = {
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-rose-300 bg-rose-50 text-rose-900",
    info: "border-brand-200 bg-brand-50 text-brand-900",
  } as const;
  return (
    <div className={clsx("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs", tones[tone])}>
      <div className="flex-1">{children}</div>
      {onDismiss ? (
        <button onClick={onDismiss} className="shrink-0 font-bold opacity-60 hover:opacity-100">
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Labelled select that stays in sync with its value (no defaultValue drift). */
export function Select({
  value,
  onChange,
  options,
  className,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      className={clsx("input !py-1.5 text-sm", className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
