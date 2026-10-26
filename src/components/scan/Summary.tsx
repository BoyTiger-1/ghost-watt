"use client";

// The short version: what it all costs as one total in two parts (used + idle),
// the watts behind each, what you could save and how, in sentences a person can
// read out loud. Every number that needs a unit explains it on tap.

import { motion } from "framer-motion";
import { CountUp } from "../CountUp";
import { DeviceGlyph } from "../DeviceGlyph";
import { fmtAmt, fmtMoney, fmtMoneyFull, fmtWatts, roundSplit, type WattSplit } from "@/lib/energy";
import { fmtEquiv, spendEquivalences } from "@/lib/equivalence";
import type { ActionItem } from "@/lib/actions";
import type { CostRange, RateQuality } from "@/lib/estimate";
import type { UsageContext } from "@/lib/usage";
import type { Offender } from "@/lib/types";
import { Term } from "./Term";

const RATE_WORDS: Record<RateQuality, string> = {
  bill: "the price on your bill",
  utility: "your local utility's price",
  state: "your state's average price",
  national: "the US average price",
};

export function Summary({
  annual,
  range,
  wasted,
  idleLow,
  idleHigh,
  watts,
  caption,
  recoverable,
  actions,
  top,
  place,
  photos,
  working,
  unverifiedCount,
  rateQuality,
  onDevices,
  onFixes,
  onAccuracy,
}: {
  /** What everything seen costs to run for a year. */
  annual: number;
  range: CostRange;
  /** The idle part: spent while the place is empty. */
  wasted: number;
  /** What the idle part could be if everything slept, and if everything stayed on. */
  idleLow: number;
  idleHigh: number;
  /** The draw behind each part. */
  watts: WattSplit;
  /** What the idle figure assumes, in a few words. */
  caption: string;
  recoverable: number;
  actions: ActionItem[];
  top: Offender | null;
  place: UsageContext;
  photos: number;
  working: boolean;
  unverifiedCount: number;
  rateQuality: RateQuality;
  onDevices: () => void;
  onFixes: () => void;
  onAccuracy: () => void;
}) {
  const d = roundSplit(annual, wasted);
  const money = (n: number) => fmtAmt(n, d.cents);
  const idleShare = d.total > 0 ? Math.min(1, d.idle / d.total) : 0;
  const free = actions.filter((a) => a.cost === 0);
  const freeSavings = free.reduce((s, a) => s + a.annualSavings, 0);
  const spend = place === "home" ? homeSpend(wasted) : spendEquivalences(wasted)[0];
  const sure = range.spread < 0.2 ? "Quite sure" : range.spread < 0.4 ? "Fairly sure" : "A rough guess";
  const empty = place === "home" ? "while you're out or asleep" : "while the room is empty";
  const lowHigh = [Math.round(idleLow), Math.round(idleHigh)];

  if (annual <= 0) {
    return (
      <section className="panel p-5 sm:p-6" aria-label="Summary">
        <Eyebrow photos={photos} working={working} />
        <h2 className="mt-3 text-[1.35rem] font-semibold leading-snug text-fog">Nothing here is using power.</h2>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-mist">
          Everything we could see was switched off. That&apos;s exactly what you want to find. Try another room, or a photo taken at night.
        </p>
      </section>
    );
  }

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel relative flex flex-1 flex-col overflow-hidden p-5 sm:p-6" aria-label="Summary">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-70"
        style={{ background: "radial-gradient(70% 90% at 100% 0%, rgba(239,157,46,0.12), transparent 60%)" }}
      />
      <Eyebrow photos={photos} working={working} />

      {/* the year, split: one total, two parts, the watts behind each */}
      <p className="mt-3 text-[0.95rem] text-mist">Running everything we spotted costs about</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[2.4rem] font-bold leading-none tracking-tight text-fog sm:text-[2.8rem]">
          <CountUp value={annual} format={(n) => fmtAmt(roundSplit(n, 0).total, d.cents)} />
        </span>
        <span className="text-[1rem] text-mist">a year</span>
      </div>
      <p className="mt-1.5 text-[0.8rem] text-dim">
        Likely between {fmtMoney(range.p10)} and {fmtMoney(range.p90)}{" "}
        <span className="text-dim">
          (<Term k="range">why a range?</Term>)
        </span>
      </p>

      <div className="mt-4">
        <div className="flex h-3.5 overflow-hidden rounded-full bg-surface2" role="img" aria-label={`${Math.round(idleShare * 100)}% of it is idle ${empty}`}>
          <motion.div className="h-full bg-cyan/70" initial={{ width: 0 }} animate={{ width: `${(1 - idleShare) * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
          <motion.div className="h-full bg-ember" initial={{ width: 0 }} animate={{ width: `${idleShare * 100}%` }} transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-[0.82rem]">
          <div>
            <div className="flex items-center gap-1.5 text-mist">
              <span className="h-2 w-2 rounded-full bg-cyan/70" aria-hidden />
              <Term k="used">Used</Term>
            </div>
            <div className="mt-0.5 font-mono text-[1.05rem] font-semibold text-fog">{money(d.used)}</div>
            <div className="font-mono text-[0.72rem] text-dim">{fmtWatts(watts.used)} in use</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-mist">
              <span className="h-2 w-2 rounded-full bg-ember" aria-hidden />
              <Term k="idle">Idle</Term>
            </div>
            <div className="mt-0.5 font-mono text-[1.05rem] font-semibold text-ember">{money(d.idle)}</div>
            <div className="font-mono text-[0.72rem] text-dim">{fmtWatts(watts.idle)} when empty</div>
          </div>
        </div>
        <p className="mt-2 text-[0.76rem] leading-snug text-dim">
          {lowHigh[0] !== lowHigh[1] && <span className="text-mist">Idle could be {fmtMoneyFull(lowHigh[0])} to {fmtMoneyFull(lowHigh[1])} depending on what it does when nobody is there. </span>}
          {caption}. Whole year averages {fmtWatts(watts.total)}.
        </p>
      </div>

      {/* what you can do about it */}
      <button onClick={onFixes} className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-lime/[0.09] px-3.5 py-3 text-left transition-colors hover:bg-lime/[0.14]">
        <span>
          <span className="block text-[0.74rem] font-medium text-lime">You could save</span>
          <span className="block font-mono text-[1.3rem] font-bold text-fog">
            {fmtMoneyFull(recoverable)} <span className="text-[0.8rem] font-normal text-mist">a year</span>
          </span>
        </span>
        <span className="text-right text-[0.76rem] text-mist">
          {free.length} of {actions.length} fixes free{freeSavings > 0 ? ` · ${fmtMoney(freeSavings)}/yr` : ""}
          <span className="block text-lime">see how →</span>
        </span>
      </button>

      {/* the biggest one */}
      <ul className="mb-4 mt-4 space-y-2.5 border-t border-line pt-4 text-[0.86rem] leading-snug text-mist">
        {top && top.costPerYear > 0 && (
          <li className="flex items-start gap-2.5">
            <span className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ember/10 text-ember">
              <DeviceGlyph icon={top.icon} className="h-4 w-4" />
            </span>
            <span>
              <button onClick={onDevices} className="font-medium text-fog underline decoration-line2 underline-offset-4 hover:decoration-fog">
                {top.label}
                {top.count > 1 ? ` (${top.count})` : ""}
              </button>{" "}
              idles the most: {fmtMoneyFull(top.costPerYear)} a year.
            </span>
          </li>
        )}
        {spend && (
          <li className="flex items-start gap-2.5">
            <Dot>$</Dot>
            <span>
              The idle cost alone could pay for <strong className="font-semibold text-fog">{fmtEquiv(spend.value)} {spend.label}</strong> every year.
            </span>
          </li>
        )}
      </ul>

      {/* how sure */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface2/70 px-3 py-2 text-[0.76rem] text-mist">
        <span>
          <span className="font-medium text-fog">{sure}</span> · priced at {RATE_WORDS[rateQuality]}
          {unverifiedCount > 0 && <span className="text-amber"> · {unverifiedCount} unsure item{unverifiedCount > 1 ? "s" : ""} left out</span>}
        </span>
        <button onClick={onAccuracy} className="font-medium text-cyan hover:underline">
          Make it more accurate
        </button>
      </div>
    </motion.section>
  );
}

function Eyebrow({ photos, working }: { photos: number; working: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="mono-label text-cyan">The short version</span>
      <span className="text-[0.72rem] text-dim">
        {photos} {photos === 1 ? "picture" : "pictures"}
        {working && <span className="ml-1 text-sodium-deep">· still reading…</span>}
      </span>
    </div>
  );
}

function Dot({ children }: { children: React.ReactNode }) {
  return <span className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface2 text-[0.8rem] font-semibold text-mist">{children}</span>;
}

/** Household things a year of idle cost would buy. */
function homeSpend(dollars: number) {
  return [
    { value: dollars / 16, label: "months of a streaming subscription" },
    { value: dollars / 40, label: "pizza nights" },
  ].find((s) => s.value >= 1);
}
