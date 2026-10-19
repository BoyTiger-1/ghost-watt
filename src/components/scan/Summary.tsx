"use client";

// The short version: what it all costs, how much of that is waste, what you
// could save and how, in sentences a person can read out loud. Every number
// that needs a unit explains it on tap.

import { motion } from "framer-motion";
import { CountUp } from "../CountUp";
import { DeviceGlyph } from "../DeviceGlyph";
import { fmtMoney, fmtMoneyFull } from "@/lib/energy";
import { bestEquivalences, fmtEquiv, spendEquivalences } from "@/lib/equivalence";
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
  needed,
  recoverable,
  actions,
  top,
  co2Kg,
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
  /** The part of that spent while the place is empty. */
  wasted: number;
  /** The part spent while it is in use. */
  needed: number;
  recoverable: number;
  actions: ActionItem[];
  top: Offender | null;
  /** Carbon from the wasted part, kg a year. */
  co2Kg: number;
  place: UsageContext;
  photos: number;
  working: boolean;
  unverifiedCount: number;
  rateQuality: RateQuality;
  onDevices: () => void;
  onFixes: () => void;
  onAccuracy: () => void;
}) {
  const wasteShare = annual > 0 ? Math.min(1, wasted / annual) : 0;
  const free = actions.filter((a) => a.cost === 0);
  const freeSavings = free.reduce((s, a) => s + a.annualSavings, 0);
  const miles = bestEquivalences(co2Kg, 6).find((e) => e.id === "miles");
  const spend = place === "home" ? homeSpend(wasted) : spendEquivalences(wasted)[0];
  const sure = range.spread < 0.2 ? "Quite sure" : range.spread < 0.4 ? "Fairly sure" : "A rough guess";
  const empty = place === "home" ? "while you're out or asleep" : "while the room is empty";

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
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel relative overflow-hidden p-5 sm:p-6" aria-label="Summary">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-70"
        style={{ background: "radial-gradient(70% 90% at 100% 0%, rgba(239,157,46,0.12), transparent 60%)" }}
      />
      <Eyebrow photos={photos} working={working} />

      {/* the year */}
      <p className="mt-3 text-[0.95rem] text-mist">Running everything we spotted costs about</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[2.4rem] font-bold leading-none tracking-tight text-fog sm:text-[2.8rem]">
          <CountUp value={annual} format={fmtMoneyFull} />
        </span>
        <span className="text-[1rem] text-mist">a year</span>
      </div>
      <p className="mt-1.5 text-[0.8rem] text-dim">
        Likely between {fmtMoney(range.p10)} and {fmtMoney(range.p90)}{" "}
        <span className="text-dim">
          (<Term k="range">why a range?</Term>)
        </span>
      </p>

      {/* needed vs wasted */}
      <div className="mt-5">
        <div className="flex h-3.5 overflow-hidden rounded-full bg-surface2" role="img" aria-label={`${Math.round(wasteShare * 100)}% of it is wasted ${empty}`}>
          <motion.div className="h-full bg-cyan/70" initial={{ width: 0 }} animate={{ width: `${(1 - wasteShare) * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
          <motion.div className="h-full bg-ember" initial={{ width: 0 }} animate={{ width: `${wasteShare * 100}%` }} transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-[0.82rem]">
          <div>
            <div className="flex items-center gap-1.5 text-mist">
              <span className="h-2 w-2 rounded-full bg-cyan/70" aria-hidden />
              <Term k="needed">Needed</Term>
            </div>
            <div className="mt-0.5 font-mono text-[1.05rem] font-semibold text-fog">{fmtMoneyFull(needed)}</div>
            <div className="text-[0.74rem] text-dim">while people use it</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-mist">
              <span className="h-2 w-2 rounded-full bg-ember" aria-hidden />
              <Term k="wasted">Wasted</Term>
            </div>
            <div className="mt-0.5 font-mono text-[1.05rem] font-semibold text-ember">{fmtMoneyFull(wasted)}</div>
            <div className="text-[0.74rem] text-dim">{empty}</div>
          </div>
        </div>
      </div>

      {/* what you can do about it */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <button onClick={onFixes} className="rounded-2xl bg-lime/[0.09] px-3.5 py-3 text-left transition-colors hover:bg-lime/[0.14]">
          <div className="text-[0.74rem] font-medium text-lime">You could save</div>
          <div className="mt-0.5 font-mono text-[1.3rem] font-bold text-fog">{fmtMoneyFull(recoverable)}</div>
          <div className="text-[0.74rem] text-mist">a year · see how →</div>
        </button>
        <button onClick={onFixes} className="rounded-2xl bg-surface2 px-3.5 py-3 text-left transition-colors hover:bg-surface2/70">
          <div className="text-[0.74rem] font-medium text-mist">Free to fix</div>
          <div className="mt-0.5 font-mono text-[1.3rem] font-bold text-fog">
            {free.length} <span className="text-[0.85rem] font-normal text-mist">of {actions.length}</span>
          </div>
          <div className="text-[0.74rem] text-mist">{free.length === 0 ? "each fix costs something" : freeSavings > 0 ? `worth ${fmtMoney(freeSavings)}/yr` : "no purchase needed"}</div>
        </button>
      </div>

      {/* the biggest one, and what the waste is like */}
      <ul className="mt-4 space-y-2.5 border-t border-line pt-4 text-[0.86rem] leading-snug text-mist">
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
              wastes the most: {fmtMoneyFull(top.costPerYear)} a year.
            </span>
          </li>
        )}
        {spend && (
          <li className="flex items-start gap-2.5">
            <Dot>$</Dot>
            <span>
              The waste alone could pay for <strong className="font-semibold text-fog">{fmtEquiv(spend.value)} {spend.label}</strong> every year.
            </span>
          </li>
        )}
        {miles && (
          <li className="flex items-start gap-2.5">
            <Dot>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                <path d="M3 13l1.6-4.2A2 2 0 016.5 7.5h11a2 2 0 011.9 1.3L21 13v5h-2.5v-1.5h-13V18H3v-5z" />
              </svg>
            </Dot>
            <span>
              Its <Term k="carbon">pollution</Term> matches driving a car <strong className="font-semibold text-fog">{fmtEquiv(miles.value)} miles</strong>.
            </span>
          </li>
        )}
      </ul>

      {/* how sure */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface2/70 px-3 py-2 text-[0.76rem] text-mist">
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

/** Household things a year of waste would buy. */
function homeSpend(dollars: number) {
  return [
    { value: dollars / 16, label: "months of a streaming subscription" },
    { value: dollars / 40, label: "pizza nights" },
  ].find((s) => s.value >= 1);
}
