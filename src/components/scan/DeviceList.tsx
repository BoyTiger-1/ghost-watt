"use client";

// Every device found, one short row each, most wasteful first.
//
// A row says what it is, what it's doing and what it wastes, with a bar so the
// order reads at a glance. Opening it gives the rest in plain sentences: how
// much power, when, the fix and what it pays back, and, for anyone who wants
// them, the raw figures and a way to correct what the AI got wrong.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DeviceGlyph } from "../DeviceGlyph";
import { offenderAnchor } from "../DetectionView";
import { GRADE_COLOR } from "../EfficiencyPanel";
import { fmtCo2, fmtKwh, fmtMoney, fmtMoneyFull } from "@/lib/energy";
import { assessEfficiency } from "@/lib/efficiency";
import { DEVICE_CATALOG } from "@/lib/devices";
import type { DeviceAdjust } from "@/lib/capture";
import type { Offender } from "@/lib/types";
import { Icon } from "./icons";
import { Term } from "./Term";
import { STATE_COLOR, STATE_PLAIN, afterHoursWords, basisWords, confidenceWords, hoursPerDayWords, monthsWords, wattsPicture } from "./plain";

export interface DeviceLine {
  offender: Offender;
  adjust?: DeviceAdjust;
}

export function DeviceList({
  lines,
  hovered,
  onHover,
  onAdjust,
  openId,
  onOpen,
}: {
  lines: DeviceLine[];
  hovered: string | null;
  onHover: (id: string | null) => void;
  onAdjust: (offenderId: string, a: DeviceAdjust) => void;
  /** The row a box on the photo asked to open. */
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const max = Math.max(1, ...lines.map((l) => l.offender.annualCostPerYear ?? l.offender.costPerYear));

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
          Yearly cost: <span className="text-cyan">needed</span> + <span className="text-ember">wasted</span>
        </span>
        <span className="text-right">Wasted a year</span>
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
          />
        ))}
      </ul>
    </div>
  );
}

