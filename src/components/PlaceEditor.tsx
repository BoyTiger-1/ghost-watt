"use client";

// Everything about a place that changes its numbers, in plain words: what it's
// called, what kind of place it is, which state (that sets the price of
// electricity), how big, when people are there, and the electric bill if you
// have one. Changes save as you type.

import { forwardRef } from "react";
import { REGIONS, regionOrDefault } from "@/lib/grid";
import { BUILDING_TYPES, BUILDING_TYPE_BY_ID } from "@/lib/benchmark";
import { SCHEDULE_PRESETS, DAY_LABELS, unoccupiedHours, vacancyFraction, type WeeklySchedule } from "@/lib/schedule";
import { updateBuilding } from "@/lib/useStore";
import { fmtPct } from "@/lib/energy";
import type { Building } from "@/lib/storage";
import { BillScan } from "./BillScan";

const input =
  "mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-fog outline-none placeholder:text-dim/60 focus:border-cyan";

export const PlaceEditor = forwardRef<HTMLInputElement, { building: Building }>(function PlaceEditor({ building }, nameRef) {
  const region = regionOrDefault(building.regionCode);
  const type = BUILDING_TYPE_BY_ID[building.typeId] ?? BUILDING_TYPES[0];
  const set = (patch: Partial<Building>) => updateBuilding(building.id, patch);
  const bill = building.bill;

  return (
    <div className="space-y-6">
      <Section title="Name">
        <input ref={nameRef} value={building.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Our house, Lincoln Elementary" className={input} />
      </Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="What kind of place" hint="Sets how many hours a day things are typically used.">
          <select
            value={building.typeId}
            onChange={(e) => {
              const t = BUILDING_TYPE_BY_ID[e.target.value];
              const preset = SCHEDULE_PRESETS.find((p) => p.id === t?.schedulePreset);
              set({ typeId: e.target.value, ...(preset ? { schedule: preset.schedule } : {}) });
            }}
            className={input}
          >
            {BUILDING_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Section>

        <Section title="State" hint={`Electricity here averages $${region.ratePerKwh.toFixed(2)} per kilowatt-hour.`}>
          <select value={building.regionCode} onChange={(e) => set({ regionCode: e.target.value })} className={input}>
            <option value="US">United States (average)</option>
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </Section>
      </div>

      <Section title="Size in square feet (optional)" hint={`Lets us compare it with a typical ${type.label.toLowerCase()} its size.`}>
        <input
          type="number"
          min={0}
          step={100}
          value={building.floorAreaSqFt || ""}
          placeholder="e.g. 1,800 for a house"
          onChange={(e) => set({ floorAreaSqFt: parseFloat(e.target.value) || 0 })}
          className={input}
        />
      </Section>

      <Section title="When people are here" hint="Anything left on outside these hours counts as wasted.">
        <ScheduleEditor schedule={building.schedule} onChange={(schedule) => set({ schedule })} />
      </Section>

      <Section title="Your electric bill (optional)" hint="Three numbers off one bill give the exact price you pay. That beats every estimate.">
        <div className="mt-1.5 grid gap-3 sm:grid-cols-3">
          <BillField label="Electricity used (kWh)" value={bill?.kwh} onChange={(kwh) => set({ bill: { kwh, dollars: bill?.dollars ?? 0, days: bill?.days ?? 30, periodEnd: bill?.periodEnd ?? "" } })} />
          <BillField label="Total charged ($)" value={bill?.dollars} onChange={(dollars) => set({ bill: { kwh: bill?.kwh ?? 0, dollars, days: bill?.days ?? 30, periodEnd: bill?.periodEnd ?? "" } })} />
          <BillField label="Days on the bill" value={bill?.days} onChange={(days) => set({ bill: { kwh: bill?.kwh ?? 0, dollars: bill?.dollars ?? 0, days, periodEnd: bill?.periodEnd ?? "" } })} />
        </div>
        {bill && bill.kwh > 0 && bill.dollars > 0 ? (
          <p className="mt-2 text-[0.84rem] text-lime">
            You pay ${(bill.dollars / bill.kwh).toFixed(3)} per kilowatt-hour. Every number for this place now uses it.{" "}
            <button onClick={() => set({ bill: undefined })} className="text-dim underline-offset-4 hover:text-fog hover:underline">
              Remove
            </button>
          </p>
        ) : null}
        <div className="mt-3">
          <BillScan onAccept={(b) => set({ bill: b })} />
        </div>
      </Section>
    </div>
  );
});

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[0.9rem] font-medium text-fog">{title}</h4>
      {hint && <p className="mt-0.5 text-[0.8rem] leading-relaxed text-dim">{hint}</p>}
      {children}
    </section>
  );
}

function BillField({ label, value, onChange }: { label: string; value?: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[0.78rem] text-dim">{label}</span>
      <input type="number" min={0} step="any" value={value || ""} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className={input} />
    </label>
  );
}

/**
 * When is the place empty? Drawn as seven bars, one per day, so the assumption
 * can be seen and dragged into shape. It's the most important input in the app:
 * only empty hours count as waste.
 */
export function ScheduleEditor({ schedule, onChange }: { schedule: WeeklySchedule; onChange: (s: WeeklySchedule) => void }) {
  const empty = Math.round(unoccupiedHours(schedule));
  const vacancy = vacancyFraction(schedule);

  function setDay(i: number, hours: number) {
    const next = [...schedule.hoursPerDay] as WeeklySchedule["hoursPerDay"];
    next[i] = Math.max(0, Math.min(24, hours));
    onChange({ ...schedule, hoursPerDay: next });
  }

  return (
    <div className="mt-2 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap gap-1.5">
        {SCHEDULE_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.schedule)}
            title={p.description}
            className="rounded-full border border-line px-3 py-1 text-[0.78rem] text-mist transition-colors hover:border-fog/40 hover:text-fog"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-end gap-1.5">
        {schedule.hoursPerDay.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-mono text-[0.66rem] text-dim tabular-nums">{h}h</span>
            <div className="flex h-20 w-full items-end overflow-hidden rounded-md bg-surface2">
              <div className="w-full rounded-md" style={{ height: `${(h / 24) * 100}%`, background: h === 0 ? "var(--color-line2)" : "var(--color-cyan)" }} />
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={h}
              onChange={(e) => setDay(i, Number(e.target.value))}
              aria-label={`Hours people are here on ${DAY_LABELS[i]}`}
              className="w-full cursor-pointer appearance-none bg-transparent accent-cyan"
            />
            <span className="text-[0.7rem] text-dim">{DAY_LABELS[i]}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[0.78rem] text-dim">Weeks a year it&apos;s open</span>
          <input
            type="number"
            min={1}
            max={52}
            value={schedule.operatingWeeks}
            onChange={(e) => onChange({ ...schedule, operatingWeeks: Math.max(1, Math.min(52, Number(e.target.value) || 1)) })}
            className={input}
          />
        </label>
        <label className="block">
          <span className="text-[0.78rem] text-dim">Extra days closed (holidays)</span>
          <input
            type="number"
            min={0}
            max={200}
            value={schedule.closedDays}
            onChange={(e) => onChange({ ...schedule, closedDays: Math.max(0, Number(e.target.value) || 0) })}
            className={input}
          />
        </label>
      </div>

      <p className="mt-3 text-[0.82rem] text-mist">
        Empty about <strong className="font-semibold text-fog">{empty.toLocaleString()} hours a year</strong>, or {fmtPct(vacancy)} of the time.
      </p>
    </div>
  );
}
