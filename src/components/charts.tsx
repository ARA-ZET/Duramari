"use client";

import React from "react";
import { num, randFmt } from "@/lib/budget";

/**
 * Hand-rolled SVG charts. No charting library: these four forms are simple
 * enough that a dependency would cost more bundle than it saves, and drawing
 * them here means they inherit the app's theme tokens directly.
 *
 * All of them are drawn on a 720-wide viewBox and scaled by CSS, so keep the
 * containing column near that width or the labels scale with it.
 */

export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

/** Categorical hues are assigned in fixed order and never cycled. */
export function seriesColor(i: number): string {
  return SERIES[i] ?? "var(--muted)";
}

/** R42.3k / R950 — short enough for an axis. */
export function compactRand(v: number): string {
  const n = num(v);
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const k = n / 1000;
    return `R${Math.abs(k) >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return `R${Math.round(n)}`;
}

/** A "nice" axis maximum, so gridlines land on round numbers. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const step of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (v <= mag * step) return mag * step;
  }
  return mag * 10;
}

function Empty({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm muted">{message}</p>;
}

// ------------------------------------------------------------------
// 1. Savings trajectory — one series over time
// ------------------------------------------------------------------

export function TrajectoryChart({
  points,
}: {
  /** `range` is the period's real dates, shown in the tooltip when the short
   *  label alone would be read as a calendar month. */
  points: { label: string; value: number; range?: string }[];
}) {
  if (points.length < 2) return <Empty message="Two months of history will draw this chart." />;

  const W = 720, H = 262, L = 56, R = 700, TOP = 20, BOT = 210;
  const max = niceMax(Math.max(...points.map((p) => p.value), 1));
  const x = (i: number) => L + ((R - L) * i) / (points.length - 1);
  const y = (v: number) => BOT - (Math.max(0, num(v)) / max) * (BOT - TOP);

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `M${line.split(" ").join(" L")} L${R},${BOT} L${L},${BOT} Z`;

  const last = points[points.length - 1];
  const lowIdx = points.reduce((lo, p, i) => (p.value < points[lo].value ? i : lo), 0);
  const showLow = lowIdx > 0 && lowIdx < points.length - 1;
  // only label every nth month once they get tight
  const stride = Math.ceil(points.length / 12);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
      aria-label={`Total savings from ${points[0].label} to ${last.label}, ending at ${randFmt(last.value)}.`}>
      <g stroke="var(--grid)" strokeWidth="1">
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={L} x2={R} y1={BOT - f * (BOT - TOP)} y2={BOT - f * (BOT - TOP)} />
        ))}
      </g>
      <g className="c-tick" textAnchor="end">
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={L - 10} y={BOT - f * (BOT - TOP) + 4}>{compactRand(max * f)}</text>
        ))}
      </g>

      <path d={area} fill="var(--s1)" fillOpacity="0.12" />
      <polyline points={line} fill="none" stroke="var(--s1)" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />

      {showLow && (
        <g>
          <circle cx={x(lowIdx)} cy={y(points[lowIdx].value)} r="4.5"
            fill="var(--card)" stroke="var(--over)" strokeWidth="2" />
          <text className="c-val-sm" x={x(lowIdx)} y={y(points[lowIdx].value) + 18}
            textAnchor="middle" style={{ fill: "var(--over)" }}>{compactRand(points[lowIdx].value)}</text>
        </g>
      )}

      <circle cx={x(points.length - 1)} cy={y(last.value)} r="5"
        fill="var(--s1)" stroke="var(--card)" strokeWidth="2" />
      <text className="c-val" x={R} y={Math.max(y(last.value) - 12, 14)} textAnchor="end">
        {randFmt(last.value)}
      </text>

      <g className="c-tick" textAnchor="middle">
        {points.map((p, i) =>
          i % stride === 0 || i === points.length - 1 ? (
            <text key={p.label + i} x={x(i)} y={BOT + 24}>{p.label}</text>
          ) : null,
        )}
      </g>

      {points.map((p, i) => (
        <rect key={`hit-${i}`} x={x(i) - 12} y={TOP} width="24" height={BOT - TOP} fill="transparent">
          <title>{`${p.range ? `${p.label} (${p.range})` : p.label}: ${randFmt(p.value)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------
// 2. Budget vs actual — bullet rows
// ------------------------------------------------------------------

export function BulletChart({
  rows,
}: {
  rows: { name: string; actual: number; allocated: number }[];
}) {
  if (!rows.length) return <Empty message="Add some budgets to compare against." />;

  const W = 700, ROW = 54, BAR = 16;
  const H = rows.length * ROW + 14;
  const max = Math.max(...rows.map((r) => Math.max(num(r.actual), num(r.allocated))), 1);
  const w = (v: number) => (Math.max(0, num(v)) / max) * W;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
      aria-label="Actual spend against each budget's share.">
      {rows.map((r, i) => {
        const top = 20 + i * ROW;
        const a = w(r.allocated);
        const act = w(r.actual);
        const over = num(r.actual) > num(r.allocated);
        const overW = Math.max(0, act - a - 2);
        const diff = num(r.actual) - num(r.allocated);
        // width of the blue (filled) portion, which is where white text is legible
        const fill = over ? a : act;
        return (
          <g key={r.name}>
            <text className="c-row" x="0" y={top + 11}>{r.name}</text>
            <text className="c-val" x={W} y={top + 11} textAnchor="end"
              style={{ fill: over ? "var(--over)" : "var(--ink)" }}>{randFmt(r.actual)}</text>

            <rect x="0" y={top + 20} width={W} height={BAR} rx="4" fill="var(--track)" />
            <rect x="0" y={top + 20} width={over ? a : act} height={BAR} rx="4" fill="var(--s1)" />
            {over && overW > 0 && (
              <rect x={a + 2} y={top + 20} width={overW} height={BAR} rx="4" fill="var(--over)" />
            )}
            {/* allocation marker */}
            <rect x={Math.max(0, a - 1)} y={top + 16} width="2" height={BAR + 8} fill="var(--ink)" />

            {/* The variance label only goes inside when there is enough *filled*
                bar to sit on — white text on the empty track is unreadable. */}
            {Math.abs(diff) >= 1 &&
              (fill > 150 ? (
                <text className="c-val-sm" x={fill - 10} y={top + 32} textAnchor="end"
                  style={{ fill: "#ffffff" }}>
                  {over ? `+${randFmt(diff)} over` : `${randFmt(-diff)} left`}
                </text>
              ) : (
                <text className="c-val-sm" x={Math.max(act, a) + 10} y={top + 32}
                  style={{ fill: over ? "var(--over)" : "var(--muted)" }}>
                  {over ? `+${randFmt(diff)} over` : `${randFmt(-diff)} left`}
                </text>
              ))}
            <rect x="0" y={top + 20} width={W} height={BAR} fill="transparent">
              <title>{`${r.name}: ${randFmt(r.actual)} spent of ${randFmt(r.allocated)} allocated`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------
// 3. Composition over time — stacked bars
// ------------------------------------------------------------------

export function StackedChart({
  months,
  series,
}: {
  months: { label: string; values: number[]; range?: string }[];
  series: string[];
}) {
  if (!months.length || !series.length) return <Empty message="Nothing spent yet." />;

  const W = 720, H = 268, L = 56, R = 700, TOP = 32, BOT = 212;
  const totals = months.map((m) => m.values.reduce((s, v) => s + Math.max(0, num(v)), 0));
  const max = niceMax(Math.max(...totals, 1));
  const slot = (R - L) / months.length;
  const bw = Math.min(62, slot * 0.62);
  const px = (v: number) => (Math.max(0, num(v)) / max) * (BOT - TOP);
  const cx = (i: number) => L + slot * i + slot / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
      aria-label="Spending split by budget, one bar per period.">
      <g stroke="var(--grid)" strokeWidth="1">
        {ticks.map((f) => (
          <line key={f} x1={L} x2={R} y1={BOT - f * (BOT - TOP)} y2={BOT - f * (BOT - TOP)} />
        ))}
      </g>
      <g className="c-tick" textAnchor="end">
        {ticks.map((f) => (
          <text key={f} x={L - 10} y={BOT - f * (BOT - TOP) + 4}>{compactRand(max * f)}</text>
        ))}
      </g>

      {months.map((m, i) => {
        let cursor = BOT;
        const segs = m.values.map((v, si) => {
          const h = px(v);
          if (h <= 0) return null;
          const y = cursor - h;
          cursor = y - 2; // 2px surface gap between stacked fills
          return (
            <rect key={si} x={cx(i) - bw / 2} y={y} width={bw} height={h} rx="3"
              fill={seriesColor(si)}>
              <title>{`${m.range ? `${m.label} (${m.range})` : m.label} · ${series[si]}: ${randFmt(v)}`}</title>
            </rect>
          );
        });
        return (
          <g key={m.label + i}>
            {segs}
            {totals[i] > 0 && (
              <text className="c-val-sm" x={cx(i)} y={Math.max(cursor - 4, 12)} textAnchor="middle">
                {compactRand(totals[i])}
              </text>
            )}
            <text className="c-tick" x={cx(i)} y={BOT + 22} textAnchor="middle">{m.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------
// 4. Savings rate — signed bars around a zero baseline
// ------------------------------------------------------------------

export function RateChart({
  points,
  target,
}: {
  points: { label: string; value: number; range?: string }[];
  target?: number;
}) {
  if (!points.length) return <Empty message="No income recorded yet." />;

  const W = 720, H = 214, L = 56, R = 700;
  const TOP = 28, BOT = 178, PLOT = BOT - TOP;
  const vals = points.map((p) => num(p.value) * 100);
  const pos = vals.filter((v) => v > 0);
  const neg = vals.filter((v) => v < 0).map(Math.abs);

  // Split the height by what the data actually needs. Reserving half of it for
  // negatives that never occur squashes every bar into a thin top strip.
  const posSpan = niceMax(Math.max(...pos, (target ?? 0) * 100, 5));
  const negSpan = neg.length ? niceMax(Math.max(...neg)) : 0;
  const total = posSpan + negSpan;
  const ZERO = TOP + (PLOT * posSpan) / total;
  const y = (pct: number) => ZERO - (pct / total) * PLOT;

  const slot = (R - L) / points.length;
  const bw = Math.min(32, slot * 0.6);
  const cx = (i: number) => L + slot * i + slot / 2;
  const stride = Math.ceil(points.length / 12);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
      aria-label="Share of income saved each month.">
      {target ? (
        <>
          <line x1={L} x2={R} y1={y(target * 100)} y2={y(target * 100)}
            stroke="var(--s3)" strokeWidth="1.5" strokeDasharray="4 4" />
          <text className="c-tick" x={R} y={y(target * 100) - 6} textAnchor="end"
            style={{ fill: "var(--s3)" }}>
            {Math.round(target * 100)}% target
          </text>
        </>
      ) : null}

      <g className="c-tick" textAnchor="end">
        <text x={L - 10} y={TOP + 4}>+{Math.round(posSpan)}%</text>
        <text x={L - 10} y={ZERO + 4}>0%</text>
        {negSpan > 0 ? <text x={L - 10} y={BOT + 4}>−{Math.round(negSpan)}%</text> : null}
      </g>

      {points.map((p, i) => {
        const v = num(p.value) * 100;
        const h = Math.abs((v / total) * PLOT);
        const top = v >= 0 ? ZERO - h : ZERO;
        return (
          <g key={p.label + i}>
            <rect x={cx(i) - bw / 2} y={top} width={bw} height={Math.max(h, 1)} rx="3"
              fill={v >= 0 ? "var(--s1)" : "var(--over)"}>
              <title>{`${p.range ? `${p.label} (${p.range})` : p.label}: ${v.toFixed(1)}% of income saved`}</title>
            </rect>
            {i % stride === 0 || i === points.length - 1 ? (
              <text className="c-tick" x={cx(i)} y={H - 6} textAnchor="middle">{p.label}</text>
            ) : null}
          </g>
        );
      })}

      <line x1={L} x2={R} y1={ZERO} y2={ZERO} stroke="var(--ink)" strokeWidth="1" />
    </svg>
  );
}

// ------------------------------------------------------------------

export function Legend({
  items,
}: {
  items: { name: string; color: string; value?: React.ReactNode }[];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3" style={{ borderColor: "var(--border)" }}>
      {items.map((it) => (
        <span key={it.name} className="flex min-w-[150px] flex-1 items-baseline gap-2 text-xs muted">
          <span className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-sm"
            style={{ background: it.color }} />
          <span className="flex-1 truncate">{it.name}</span>
          {it.value != null ? <span className="font-semibold" style={{ color: "var(--ink)" }}>{it.value}</span> : null}
        </span>
      ))}
    </div>
  );
}
