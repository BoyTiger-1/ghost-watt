"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DeviceGlyph } from "./DeviceGlyph";
import { ModeBadge } from "./ModeBadge";
import { offenderAnchor } from "./DetectionView";
import { fmtCo2, fmtKwh, fmtMoney, fmtMoneyFull, fmtPayback, fmtWatts } from "@/lib/energy";
import type { DeviceAdjust } from "@/lib/capture";
import { assessEfficiency } from "@/lib/efficiency";
import { GRADE_COLOR } from "./EfficiencyPanel";
import type { AnalysisMode, Offender } from "@/lib/types";
import { DEVICE_CATALOG } from "@/lib/devices";

const STATE_LABEL: Record<Offender["state"], string> = {
  on: "Powered on",
  standby: "Standby",
  off: "Off",
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
  highlighted = false,
  onHover,
  adjust,
  onAdjust,
}: {
  offender: Offender;
  rank: number;
  maxCost: number;
  mode: AnalysisMode;
  engine?: string;
  /** The same device is under the pointer on the detection photo. */
  highlighted?: boolean;
  onHover?: (id: string | null) => void;
  /** The user's corrections to this line, and how to change them. Omit to hide the editor. */
  adjust?: DeviceAdjust;
  onAdjust?: (a: DeviceAdjust) => void;
}) {
  const o = offender;
  const [editing, setEditing] = useState(false);
  // Priced at this line's own rate: its capture may sit on a different tariff.
  const eff = assessEfficiency(o, { ratePerKwh: o.kwhPerYear > 0 ? o.costPerYear / o.kwhPerYear : 0.15 });
  const perUnit = o.count > 0 ? o.totalWatts / o.count : o.perUnitWatts;
  const basis =
    o.basis === "measured"
      ? { text: `measured ${fmtWatts(perUnit)} each`, cls: "bg-lime/10 text-lime" }
      : o.basis === "ai"
        ? { text: `AI read ${fmtWatts(perUnit)} each`, cls: "bg-cyan/10 text-cyan" }
        : { text: `typical ${fmtWatts(perUnit)} each`, cls: "bg-surface2 text-mist" };
  const pct = maxCost > 0 ? Math.max(6, (o.costPerYear / maxCost) * 100) : 6;
  const tint = FIX_TINT[o.action.type] ?? "var(--color-cyan)";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      id={offenderAnchor(o.id)}
      onMouseEnter={onHover && o.boxes?.length ? () => onHover(o.id) : undefined}
      onMouseLeave={onHover && o.boxes?.length ? () => onHover(null) : undefined}
      className={`panel panel-hover ticked relative scroll-mt-24 overflow-hidden p-4 transition-shadow sm:p-5 ${
        highlighted ? "shadow-[inset_0_0_0_1px_var(--color-cyan)]" : ""
      } ${o.unverified ? "border-dashed border-amber/60" : ""}`}
    >
      {o.unverified && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber/[0.09] px-3 py-2 text-[0.8rem] text-amber" role="status">
          <span className="font-medium">Unverified · not counted.</span>
          <span className="text-mist">
            The cloud model reported this{o.modelConfidence !== undefined ? ` (${Math.round(o.modelConfidence * 100)}% sure)` : ""}, but the
            on-device detector could not back it. Look at the photo and decide.
          </span>
          {onAdjust && (
            <span className="ml-auto flex gap-2">
              <button onClick={() => onAdjust({ ...adjust, confirmed: true })} className="rounded-full bg-fog px-3 py-1 text-[0.76rem] font-medium text-ink">
                It&apos;s there
              </button>
              <button onClick={() => onAdjust({ ...adjust, deleted: true })} className="rounded-full border border-line px-3 py-1 text-[0.76rem] text-mist hover:border-ember hover:text-ember">
                Not there
              </button>
            </span>
          )}
        </div>
      )}
      {/* rank watermark */}
      <span className="pointer-events-none absolute -right-2 -top-5 hidden select-none">
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
            {o.boxes?.length ? (
              <span
                className="border border-line2 px-1.5 py-px text-[0.72rem] text-mist"
                title="Marked on the detection photo above. Hover to highlight."
              >
                {o.boxes.length} on photo
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] text-dim">
            <span>{STATE_LABEL[o.state]}</span>
            <span className="text-line2">·</span>
            <span>{Math.round(o.totalWatts).toLocaleString()} W draw</span>
            <span className="hidden text-line2 sm:inline">/</span>
            <span className="hidden sm:inline">{o.source}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.72rem]">
            <span className={`rounded-full px-2 py-px font-medium ${basis.cls}`}>{basis.text}</span>
            {o.hoursPerYear !== undefined && (
              <span className={`rounded-full px-2 py-px font-medium ${o.hoursKnown ? "bg-lime/10 text-lime" : "bg-surface2 text-mist"}`}>
                {o.hoursKnown ? `${Math.round(o.hoursPerYear / 365)} h/day, yours` : `${Math.round(o.hoursPerYear).toLocaleString()} empty h/yr`}
              </span>
            )}
            {o.afterHoursBasis && o.state !== "off" && (
              <span
                className={`rounded-full px-2 py-px font-medium ${o.afterHoursBasis === "assumed-standby" ? "bg-amber/10 text-amber" : "bg-surface2 text-mist"}`}
                title={
                  o.afterHoursBasis === "observed"
                    ? "Seen like this after hours (or the time is unknown), so it is priced as staying this way through the empty hours."
                    : o.afterHoursBasis === "assumed-standby"
                      ? "Seen running during open hours. Assumed to go to standby after hours unless you say it is left on."
                      : "You said what it does after hours."
                }
              >
                after hours: {o.afterHoursState === "on" ? "stays on" : o.afterHoursState === "standby" ? "standby" : "off"}
                {o.afterHoursBasis === "assumed-standby" ? " (assumed)" : o.afterHoursBasis === "user" ? " (yours)" : ""}
              </span>
            )}
          </div>
          {o.evidence && <p className="mt-1.5 text-[0.78rem] italic leading-snug text-mist">&ldquo;{o.evidence}&rdquo;</p>}
        </div>

        <div className="shrink-0 text-right">
          <div className="font-mono text-xl font-bold text-fog sm:text-2xl" title={`Best estimate ${fmtMoneyFull(o.costPerYear)} a year; the band is the published wattage range for this kind of device.`}>
            {o.costPerYear > 0 ? `${fmtMoney(o.costLowPerYear)}–${fmtMoney(o.costHighPerYear)}` : "$0"}
          </div>
          <div className="mono-label" title="What this draws through the hours the space is empty, in its after-hours state">
            a year after hours
          </div>
          {o.typicalCostPerYear !== undefined && (
            <div
              className="mt-1 font-mono text-[0.78rem] text-mist"
              title={`Typical use: ${o.typicalHoursPerDay?.toFixed(1)} h/day in use, standby otherwise. ${o.usageBasis ?? ""}`}
            >
              {fmtMoney(o.typicalCostPerYear)}/yr in normal use
            </div>
          )}
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
        <Stat label="energy if left on" value={fmtKwh(o.kwhPerYear)} />
        <Stat label="CO₂ / yr" value={fmtCo2(o.co2KgPerYear)} />
        <Stat label="confidence" value={o.confidence} />
      </div>

      {/* efficiency: bad hardware, or good hardware used badly? */}
      <div className="mt-4 flex gap-3 rounded-xl border border-line bg-surface2/40 p-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg font-mono text-lg font-bold text-white"
          style={{ background: GRADE_COLOR[eff.grade] }}
          aria-label={`Efficiency grade ${eff.grade}`}
        >
          {eff.grade}
        </span>
        <div className="min-w-0">
          <div className="text-[0.86rem] font-medium text-fog">{eff.headline}</div>
          <p className="mt-0.5 text-[0.8rem] leading-relaxed text-mist">{eff.detail}</p>
          {o.typicalHoursPerDay !== undefined && (
            <p className="mt-1 text-[0.72rem] text-dim">
              In use {o.typicalHoursPerDay < 1 ? `${Math.round(o.typicalHoursPerDay * 60)} min` : `${o.typicalHoursPerDay.toFixed(1)} h`}/day
              {o.usageBasis ? ` · ${o.usageBasis}` : ""}
              {eff.assumed ? " · graded on a typical unit" : ""}
            </p>
          )}
        </div>
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

      <AnimatePresence initial={false}>
        {editing && onAdjust && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <label className="mt-4 block">
              <span className="text-[0.7rem] text-dim">Device type</span>
              <select
                value={adjust?.categoryId ?? o.categoryId}
                onChange={(e) => onAdjust({ ...adjust, categoryId: e.target.value === o.categoryId && !adjust?.categoryId ? undefined : e.target.value })}
                className="mt-1 w-full rounded-xl border border-line bg-surface px-2.5 py-2 text-base text-fog outline-none focus:border-cyan sm:text-sm"
              >
                {DEVICE_CATALOG.slice()
                  .sort((a, b) => a.label.localeCompare(b.label))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </select>
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <AdjustField label="Count" value={adjust?.count} placeholder={String(o.count)} onChange={(v) => onAdjust({ ...adjust, count: v })} step={1} />
              <AdjustField
                label="Watts each"
                value={adjust?.watts}
                placeholder={String(Math.round(perUnit))}
                onChange={(v) => onAdjust({ ...adjust, watts: v })}
              />
              <AdjustField
                label="Hours / day"
                value={adjust?.hoursPerDay}
                placeholder={o.hoursPerYear ? (o.hoursPerYear / 365).toFixed(1) : "-"}
                max={24}
                onChange={(v) => onAdjust({ ...adjust, hoursPerDay: v })}
              />
            </div>
            {o.state !== "off" && !o.hoursKnown && (
              <fieldset className="mt-2">
                <legend className="text-[0.7rem] text-dim">After hours this device</legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(["on", "standby", "off"] as const).map((st) => {
                    const current = adjust?.afterHours ?? o.afterHoursState;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => onAdjust({ ...adjust, afterHours: st })}
                        aria-pressed={current === st}
                        className={`rounded-full border px-3 py-1 text-[0.76rem] transition-colors ${
                          current === st ? "border-fog bg-fog text-ink" : "border-line text-mist hover:border-line2"
                        }`}
                      >
                        {st === "on" ? "stays on" : st === "standby" ? "goes to standby" : "is switched off"}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[0.72rem] text-dim">Off a nameplate or a plug-in meter beats any estimate. Clear a field to go back to ours.</p>
              <button onClick={() => onAdjust({ ...adjust, deleted: true })} className="text-[0.74rem] text-dim underline-offset-4 hover:text-ember hover:underline">
                Not in this room: delete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 flex items-center justify-between gap-2">
        {onAdjust ? (
          <button
            onClick={() => setEditing((e) => !e)}
            aria-expanded={editing}
            className="rounded-full border border-line px-3 py-1.5 text-[0.76rem] text-mist transition-colors hover:border-cyan hover:text-cyan"
          >
            {editing ? "Done" : adjust && Object.values(adjust).some((v) => v !== undefined) ? "Adjusted · edit" : "Adjust"}
          </button>
        ) : (
          <span />
        )}
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

function AdjustField({
  label,
  value,
  placeholder,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number | undefined;
  placeholder: string;
  max?: number;
  step?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.7rem] text-dim">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step={step ?? "any"}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(Number.isFinite(v) && v >= 0 ? (max ? Math.min(max, v) : v) : undefined);
        }}
        className="mt-1 w-full rounded-xl border border-line bg-surface px-2.5 py-2 font-mono text-base text-fog outline-none placeholder:text-dim/60 focus:border-cyan sm:text-sm"
      />
    </label>
  );
}