function Row({
  line,
  max,
  open,
  onToggle,
  highlighted,
  onHover,
  onAdjust,
}: {
  line: DeviceLine;
  max: number;
  open: boolean;
  onToggle: () => void;
  highlighted: boolean;
  onHover: (id: string | null) => void;
  onAdjust: (a: DeviceAdjust) => void;
}) {
  const o = line.offender;
  const annual = o.annualCostPerYear ?? o.costPerYear;
  const needed = Math.max(0, annual - o.costPerYear);
  const color = STATE_COLOR[o.state];

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
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
                {STATE_PLAIN[o.state]}
              </span>
              <span className="truncate">{o.source}</span>
              {o.unverified && <span className="font-medium text-amber">AI not sure · not counted</span>}
            </span>
          </span>
        </span>

        {/* the year, split */}
        <span className="hidden sm:block" aria-hidden>
          <span className="flex h-2.5 overflow-hidden rounded-full bg-surface2">
            <span className="h-full bg-cyan/60" style={{ width: `${(needed / max) * 100}%` }} />
            <span className="h-full bg-ember" style={{ width: `${(o.costPerYear / max) * 100}%` }} />
          </span>
          <span className="mt-1 block text-[0.7rem] text-dim">{fmtMoney(annual)} a year in all</span>
        </span>

        <span className="text-right">
          <span className={`block font-mono text-[1.02rem] font-semibold ${o.costPerYear > 0 ? "text-ember" : "text-dim"}`}>{o.costPerYear > 0 ? fmtMoneyFull(o.costPerYear) : "$0"}</span>
          <span className="block text-[0.68rem] text-dim sm:hidden">wasted / yr</span>
        </span>
        <Icon name="chevron" className={`h-4 w-4 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Details line={line} onAdjust={onAdjust} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function Details({ line, onAdjust }: { line: DeviceLine; onAdjust: (a: DeviceAdjust) => void }) {
  const o = line.offender;
  const adjust = line.adjust;
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const perUnit = o.count > 0 ? o.totalWatts / o.count : o.perUnitWatts;
  const eff = assessEfficiency(o, { ratePerKwh: o.kwhPerYear > 0 ? o.costPerYear / o.kwhPerYear : 0.15 });
  const each = o.count > 1 ? " each" : "";

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

      {/* the three things to know */}
      <div className="grid gap-2 sm:grid-cols-3">
        <Fact title="How much power">
          About {Math.round(perUnit).toLocaleString()} <Term k="watt">watts</Term>
          {each}, {wattsPicture(perUnit)}.
        </Fact>
        <Fact title="When the room is empty">
          {o.state === "off" ? "It's off, so it costs nothing then." : afterHoursWords(o)}
          {o.hoursPerYear !== undefined && o.state !== "off" && <> That&apos;s about {hoursPerDayWords(o.hoursPerYear)} of <Term k="empty">empty time</Term>.</>}
        </Fact>
        <Fact title="In normal use">
          {o.typicalCostPerYear !== undefined ? (
            <>
              Costs {fmtMoneyFull(o.typicalCostPerYear)} a year while people use it
              {o.typicalHoursPerDay !== undefined ? ` (about ${o.typicalHoursPerDay < 1 ? `${Math.round(o.typicalHoursPerDay * 60)} minutes` : `${o.typicalHoursPerDay.toFixed(1)} hours`} a day)` : ""}. That part is fine.
            </>
          ) : (
            "We don't have a typical-use figure for this one."
          )}
        </Fact>
      </div>

      {/* the fix */}
      {o.costPerYear > 0 && (
        <div className="rounded-xl border border-lime/25 bg-lime/[0.06] px-3.5 py-3">
          <div className="text-[0.74rem] font-medium text-lime">The fix</div>
          <p className="mt-0.5 text-[0.92rem] font-medium text-fog">{o.action.label}</p>
          <p className="mt-0.5 text-[0.82rem] leading-relaxed text-mist">{o.action.note}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[0.76rem]">
            <Pill>Costs {o.fixCost > 0 ? fmtMoneyFull(o.fixCost) : "nothing"}</Pill>
            <Pill>Saves {fmtMoneyFull(o.annualSavings)} a year</Pill>
            <Pill>
              <Term k="payback">Pays for itself</Term> {o.paybackMonths === null ? "right away" : `in ${monthsWords(o.paybackMonths)}`}
            </Pill>
          </div>
        </div>
      )}

      {/* is the device itself the problem? */}
      <div className="flex gap-3 rounded-xl bg-surface2/60 px-3 py-2.5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-base font-bold text-white"
          style={{ background: GRADE_COLOR[eff.grade] }}
          aria-label={`Efficiency grade ${eff.grade}`}
        >
          {eff.grade}
        </span>
        <div className="min-w-0">
          <div className="text-[0.84rem] font-medium text-fog">{eff.headline}</div>
          <p className="mt-0.5 text-[0.78rem] leading-relaxed text-mist">{eff.detail}</p>
        </div>
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
          <Num label={<>Energy wasted a year (<Term k="kwh">kWh</Term>)</>} value={fmtKwh(o.kwhPerYear)} />
          <Num label={<><Term k="carbon">Carbon</Term> a year</>} value={fmtCo2(o.co2KgPerYear)} />
          <Num label="Cost range" value={o.costPerYear > 0 ? `${fmtMoney(o.costLowPerYear)} to ${fmtMoney(o.costHighPerYear)}` : "$0"} />
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

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface2/60 px-3 py-2.5">
      <div className="text-[0.72rem] font-medium text-dim">{title}</div>
      <p className="mt-0.5 text-[0.84rem] leading-relaxed text-fog">{children}</p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2.5 py-1 text-fog">{children}</span>;
}

function Num({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] text-dim">{label}</dt>
      <dd className="mt-0.5 text-fog">{value}</dd>
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
