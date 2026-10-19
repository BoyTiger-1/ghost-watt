"use client";

// The decision layer.
//
// One list, ranked by dollars saved per dollar spent, and every line has a
// checkbox. Tick a move and the room's annual bill, the payback and the carbon
// above it change at once. That is the whole simulator: not a model, a re-total
// of the same arithmetic the audit used, so the number a person ends up with is
// one they could reproduce with a calculator from the rows below.

import { useMemo, useState } from "react";
import { listActions, rankActions, simulate, type ActionItem } from "@/lib/actions";
import { fmtCo2, fmtMoney, fmtMoneyFull, fmtPayback, fmtPct } from "@/lib/energy";
import type { AuditSettings, Offender } from "@/lib/types";
import { DeviceGlyph } from "./DeviceGlyph";

export function ActionPlan({ offenders, settings }: { offenders: Offender[]; settings: AuditSettings }) {
  const actions = useMemo(() => rankActions(listActions(offenders, settings)), [offenders, settings]);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  // Moves for lines that no longer exist drop out silently.
  const live = useMemo(() => new Set([...chosen].filter((id) => actions.some((a) => a.id === id))), [chosen, actions]);
  const sim = useMemo(() => simulate(offenders, settings, live), [offenders, settings, live]);

  if (!actions.length) {
    return (
      <section className="panel px-5 py-5 text-[0.88rem] leading-relaxed text-mist" aria-label="Plan">
        Nothing here to act on yet: the counted devices either cost nothing after hours or offer no fix the app can price.
      </section>
    );
  }

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pick = (f: (a: ActionItem) => boolean) => setChosen(new Set(actions.filter(f).map((a) => a.id)));
  const freeCount = actions.filter((a) => a.savingsPerDollar === null).length;

  return (
    <section className="panel ticked @container overflow-hidden" aria-label="Savings simulator">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-fog sm:text-xl">What to do, in order</h2>
          <p className="mt-0.5 text-sm text-mist">Ranked by dollars saved per dollar spent. Tick moves to see the bill change.</p>
        </div>
        <span className="mono-label">{live.size} of {actions.length} chosen</span>
      </header>

      {/* live totals */}
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line @lg:grid-cols-5">
        <Cell label="annual bill now" value={fmtMoneyFull(sim.before.total)} sub={`${fmtMoney(sim.before.afterHours)} after hours · ${fmtMoney(sim.before.typical)} in use`} />
        <Cell label="after these moves" value={fmtMoneyFull(sim.after.total)} sub={`${fmtMoney(sim.after.afterHours)} after hours · ${fmtMoney(sim.after.typical)} in use`} tint="var(--color-cyan)" />
        <Cell label="saved a year" value={fmtMoneyFull(sim.annualSavings)} sub={sim.before.total > 0 ? `${fmtPct(sim.share)} of the bill` : ""} tint="var(--color-lime)" />
        <Cell label="up front" value={sim.upfront > 0 ? fmtMoneyFull(sim.upfront) : "nothing"} sub={sim.paybackMonths === null ? "no purchase" : sim.paybackMonths === Infinity ? "never pays back" : `pays back in ${fmtPayback(sim.paybackMonths)}`} />
        <Cell label="CO₂ avoided" value={fmtCo2(sim.co2SavedKg)} sub="a year, at this grid's factor" />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3 sm:px-6">
        <Quick onClick={() => pick((a) => a.savingsPerDollar === null)} active={freeCount > 0 && live.size === freeCount && [...live].every((id) => actions.find((a) => a.id === id)?.savingsPerDollar === null)}>
          Free moves only
        </Quick>
        <Quick onClick={() => pick((a) => a.paybackMonths === null || a.paybackMonths <= 12)}>Pays back within a year</Quick>
        <Quick onClick={() => pick(() => true)} active={live.size === actions.length}>
          Everything
        </Quick>
        <Quick onClick={() => setChosen(new Set())} active={live.size === 0}>
          Clear
        </Quick>
      </div>

      <ol className="divide-y divide-line">
        {actions.map((a, i) => {
          const on = live.has(a.id);
          return (
            <li key={a.id}>
              <label className={`flex cursor-pointer items-start gap-3 px-5 py-3 transition-colors sm:px-6 ${on ? "bg-surface2/60" : "hover:bg-surface2/30"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="mt-1 h-4 w-4 shrink-0 accent-cyan" aria-label={`${a.title} for ${a.label}`} />
                <span className="w-5 shrink-0 pt-0.5 font-mono text-xs text-dim tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <DeviceGlyph icon={a.icon} className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug text-fog">
                    {a.title}
                    <span className={`ml-2 rounded-full px-1.5 py-px text-[0.64rem] font-medium uppercase tracking-wide ${a.kind === "replace" ? "bg-amber/15 text-amber" : "bg-cyan/15 text-cyan"}`}>
                      {a.kind === "replace" ? "swap" : "fix habit"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[0.76rem] text-dim">
                    {a.label}
                    {a.count > 1 ? ` ×${a.count}` : ""} · {a.where}
                    {a.confidence === "low" ? " · low confidence" : ""}
                  </span>
                  <span className="mt-1 block text-[0.76rem] leading-relaxed text-mist">{a.detail}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-semibold text-lime tabular-nums">+{fmtMoney(a.annualSavings)}/yr</span>
                  <span className="block font-mono text-[0.68rem] text-dim tabular-nums">
                    {a.savingsPerDollar === null ? "free" : `${fmtMoneyFull(a.cost)} · $${a.savingsPerDollar.toFixed(2)} back per $1`}
                  </span>
                  {a.paybackMonths !== null && <span className="block font-mono text-[0.68rem] text-dim tabular-nums">{fmtPayback(a.paybackMonths)} payback</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-line px-5 py-3 text-[0.76rem] leading-relaxed text-dim sm:px-6">
        A fix removes its share of the after-hours waste; a swap lowers the draw in use and after hours alike. Ticking both for one device
        counts the watts once. Swap savings are priced at typical use, so they are what shows up on a bill, not a best case.
      </p>
    </section>
  );
}

function Cell({ label, value, sub, tint }: { label: string; value: string; sub?: string; tint?: string }) {
  return (
    <div className="bg-ink px-4 py-3">
      <div className="mono-label">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-bold text-fog tabular-nums" style={tint ? { color: tint } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[0.66rem] leading-snug text-dim">{sub}</div>}
    </div>
  );
}

function Quick({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-[0.76rem] transition-colors ${active ? "border-fog bg-fog text-ink" : "border-line text-dim hover:border-line2 hover:text-mist"}`}
    >
      {children}
    </button>
  );
}
