"use client";

// One device's year, as one total in two parts: "$16.64 = $4.30 used + $12.34 idle",
// with the watts behind each part, what the idle part could be, and what it
// assumes. Every surface that prices a device shows this and nothing else, so the
// figures are never in two vocabularies and always add up.

import { fmtAmt, fmtWatts, idleCaption, idleRangeLine, splitDollars, splitWatts, type CostSplit, type WattSplit } from "@/lib/energy";
import type { Offender } from "@/lib/types";
import { Term } from "./Term";

type Tone = { total: string; mist: string; dim: string; used: string; idle: string; bar: string; rule: string };

const LIGHT: Tone = { total: "text-fog", mist: "text-mist", dim: "text-dim", used: "text-cyan", idle: "text-ember", bar: "bg-surface2", rule: "border-line" };
const DARK: Tone = { total: "text-white", mist: "text-white/75", dim: "text-white/55", used: "text-[#5aa9ff]", idle: "text-[#ff8a7e]", bar: "bg-white/10", rule: "border-white/10" };

export function CostBreakdown({ offender: o, place, dark }: { offender: Offender; place?: "home" | "school" | "office"; dark?: boolean }) {
  return (
    <SplitView
      cost={splitDollars(o)}
      watts={splitWatts(o)}
      range={idleRangeLine(o)}
      caption={idleCaption(o, place)}
      needed={o.needed}
      dark={dark}
    />
  );
}

/** The split itself, for one device or for everything in view. */
export function SplitView({
  cost: d,
  watts: w,
  range,
  caption,
  needed,
  dark,
}: {
  cost: CostSplit & { cents: boolean };
  watts: WattSplit;
  /** "idle could be $a to $b ...", when there is a range to show. */
  range: string | null;
  caption: string;
  /** Why it is meant to run all night, when it is. */
  needed?: string;
  dark?: boolean;
}) {
  const t = dark ? DARK : LIGHT;
  const idleShare = d.total > 0 ? Math.min(1, d.idle / d.total) : 0;
  const money = (n: number) => fmtAmt(n, d.cents);

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-x-1.5">
        <Cell tone={t} label="a year" amount={money(d.total)} watts={`${fmtWatts(w.total)} average`} color={t.total} strong />
        <Op tone={t}>=</Op>
        <Cell tone={t} label={<Term k="used">used</Term>} amount={money(d.used)} watts={`${fmtWatts(w.used)} in use`} color={t.used} />
        <Op tone={t}>+</Op>
        <Cell tone={t} label={<Term k="idle">idle</Term>} amount={money(d.idle)} watts={needed ? "meant to run" : `${fmtWatts(w.idle)} when empty`} color={t.idle} />
      </div>

      <div className={`mt-2 flex h-2 overflow-hidden rounded-full ${t.bar}`} aria-hidden>
        <span className="h-full bg-cyan/70" style={{ width: `${(1 - idleShare) * 100}%` }} />
        <span className="h-full bg-ember" style={{ width: `${idleShare * 100}%` }} />
      </div>

      {needed ? (
        <p className={`mt-2 text-[0.76rem] leading-snug ${t.dim}`}>Meant to run all night ({needed}), so none of it counts as idle.</p>
      ) : (
        <p className={`mt-2 text-[0.76rem] leading-snug ${t.dim}`}>
          {range && <span className={t.mist}>{range[0].toUpperCase() + range.slice(1)}. </span>}
          {caption}
        </p>
      )}
    </div>
  );
}

function Cell({ tone, label, amount, watts, color, strong }: { tone: Tone; label: React.ReactNode; amount: string; watts: string; color: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`font-mono tabular-nums leading-tight ${strong ? "text-[1.25rem] font-bold" : "text-[1.05rem] font-semibold"} ${color}`}>{amount}</div>
      <div className={`text-[0.7rem] ${tone.mist}`}>{label}</div>
      <div className={`font-mono text-[0.66rem] ${tone.dim}`}>{watts}</div>
    </div>
  );
}

function Op({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`pt-0.5 text-[1rem] ${tone.dim}`} aria-hidden>
      {children}
    </span>
  );
}
