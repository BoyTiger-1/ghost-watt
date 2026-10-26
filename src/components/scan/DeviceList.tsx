"use client";

// Every device found, one short row each, the one that idles the most first.
//
// A row says what it is, what it's doing and what it costs a year, as one total
// in two parts (used + idle), with a bar so the order reads at a glance. Opening
// it shows the same three figures with the watts behind each, then the fix and
// what it pays back, and, for anyone who wants them, the raw figures and a way
// to correct what the AI got wrong.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DeviceGlyph } from "../DeviceGlyph";
import { offenderAnchor } from "../DetectionView";
import { GRADE_COLOR } from "../EfficiencyPanel";
import { fmtAmt, fmtCo2, fmtKwh, fmtMoney, fmtMoneyFull, idleRange, splitDollars } from "@/lib/energy";
import { assessEfficiency } from "@/lib/efficiency";
import { DEVICE_CATALOG } from "@/lib/devices";
import type { DeviceAdjust } from "@/lib/capture";
import type { Offender } from "@/lib/types";
import { Icon } from "./icons";
import { Term } from "./Term";
import { CostBreakdown } from "./CostBreakdown";
import { STATE_COLOR, STATE_PLAIN, basisWords, confidenceWords, hoursPerDayWords, monthsWords, wattsPicture, USAGE_COLOR } from "./plain";

export interface DeviceLine {
  offender: Offender;
  adjust?: DeviceAdjust;
}

/**
 * Every device found, worst first. Hovering a row highlights its box on the photo
 * (and the reverse), and opening a row shows why it costs what it does and lets
 * the person correct it.
 */
export function DeviceList({
  lines,
  hovered,
  onHover,
  onAdjust,
  openId,
  onOpen,
  place,
}: {
  lines: DeviceLine[];
  hovered: string | null;
  onHover: (id: string | null) => void;
  onAdjust: (offenderId: string, a: DeviceAdjust) => void;
  /** The row a box on the photo asked to open. */
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** The kind of place, to name the schedule the idle figure assumes. */
  place?: "home" | "school" | "office";
}) {
  const max = Math.max(1, ...lines.map((l) => splitDollars(l.offender).total));

  if (!lines.length) {
    return (
      <div className="panel p-6 text-center text-[0.92rem] text-mist">
        Nothing left using power in what you&apos;ve added so far. That&apos;s the result you want.
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,14rem)_6.5rem_1.5rem] gap-4 border-b border-line px-4 py-2 text-[0.72rem] text-dim sm:grid">
        <span>Device</span>
        <span>
          <span className="text-cyan">Used</span> + <span className="text-ember">idle</span>
        </span>
        <span className="text-right">A year</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <Row
            key={l.offender.id}
            line={l}
            max={max}
            open={openId === l.offender.id}
            onToggle={() => onOpen(openId === l.offender.id ? null : l.offender.id)}
            highlighted={hovered === l.offender.id}
            onHover={onHover}
            onAdjust={(a) => onAdjust(l.offender.id, a)}
            place={place}
          />
        ))}
      </ul>
    </div>
  );
}

