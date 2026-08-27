"use client";

// The budget optimiser.
//
// This is the part that is not an AI feature at all, and it is the part that
// matters most. A school does not have money for every fix on the list; it has a
// specific, small number - $500, maybe $1,200 - and it needs to know which subset
// of fixes buys the most saving for exactly that. Working down the ranked list
// until the money runs out is the obvious approach and it is often wrong, because
// the biggest offender is sometimes also the most expensive thing to fix.
//
// So: an exact 0/1 knapsack over the fix list, and the panel shows what the
// optimiser found *and* what the naive ranked-list approach would have got, so the
// difference is visible rather than asserted.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  optimizeBudget,
  budgetForFraction,
  savingsCurve,
  lifetimeSavings,
  roi,
  DEFAULT_FINANCE,
} from "@/lib/finance";
import { fmtMoneyFull, fmtMoney, fmtPayback, fmtCo2, fmtPct } from "@/lib/energy";
import { SavingsCurve } from "./Charts";
import { DeviceGlyph } from "./DeviceGlyph";
import type { Offender } from "@/lib/types";

function niceMax(offenders: Offender[]): number {
  const total = offenders.reduce((s, o) => s + o.fixCost, 0);
  return Math.max(100, Math.ceil((total * 1.1) / 50) * 50);
}

