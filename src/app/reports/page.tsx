"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "@/components/providers";
import { Card, Money, SectionTitle, Stat, Notice } from "@/components/ui";
import {
  BulletChart,
  Legend,
  RateChart,
  StackedChart,
  TrajectoryChart,
  seriesColor,
} from "@/components/charts";
import {
  computeYear,
  monthLabel,
  num,
  randFmt,
  summaryFor,
  totalSavingsRand,
} from "@/lib/budget";
import {
  currentPeriodKey,
  isCalendarCycle,
  formatDate,
  ordinalDay,
  periodNoun,
  periodRange,
  periodRangeLabel,
} from "@/lib/period";
import { buildInsights, lastN, reportSeries, runwayMonths, typicalSpend } from "@/lib/reports";
import type { Insight } from "@/lib/reports";

const RANGES = [
  { key: "6", label: "6 months", n: 6 },
  { key: "12", label: "12 months", n: 12 },
  { key: "all", label: "All time", n: Number.MAX_SAFE_INTEGER },
];

export default function ReportsPage() {
  const { data, archives } = useData();
  const [range, setRange] = useState("12");

  const model = useMemo(() => {
    if (!data) return null;
    const full = reportSeries(data, archives);
    const n = RANGES.find((r) => r.key === range)?.n ?? 12;
    const series = lastN(full, n);
    const curKey = currentPeriodKey(num(data.settings.budgetYear), data.settings.payDay);
    const year = computeYear(data);
    const current = summaryFor(year, curKey);
    const buckets = data.settings.buckets.map((b) => b.name);

    return {
      full,
      series,
      curKey,
      current,
      buckets,
      savings: totalSavingsRand(data),
      runway: runwayMonths(data, full),
      typical: typicalSpend(full),
      insights: buildInsights(data, full, curKey),
      totalSpent: series.reduce((s, p) => s + p.spent, 0),
      totalIncome: series.reduce((s, p) => s + p.income, 0),
      totalSaved: series.reduce((s, p) => s + p.saved, 0),
    };
  }, [data, archives, range]);

  if (!data || !model) return null;

  const { series, current, buckets } = model;
  const hasHistory = model.full.length >= 2;
  const avgRate = model.totalIncome > 0 ? model.totalSaved / model.totalIncome : 0;
  // Periods are pay cycles unless the pay day is the 1st. Everything below
  // counts periods, so it has to name them for what they are.
  const payDay = data.settings.payDay;
  const calendar = isCalendarCycle(payDay);
  const noun = (n: number) => periodNoun(payDay, n);
  const per = calendar ? "a month" : "a cycle";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-lg font-extrabold sm:text-xl">Reports</h1>
          <p className="text-sm muted">
            {series.length > 0
              ? `${series[0].label} – ${series[series.length - 1].label}`
              : monthLabel(model.curKey)}
            {archives.length > 0
              ? ` · includes ${archives.length} archived year${archives.length === 1 ? "" : "s"}`
              : ""}
          </p>
          {/* On a pay cycle "Feb 26 – Sep 26" spans 25 Jan to 24 Sep, so the
              labels alone would overstate what the report covers. */}
          {!calendar && series.length > 0 ? (
            <p className="text-xs muted">
              {formatDate(periodRange(series[0].key, payDay).start)} to{" "}
              {formatDate(periodRange(series[series.length - 1].key, payDay).end)} · you are paid on
              the {ordinalDay(payDay)}, so each point is a pay cycle, not a calendar month
            </p>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={clsx(
                "rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition",
                r.key === range ? "bg-brand-500 text-white" : "muted",
              )}
              style={r.key === range ? undefined : { background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- headline numbers: no chart needed ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat
          label="Emergency runway"
          value={
            model.runway === null ? (
              "—"
            ) : (
              <>
                {model.runway.toFixed(1)}
                <span className="text-base font-semibold opacity-70"> mo</span>
              </>
            )
          }
          tone={model.runway !== null && model.runway >= 6 ? "green" : "amber"}
          sub={model.typical > 0 ? <>at {randFmt(model.typical)} {per}</> : "not enough history"}
        />
        <Stat
          label="Savings rate"
          value={
            <>
              {(avgRate * 100).toFixed(1)}
              <span className="text-base font-semibold opacity-70">%</span>
            </>
          }
          tone="brand"
          sub={`average over ${series.length} ${noun(series.length)}`}
        />
        <Stat
          label="Total savings"
          value={<Money value={model.savings} />}
          tone="slate"
          sub="all accounts, in rand"
        />
      </div>

      {!hasHistory ? (
        <div className="mt-4">
          <Notice tone="info">
            These charts fill in as months accumulate. Everything here is computed from your own
            entries — nothing is estimated.
          </Notice>
        </div>
      ) : null}

      {/* ---- insights ---- */}
      {model.insights.length > 0 && (
        <>
          <SectionTitle>What the numbers say</SectionTitle>
          <div className="space-y-2.5">
            {model.insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </>
      )}

      {/* ---- savings trajectory ---- */}
      <SectionTitle>Savings trajectory</SectionTitle>
      <Card>
        <p className="mb-3 text-xs muted">
          Everything across every account, at the end of each {noun(1)}.
        </p>
        <TrajectoryChart
          points={series.map((p) => ({ label: p.label, value: p.savingsRand, range: p.range }))}
        />
      </Card>

      {/* ---- budget vs actual ---- */}
      <SectionTitle>
        Budget vs actual · {monthLabel(model.curKey)}
        {!isCalendarCycle(data.settings.payDay)
          ? ` (${periodRangeLabel(model.curKey, data.settings.payDay)})`
          : ""}
      </SectionTitle>
      <Card>
        {current && current.totalIncome > 0 ? (
          <>
            <p className="mb-3 text-xs muted">
              The bar is what was spent; the notch is this {noun(1)}&apos;s allocation.
            </p>
            <BulletChart
              rows={current.buckets.map((b) => ({
                name: b.bucket,
                actual: b.spent,
                allocated: b.allocated,
              }))}
            />
            <Legend
              items={[
                { name: "Spent within allocation", color: "var(--s1)" },
                { name: "Over allocation", color: "var(--over)" },
              ]}
            />
          </>
        ) : (
          <p className="py-6 text-center text-sm muted">
            Add this {noun(1)}&apos;s income to compare spending against your split.
          </p>
        )}
      </Card>

      {/* ---- composition ---- */}
      <SectionTitle>Where the money went</SectionTitle>
      <Card>
        <p className="mb-3 text-xs muted">Outflow split by bucket, one bar per {noun(1)}.</p>
        <StackedChart
          months={lastN(series, 12).map((p) => ({
            label: p.label,
            range: p.range,
            values: buckets.map((b) => p.byBucket[b] ?? 0),
          }))}
          series={buckets}
        />
        <Legend
          items={buckets.map((b, i) => ({
            name: b,
            color: seriesColor(i),
            value: randFmt(series[series.length - 1]?.byBucket[b] ?? 0),
          }))}
        />
        <details className="mt-3">
          <summary className="w-fit cursor-pointer text-xs font-medium text-brand-500">
            View as a table
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="py-1.5 pr-3 text-left font-semibold muted">Bucket</th>
                  {lastN(series, 12).map((p) => (
                    <th
                      key={p.key}
                      title={p.range || undefined}
                      className="px-2 py-1.5 text-right font-semibold muted"
                    >
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3">{b}</td>
                    {lastN(series, 12).map((p) => (
                      <td key={p.key} className="px-2 py-1.5 text-right tabular-nums">
                        {Math.round(p.byBucket[b] ?? 0).toLocaleString("en-ZA")}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t font-bold" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3">Total</td>
                  {lastN(series, 12).map((p) => (
                    <td key={p.key} className="px-2 py-1.5 text-right tabular-nums">
                      {Math.round(p.spent).toLocaleString("en-ZA")}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      {/* ---- savings rate ---- */}
      <SectionTitle>Savings rate by {noun(1)}</SectionTitle>
      <Card>
        <p className="mb-3 text-xs muted">
          Share of each {noun(1)}&apos;s income kept. Bars below the line pulled savings back out.
        </p>
        <RateChart
          points={series.map((p) => ({ label: p.label, value: p.savingsRate, range: p.range }))}
          target={data.settings.buckets.find((b) => /saving/i.test(b.name))?.pct}
        />
      </Card>

      <p className="mt-4 px-1 text-xs muted">
        Every figure here is computed from your own entries.
        {archives.length > 0
          ? " Closed years are read from one archived document each."
          : " Archive a year in Settings to keep its history once it ends."}
      </p>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const tones: Record<string, string> = {
    good: "var(--s3)",
    warn: "var(--s4)",
    info: "var(--s1)",
    critical: "var(--over)",
  };
  return (
    <Card className="!p-3.5">
      <div className="flex gap-3">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: tones[insight.tone] }}
          aria-hidden="true"
        >
          {insight.glyph}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{insight.headline}</p>
          <p className="mt-0.5 text-xs muted">{insight.detail}</p>
        </div>
      </div>
    </Card>
  );
}