/** One device line: its name, count, state, a bar scaled to the worst line, and the yearly cost. */
function Row({
  line,
  max,
  open,
  onToggle,
  highlighted,
  onHover,
  onAdjust,
  place,
}: {
  line: DeviceLine;
  max: number;
  open: boolean;
  onToggle: () => void;
  highlighted: boolean;
  onHover: (id: string | null) => void;
  onAdjust: (a: DeviceAdjust) => void;
  place?: "home" | "school" | "office";
}) {
  const o = line.offender;
  const d = splitDollars(o);
  const color = STATE_COLOR[o.state];
  const money = (n: number) => fmtAmt(n, d.cents);
  // One line, printed once per breakpoint: the parts of the total.
  const parts = (
    <span className="text-[0.72rem] text-dim">
      <span className="text-cyan">{money(d.used)}</span> used + <span className="text-ember">{money(d.idle)}</span> idle
    </span>
  );

  return (
    <li
      id={offenderAnchor(o.id)}
      onMouseEnter={() => onHover(o.id)}
      onMouseLeave={() => onHover(null)}
      className={`scroll-mt-24 transition-colors ${highlighted ? "bg-fog/[0.04]" : ""} ${o.unverified ? "bg-amber/[0.04]" : ""}`}
    >
      <button onClick={onToggle} aria-expanded={open} className="grid w-full grid-cols-[minmax(0,1fr)_auto_1.5rem] items-center gap-3 px-4 py-3 text-left sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_6.5rem_1.5rem] sm:gap-4">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface2 text-mist">
            <DeviceGlyph icon={o.icon} className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.95rem] font-medium text-fog">
              {o.label}
              {o.count > 1 && <span className="ml-1.5 font-normal text-dim">×{o.count}</span>}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.76rem] text-dim">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.needed ? USAGE_COLOR : color }} aria-hidden />
                {o.needed ? "In use" : STATE_PLAIN[o.state]}
              </span>
              <span className="truncate">{o.source}</span>
              {o.unverified && <span className="font-medium text-amber">AI not sure · not counted</span>}
              {/* A fridge, a router or an exit sign is meant to run all night: usage, not idle. */}
              {o.needed && (
                <span className="font-medium" style={{ color: USAGE_COLOR }} title={`Still costed, but counted as usage, not idle: ${o.needed}.`}>
                  meant to run
                </span>
              )}
            </span>
            <span className="mt-0.5 block sm:hidden">{parts}</span>
          </span>
        </span>

        {/* the year, split */}
        <span className="hidden sm:block" aria-hidden>
          <span className="flex h-2.5 overflow-hidden rounded-full bg-surface2">
            <span className="h-full bg-cyan/60" style={{ width: `${(d.used / max) * 100}%` }} />
            <span className="h-full bg-ember" style={{ width: `${(d.idle / max) * 100}%` }} />
          </span>
          <span className="mt-1 block">{parts}</span>
        </span>

        <span className="text-right">
          <span className="block font-mono text-[1.02rem] font-semibold text-fog">{money(d.total)}</span>
          <span className="block text-[0.68rem] text-dim">a year</span>
        </span>
        <Icon name="chevron" className={`h-4 w-4 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Details line={line} onAdjust={onAdjust} place={place} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/**
 * A row, opened: what the model saw, the wattage and hours behind the price, the
 * efficiency verdict, and, for a line the cross-check could not confirm, the
 * question of whether it is really there.
 */
function Details({ line, onAdjust, place }: { line: DeviceLine; onAdjust: (a: DeviceAdjust) => void; place?: "home" | "school" | "office" }) {
  const o = line.offender;
  const adjust = line.adjust;
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const perUnit = o.count > 0 ? o.totalWatts / o.count : o.perUnitWatts;
  const eff = assessEfficiency(o, { ratePerKwh: o.kwhPerYear > 0 ? o.costPerYear / o.kwhPerYear : 0.15 });
  const each = o.count > 1 ? " each" : "";
  const range = idleRange(o);

  return (
    <div className="space-y-3 px-4 pb-4 sm:pl-[4.25rem]">
      {o.unverified && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber/[0.09] px-3 py-2.5 text-[0.82rem]" role="status">
          <span className="text-mist">
            The AI thought it saw this{o.modelConfidence !== undefined ? ` (${Math.round(o.modelConfidence * 100)}% sure)` : ""}, but a second check couldn&apos;t confirm it. Look at the photo: is it there?
          </span>
          <span className="ml-auto flex gap-2">
            <button onClick={() => onAdjust({ ...adjust, confirmed: true })} className="rounded-full bg-fog px-3 py-1 text-[0.78rem] font-medium text-ink">
              Yes, it&apos;s there
            </button>
            <button onClick={() => onAdjust({ ...adjust, deleted: true })} className="rounded-full border border-line px-3 py-1 text-[0.78rem] text-mist hover:border-ember hover:text-ember">
              No
            </button>
          </span>
        </div>
      )}

      {/* the year: one total, used + idle, the watts behind each */}
      <div className="rounded-xl bg-surface2/60 px-3.5 py-3">
        <CostBreakdown offender={o} place={place} />
      </div>

      {/* the fix */}
      {o.costPerYear > 0 && (
        <div className="rounded-xl border border-lime/25 bg-lime/[0.06] px-3.5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[0.9rem] font-medium text-fog">{o.action.label}</span>
            <span className="text-[0.76rem] text-lime">
              saves {fmtMoneyFull(o.annualSavings)}/yr · {o.fixCost > 0 ? `costs ${fmtMoneyFull(o.fixCost)}` : "free"} · <Term k="payback">pays back</Term> {o.paybackMonths === null ? "right away" : monthsWords(o.paybackMonths)}
            </span>
          </div>
          <p className="mt-1 text-[0.8rem] leading-relaxed text-mist">{o.action.note}</p>
        </div>
      )}

      {/* is the device itself the problem? */}
      <div className="flex gap-3 rounded-xl bg-surface2/60 px-3 py-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-base font-bold text-white"
          style={{ background: GRADE_COLOR[eff.grade] }}
          aria-label={`Efficiency grade ${eff.grade}`}
        >
          {eff.grade}
        </span>
        <div className="min-w-0 self-center text-[0.84rem] font-medium text-fog">{eff.headline}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[0.78rem] text-mist transition-colors hover:border-fog/40 hover:text-fog"
        >
          <Icon name="edit" className="h-3.5 w-3.5" />
          {editing ? "Done" : adjust && Object.values(adjust).some((v) => v !== undefined) ? "Corrected · edit" : "Something wrong? Correct it"}
        </button>
        <button onClick={() => setMore((m) => !m)} aria-expanded={more} className="rounded-full px-3 py-1.5 text-[0.78rem] text-dim hover:text-fog">
          {more ? "Hide the numbers" : "Show the numbers"}
        </button>
      </div>

      {more && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line px-3.5 py-3 text-[0.78rem] sm:grid-cols-4">
          <Num label="Power" value={`${Math.round(perUnit).toLocaleString()} W${each}, ${wattsPicture(perUnit)}`} />
          <Num label="Empty time" value={o.hoursPerYear !== undefined ? hoursPerDayWords(o.hoursPerYear) : "-"} />
          {o.typicalHoursPerDay !== undefined && (
            <Num label="In use" value={o.typicalHoursPerDay < 1 ? `${Math.round(o.typicalHoursPerDay * 60)} minutes a day` : `${o.typicalHoursPerDay.toFixed(1)} hours a day`} />
          )}
          <Num label={<>Idle energy a year (<Term k="kwh">kWh</Term>)</>} value={fmtKwh(o.kwhPerYear)} />
          <Num label={<><Term k="carbon">Carbon</Term> a year</>} value={fmtCo2(o.co2KgPerYear)} />
          <Num label="Range from wattage uncertainty" value={o.costPerYear > 0 ? `${fmtMoney(o.costLowPerYear)} to ${fmtMoney(o.costHighPerYear)}` : "$0"} />
          <Num label="Idle cost by behaviour" value={range.high > 0 ? `${fmtMoney(range.low)} asleep to ${fmtMoney(range.high)} on` : "$0"} />
          <Num label="How we know the power" value={basisWords(o)} />
          <Num label="How clear it was" value={confidenceWords(o.confidence)} />
          {/* The term nobody expects: its heat is a load on the building too. */}
          {o.hvacFactor !== undefined && o.hvacFactor !== 1 && (
            <Num
              label="Heating and cooling"
              value={`${o.hvacFactor > 1 ? "+" : ""}${Math.round((o.hvacFactor - 1) * 100)}% for its heat`}
            />
          )}
          {o.reconciledBy !== undefined && o.reconciledBy !== 1 && (
            <Num
              label="After checking the bill"
              value={`brought down ${Math.round((1 - o.reconciledBy) * 100)}%`}
            />
          )}
          {o.evidence && <Num label="What the AI saw" value={`“${o.evidence}”`} />}
          <div className="col-span-2 text-[0.76rem] leading-relaxed text-dim sm:col-span-4">{eff.detail}</div>
          {o.hvacBasis && o.hvacFactor !== undefined && o.hvacFactor !== 1 && (
            <div className="col-span-2 sm:col-span-4 text-[0.76rem] leading-relaxed text-dim">
              {o.hvacBasis}
            </div>
          )}
        </dl>
      )}

      {editing && <AdjustEditor offender={o} adjust={adjust} perUnit={perUnit} onAdjust={onAdjust} />}
    </div>
  );
}

/**
 * Corrections a person can make to one line: what the device really is, how many,
 * its wattage and its hours. Each one re-prices the line locally, without asking
 * the model again.
 */
function AdjustEditor({ offender: o, adjust, perUnit, onAdjust }: { offender: Offender; adjust?: DeviceAdjust; perUnit: number; onAdjust: (a: DeviceAdjust) => void }) {
  return (
    <div className="rounded-xl border border-line px-3.5 py-3">
      <label className="block">
        <span className="text-[0.74rem] text-dim">What it actually is</span>
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
        <AdjustField label="How many" value={adjust?.count} placeholder={String(o.count)} onChange={(v) => onAdjust({ ...adjust, count: v })} step={1} />
        <AdjustField label="Watts each" value={adjust?.watts} placeholder={String(Math.round(perUnit))} onChange={(v) => onAdjust({ ...adjust, watts: v })} />
        <AdjustField
          label="Hours on a day"
          value={adjust?.hoursPerDay}
          placeholder={o.hoursPerYear ? (o.hoursPerYear / 365).toFixed(1) : "-"}
          max={24}
          onChange={(v) => onAdjust({ ...adjust, hoursPerDay: v })}
        />
      </div>
      {o.state !== "off" && !o.hoursKnown && (
        <fieldset className="mt-2.5">
          <legend className="text-[0.74rem] text-dim">When everyone leaves, it</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(["on", "standby", "off"] as const).map((st) => {
              const current = adjust?.afterHours ?? o.afterHoursState;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => onAdjust({ ...adjust, afterHours: st })}
                  aria-pressed={current === st}
                  className={`rounded-full border px-3 py-1 text-[0.78rem] transition-colors ${
                    current === st ? "border-fog bg-fog text-ink" : "border-line text-mist hover:border-line2"
                  }`}
                >
                  {st === "on" ? "stays on" : st === "standby" ? "goes to sleep" : "gets switched off"}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[0.74rem] text-dim">The label on the back of a device, or a plug-in power meter, beats our estimate. Clear a box to go back to ours.</p>
        <button onClick={() => onAdjust({ ...adjust, deleted: true })} className="text-[0.76rem] text-dim underline-offset-4 hover:text-ember hover:underline">
          It&apos;s not here: remove it
        </button>
      </div>
    </div>
  );
}

/** One labelled figure in the opened row's numbers grid. */
function Num({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] text-dim">{label}</dt>
      <dd className="mt-0.5 text-fog">{value}</dd>
    </div>
  );
}

/** A number input for a correction; clearing it returns the line to the catalogue figure. */
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
      <span className="text-[0.74rem] text-dim">{label}</span>
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