export function BudgetPlanner({ offenders }: { offenders: Offender[] }) {
  const max = useMemo(() => niceMax(offenders), [offenders]);
  const [budget, setBudget] = useState(() => Math.round(max * 0.35));

  const plan = useMemo(() => optimizeBudget(offenders, budget), [offenders, budget]);
  const curve = useMemo(() => savingsCurve(offenders, 30), [offenders]);
  const eighty = useMemo(() => budgetForFraction(offenders, 0.8), [offenders]);

  const lifetime = lifetimeSavings(plan.annualSavings, DEFAULT_FINANCE);
  const returnRatio = roi(plan.annualSavings, plan.spend, DEFAULT_FINANCE);

  const freeItems = plan.chosen.filter((i) => i.cost === 0);
  const pricedItems = plan.chosen.filter((i) => i.cost > 0);
  const skipped = plan.items.filter((i) => !i.selected && i.annualSavings > 0);

  if (!offenders.length) return null;

  return (
    <section className="panel ticked @container overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-fog sm:text-xl">Budget planner</h2>
          <p className="mt-0.5 text-sm text-mist">
            Tell it what you have. It solves for the best possible set of fixes.
          </p>
        </div>
        <span className="mono-label">exact 0/1 knapsack</span>
      </header>

      <div className="grid gap-6 p-5 sm:p-6 @3xl:grid-cols-[1fr_320px]">
        {/* ---- controls + results ---- */}
        <div className="min-w-0">
          <label className="block">
            <span className="mono-label">available budget</span>
            <div className="mt-2 flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={max}
                step={10}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none bg-surface2 accent-cyan"
                aria-label="Available budget in dollars"
              />
              <output className="w-24 shrink-0 text-right font-mono text-2xl font-bold text-fog tabular-nums">
                ${budget.toLocaleString()}
              </output>
            </div>
          </label>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {[0, 100, 250, 500, 1000].map((b) =>
              b <= max ? (
                <button
                  key={b}
                  onClick={() => setBudget(b)}
                  className={`border px-2.5 py-1 font-mono text-[0.7rem] transition-colors ${
                    budget === b
                      ? "border-cyan/60 bg-cyan/10 text-cyan"
                      : "border-line text-dim hover:border-line2 hover:text-mist"
                  }`}
                >
                  ${b}
                </button>
              ) : null,
            )}
            {eighty.spend > 0 && (
              <button
                onClick={() => setBudget(eighty.spend)}
                className="border border-lime/40 bg-lime/5 px-2.5 py-1 font-mono text-[0.7rem] text-lime transition-colors hover:bg-lime/10"
              >
                80% of the win = ${eighty.spend.toLocaleString()}
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 divide-x divide-line border border-line bg-surface2/50 @lg:grid-cols-4">
            <Cell label="you spend" value={fmtMoneyFull(plan.spend)} />
            <Cell
              label="you save/yr"
              value={fmtMoneyFull(plan.annualSavings)}
              tint="var(--color-lime)"
            />
            <Cell label="payback" value={fmtPayback(plan.paybackMonths)} />
            <Cell label="CO₂ / yr" value={fmtCo2(plan.co2SavedKg)} />
          </div>

          {/* The claim that makes the optimiser worth having. */}
          <AnimatePresence mode="wait">
            {plan.improvementOverGreedy > 0.5 && (
              <motion.p
                key={Math.round(plan.improvementOverGreedy)}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 border-l-2 border-cyan bg-cyan/5 px-3 py-2 text-[0.82rem] leading-relaxed text-mist"
              >
                Working straight down the ranked list with this budget would have
                recovered {fmtMoneyFull(plan.greedySavings)}/yr. Choosing the set
                properly finds{" "}
                <strong className="font-semibold text-cyan">
                  {fmtMoneyFull(plan.improvementOverGreedy)}/yr more
                </strong>{" "}
                for the same money.
              </motion.p>
            )}
          </AnimatePresence>

          {/* ---- the plan ---- */}
          <div className="mt-6">
            <h3 className="mono-label">do these, in this order</h3>
            <ol className="mt-3 space-y-2">
              {freeItems.map((item, i) => (
                <PlanRow key={item.offender.id} item={item} index={i} free />
              ))}
              {pricedItems.map((item, i) => (
                <PlanRow key={item.offender.id} item={item} index={freeItems.length + i} />
              ))}
            </ol>
            {plan.chosen.length === 0 && (
              <p className="mt-3 text-sm text-dim">
                Nothing fits this budget yet. Even at $0 there are usually free policy
                changes; if this list is empty, the audit found none.
              </p>
            )}
          </div>

          {skipped.length > 0 && (
            <details className="mt-5 border border-line bg-surface2/30">
              <summary className="cursor-pointer px-4 py-2.5 font-mono text-[0.72rem] tracking-wider text-dim uppercase hover:text-mist">
                {skipped.length} fix{skipped.length === 1 ? "" : "es"} left on the table
              </summary>
              <ul className="border-t border-line px-4 py-3 text-sm">
                {skipped.map((i) => (
                  <li
                    key={i.offender.id}
                    className="flex items-baseline justify-between gap-3 py-1 text-mist"
                  >
                    <span className="truncate">{i.offender.action.label}</span>
                    <span className="shrink-0 font-mono text-xs text-dim tabular-nums">
                      {fmtMoneyFull(i.cost)} → {fmtMoney(i.annualSavings)}/yr
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* ---- the curve ---- */}
        <aside className="min-w-0 @3xl:border-l @3xl:border-line @3xl:pl-6">
          <h3 className="mono-label">savings vs spend</h3>
          <div className="mt-3">
            <SavingsCurve points={curve} budget={budget} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[0.65rem] text-dim">
            <span>$0</span>
            <span>${max.toLocaleString()}</span>
          </div>
          <p className="mt-3 text-[0.82rem] leading-relaxed text-mist">
            The curve is steep at the start and flat at the end. That shape is the
            whole argument for doing the cheap things first: the last{" "}
            {fmtMoney(max - eighty.spend)} of spending buys about a fifth of the
            benefit that the first {fmtMoney(eighty.spend)} does.
          </p>

          <dl className="mt-5 space-y-2.5 border-t border-line pt-4">
            <Line label={`${DEFAULT_FINANCE.horizonYears}-year value`} value={fmtMoneyFull(lifetime)} />
            <Line
              label="return on spend"
              value={returnRatio === null ? "no cost" : `${returnRatio.toFixed(1)}×`}
            />
            <Line
              label="share of all recoverable"
              value={fmtPct(
                plan.annualSavings /
                  Math.max(
                    1,
                    offenders.reduce((s, o) => s + o.annualSavings, 0),
                  ),
              )}
            />
          </dl>
          <p className="mt-3 text-[0.72rem] leading-relaxed text-dim">
            Lifetime value discounts future savings at{" "}
            {fmtPct(DEFAULT_FINANCE.discountRate)} and grows energy prices at{" "}
            {fmtPct(DEFAULT_FINANCE.energyInflation)} a year.
          </p>
        </aside>
      </div>
    </section>
  );
}

function PlanRow({
  item,
  index,
  free = false,
}: {
  item: { offender: Offender; cost: number; annualSavings: number };
  index: number;
  free?: boolean;
}) {
  const o = item.offender;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className="lift flex items-center gap-3 border border-line bg-surface2/40 px-3.5 py-3"
    >
      <span className="w-5 shrink-0 font-mono text-xs text-dim tabular-nums">
        {String(index + 1).padStart(2, "0")}
      </span>
      <DeviceGlyph icon={o.icon} className="h-4 w-4 shrink-0 text-cyan" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fog">{o.action.label}</p>
        <p className="truncate font-mono text-[0.68rem] text-dim">
          {o.label} · {o.source}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm font-semibold text-lime tabular-nums">
          +{fmtMoney(item.annualSavings)}/yr
        </div>
        <div className="font-mono text-[0.68rem] text-dim tabular-nums">
          {free ? "free" : fmtMoneyFull(item.cost)}
        </div>
      </div>
    </motion.li>
  );
}

function Cell({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="px-3 py-3">
      <div className="mono-label truncate">{label}</div>
      <div
        className="mt-0.5 font-mono text-base font-bold text-fog tabular-nums"
        style={tint ? { color: tint } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-mist">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-fog tabular-nums">{value}</dd>
    </div>
  );
}
