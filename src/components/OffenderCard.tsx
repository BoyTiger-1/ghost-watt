"use client";

import { motion } from "framer-motion";
import { DeviceGlyph } from "./DeviceGlyph";
import { ModeBadge } from "./ModeBadge";
import { fmtCo2, fmtKwh, fmtMoneyFull, fmtPayback } from "@/lib/energy";
import type { AnalysisMode, Offender } from "@/lib/types";

const STATE_LABEL: Record<Offender["state"], string> = {
  on: "powered on",
  standby: "standby",
  off: "off",
};

const FIX_TINT: Record<string, string> = {
  timer: "var(--color-cyan)",
  occupancy: "var(--color-lime)",
  powerstrip: "var(--color-cyan)",
  policy: "var(--color-lime)",
  thermostat: "var(--color-amber)",
  remove: "var(--color-ember)",
  consolidate: "var(--color-amber)",
};

export function OffenderCard({
  offender,
  rank,
  maxCost,
  mode,
  engine,
}: {
  offender: Offender;
  rank: number;
  maxCost: number;
  mode: AnalysisMode;
  engine?: string;
}) {
  const o = offender;
  const pct = maxCost > 0 ? Math.max(6, (o.costPerYear / maxCost) * 100) : 6;
  const tint = FIX_TINT[o.action.type] ?? "var(--color-cyan)";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="panel panel-hover ticked relative overflow-hidden p-4 sm:p-5"
    >
      {/* rank watermark */}
      <span className="pointer-events-none absolute -right-2 -top-5 font-mono text-7xl font-bold text-line2/40 select-none">
        {String(rank).padStart(2, "0")}
      </span>

      <div className="relative flex items-start gap-4">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center border border-line2 bg-surface2 text-cyan"
          style={{ color: tint }}
        >
          <DeviceGlyph icon={o.icon} className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold text-fog sm:text-lg">{o.label}</h3>
            {o.count > 1 && (
              <span className="font-mono text-sm text-cyan">×{o.count}</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.68rem] tracking-wider text-dim">
            <span className="uppercase">{STATE_LABEL[o.state]}</span>
            <span className="text-line2">/</span>
            <span>{Math.round(o.totalWatts).toLocaleString()} W draw</span>
            <span className="text-line2">/</span>
            <span className="uppercase">{o.source}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-mono text-2xl font-bold text-fog sm:text-3xl">
            {fmtMoneyFull(o.costPerYear)}
          </div>
          <div className="mono-label">per year</div>
        </div>
      </div>

      {/* intensity bar */}
      <div className="relative mt-4 h-1.5 w-full bg-surface2">
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ background: `linear-gradient(90deg, var(--color-cyan), var(--color-lime))` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>

      {/* stat strip */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-line border border-line bg-surface2/50">
        <Stat label="wasted / yr" value={fmtKwh(o.kwhPerYear)} />
        <Stat label="CO₂ / yr" value={fmtCo2(o.co2KgPerYear)} />
        <Stat label="confidence" value={o.confidence} />
      </div>

      {/* recommended fix */}
      <div className="mt-4 border-l-2 bg-surface2/40 px-3 py-3" style={{ borderColor: tint }}>
        <div className="flex items-center justify-between gap-3">
          <span className="mono-label" style={{ color: tint }}>
            recommended fix
          </span>
          <div className="flex items-center gap-3 font-mono text-[0.7rem] text-mist">
            <span>{o.fixCost > 0 ? fmtMoneyFull(o.fixCost) : "$0"}</span>
            <span className="text-line2">·</span>
            <span style={{ color: tint }}>payback {fmtPayback(o.paybackMonths)}</span>
          </div>
        </div>
        <p className="mt-1.5 text-sm font-medium text-fog">{o.action.label}</p>
        <p className="mt-1 text-[0.82rem] leading-relaxed text-mist">{o.action.note}</p>
        <p className="mt-2 font-mono text-[0.7rem] text-cyan">
          recovers ~{fmtMoneyFull(o.annualSavings)}/yr
        </p>
      </div>

      <div className="mt-3 flex justify-end">
        <ModeBadge mode={mode} engine={engine} />
      </div>
    </motion.article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="mono-label">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-fog sm:text-base">{value}</div>
    </div>
  );
}
