"use client";

// The building context strip.
//
// Every number downstream depends on four facts: where the building is (price and
// grid carbon), what kind of building it is (what to benchmark against), how big
// it is (energy per square foot), and when it is empty (the only hours phantom
// load is actually waste). The original app hard-coded all four as US averages.
// Setting them takes about fifteen seconds and changes the answer by a factor of
// three between, say, a Vermont library and a Hawaii school.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { REGIONS, regionOrDefault } from "@/lib/grid";
import { BUILDING_TYPES, BUILDING_TYPE_BY_ID } from "@/lib/benchmark";
import {
  SCHEDULE_PRESETS,
  DAY_LABELS,
  unoccupiedHours,
  vacancyFraction,
  describeSchedule,
  type WeeklySchedule,
} from "@/lib/schedule";
import { updateBuilding, setActiveBuilding, addBuilding, newBuilding } from "@/lib/useStore";
import { fmtPct } from "@/lib/energy";
import type { Building } from "@/lib/storage";

export function BuildingBar({
  building,
  buildings,
  liveRate,
  onFetchRate,
}: {
  building: Building;
  buildings: Building[];
  liveRate?: { ratePerKwh: number; source: string } | null;
  onFetchRate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const region = regionOrDefault(building.regionCode);
  const type = BUILDING_TYPE_BY_ID[building.typeId] ?? BUILDING_TYPES[0];
  const empty = Math.round(unoccupiedHours(building.schedule));

  return (
    <div className="panel">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="h-1.5 w-1.5 shrink-0 grad-energy-bg" />
          <span className="truncate font-semibold text-fog">{building.name}</span>
          <span className="hidden truncate font-mono text-[0.7rem] text-dim sm:inline">
            {type.label} · {region.code}
          </span>
        </span>
        <span className="font-mono text-xs text-mist">
          {region.ratePerKwh.toFixed(3)} $/kWh · {empty.toLocaleString()} empty h
          <span className="ml-2 text-cyan">{open ? "−" : "+"}</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="space-y-5 border-t border-line px-4 py-4">
              {/* building picker */}
              <div>
                <span className="mono-label">building</span>
                <div className="mt-1.5 flex gap-2">
                  <select
                    value={building.id}
                    onChange={(e) => setActiveBuilding(e.target.value)}
                    className="min-w-0 flex-1 border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
                  >
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id} className="bg-surface">
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => addBuilding(newBuilding(`Building ${buildings.length + 1}`))}
                    className="shrink-0 border border-line px-3 py-2 font-mono text-xs text-dim transition-colors hover:border-cyan hover:text-cyan"
                  >
                    + new
                  </button>
                </div>
                <input
                  value={building.name}
                  onChange={(e) => updateBuilding(building.id, { name: e.target.value })}
                  placeholder="Building name"
                  className="mt-2 w-full border border-line bg-surface2 px-3 py-2 text-sm text-fog outline-none focus:border-cyan"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mono-label">state / region</span>
                  <select
                    value={building.regionCode}
                    onChange={(e) => updateBuilding(building.id, { regionCode: e.target.value })}
                    className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
                  >
                    <option value="US" className="bg-surface">
                      United States (average)
                    </option>
                    {REGIONS.map((r) => (
                      <option key={r.code} value={r.code} className="bg-surface">
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block font-mono text-[0.66rem] text-dim">
                    {region.ratePerKwh.toFixed(3)} $/kWh · {region.co2PerKwh.toFixed(3)} kg CO₂/kWh
                    {region.subregion !== "US" && ` · eGRID ${region.subregion}`}
                  </span>
                </label>

                <label className="block">
                  <span className="mono-label">building type</span>
                  <select
                    value={building.typeId}
                    onChange={(e) => updateBuilding(building.id, { typeId: e.target.value })}
                    className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
                  >
                    {BUILDING_TYPES.map((t) => (
                      <option key={t.id} value={t.id} className="bg-surface">
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block font-mono text-[0.66rem] text-dim">
                    median {type.medianEui} kBtu/sq ft/yr · {fmtPct(type.plugLoadShare)} plug load
                  </span>
                </label>

                <label className="block">
                  <span className="mono-label">floor area (sq ft)</span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={building.floorAreaSqFt || ""}
                    placeholder="optional - enables benchmarking"
                    onChange={(e) =>
                      updateBuilding(building.id, {
                        floorAreaSqFt: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
                  />
                </label>

                {onFetchRate && (
                  <div className="block">
                    <span className="mono-label">live rate lookup</span>
                    <button
                      onClick={onFetchRate}
                      className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 text-left font-mono text-sm text-mist transition-colors hover:border-cyan hover:text-cyan"
                    >
                      {liveRate
                        ? `${liveRate.ratePerKwh.toFixed(3)} $/kWh`
                        : "check published price →"}
                    </button>
                    <span className="mt-1 block truncate font-mono text-[0.66rem] text-dim">
                      {liveRate?.source ?? "uses EIA when a key is configured"}
                    </span>
                  </div>
                )}
              </div>

              {/* schedule */}
              <ScheduleEditor
                schedule={building.schedule}
                onChange={(schedule) => updateBuilding(building.id, { schedule })}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * When is the building empty?
 *
 * This is the single most leveraged input in the whole app, and the original
 * version was one number in a text box that nobody would ever have a reason to
 * trust. Drawing the week as seven bars makes the assumption inspectable: you can
 * see at a glance that the model thinks the building is dark all weekend, and if
 * that is wrong you can see that too.
 */
export function ScheduleEditor({
  schedule,
  onChange,
}: {
  schedule: WeeklySchedule;
  onChange: (s: WeeklySchedule) => void;
}) {
  const empty = Math.round(unoccupiedHours(schedule));
  const vacancy = vacancyFraction(schedule);

  function setDay(i: number, hours: number) {
    const next = [...schedule.hoursPerDay] as WeeklySchedule["hoursPerDay"];
    next[i] = Math.max(0, Math.min(24, hours));
    onChange({ ...schedule, hoursPerDay: next });
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="mono-label">occupied hours</span>
        <span className="font-mono text-[0.7rem] text-cyan tabular-nums">
          empty {empty.toLocaleString()} h/yr · {fmtPct(vacancy)} of the year
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SCHEDULE_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.schedule)}
            title={p.description}
            className="border border-line px-2 py-1 font-mono text-[0.66rem] text-dim transition-colors hover:border-cyan hover:text-cyan"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-end gap-1.5">
        {schedule.hoursPerDay.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-mono text-[0.6rem] text-dim tabular-nums">{h}</span>
            <div className="flex h-20 w-full items-end bg-surface2">
              <div
                className="grow-y w-full"
                style={
                  {
                    height: `${(h / 24) * 100}%`,
                    background:
                      h === 0
                        ? "var(--color-line2)"
                        : "linear-gradient(180deg,var(--color-cyan),var(--color-cyan-deep))",
                    "--i": i,
                  } as React.CSSProperties
                }
              />
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={h}
              onChange={(e) => setDay(i, Number(e.target.value))}
              aria-label={`Occupied hours on ${DAY_LABELS[i]}`}
              className="w-full cursor-pointer appearance-none bg-transparent accent-cyan"
            />
            <span className="font-mono text-[0.6rem] text-dim">{DAY_LABELS[i]}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mono-label">operating weeks / yr</span>
          <input
            type="number"
            min={1}
            max={52}
            value={schedule.operatingWeeks}
            onChange={(e) =>
              onChange({
                ...schedule,
                operatingWeeks: Math.max(1, Math.min(52, Number(e.target.value) || 1)),
              })
            }
            className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
          />
        </label>
        <label className="block">
          <span className="mono-label">extra closed days</span>
          <input
            type="number"
            min={0}
            max={200}
            value={schedule.closedDays}
            onChange={(e) =>
              onChange({ ...schedule, closedDays: Math.max(0, Number(e.target.value) || 0) })
            }
            className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
          />
        </label>
      </div>

      <p className="mt-2 text-[0.72rem] leading-relaxed text-dim">{describeSchedule(schedule)}</p>
    </div>
  );
}
