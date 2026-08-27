"use client";

// What it is doing outside, and what that says about the HVAC findings.
//
// An audit that reports "space heater, 1500W, running" is telling the truth and
// missing the point. In January that is a building with a cold room and a
// documented reason for the heater. In August it is money being set on fire, and
// the recommendation should not be the same in both cases.
//
// This panel is deliberately narrow: it does not adjust any number in the report.
// It supplies the one piece of context a person needs to read the HVAC rows
// correctly, and it says which rows it is talking about.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Offender } from "@/lib/types";

interface WeatherResponse {
  status: "live" | "static" | "error";
  tempF?: number;
  feelsLikeF?: number;
  humidity?: number;
  conditions?: string;
  place?: string;
  hdd?: number;
  cdd?: number;
  hvacVerdict?: "heating" | "cooling" | "neither";
  source: string;
  note?: string;
}

/** Device groups whose findings the weather actually bears on. */
const CLIMATE_GROUPS = new Set(["hvac"]);

export function WeatherContext({
  lat,
  lon,
  offenders,
}: {
  lat?: number;
  lon?: number;
  offenders: Offender[];
}) {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const has = typeof lat === "number" && typeof lon === "number";

  useEffect(() => {
    if (!has) return;
    let alive = true;
    setData(null);
    fetch(`/api/weather?lat=${lat}&lon=${lon}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: WeatherResponse) => alive && setData(d))
      .catch(() =>
        alive && setData({ status: "error", source: "Weather lookup failed" }),
      );
    return () => {
      alive = false;
    };
  }, [lat, lon, has]);

  // No location set: invite it once, quietly, and take up no more room than that.
  if (!has) {
    return (
      <section className="panel px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-fog">Outdoor conditions</h3>
          <span className="mono-label">no location set</span>
        </div>
        <p className="mt-1.5 text-[0.82rem] leading-relaxed text-dim">
          Add coordinates to this building in Settings and the HVAC rows get read against what it
          is actually doing outside — a heater running in August is a different finding from the
          same heater in January.
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="panel px-5 py-4 sm:px-6">
        <div className="h-4 w-36 animate-pulse bg-surface2" />
        <div className="mt-3 h-10 w-full animate-pulse bg-surface2/60" />
      </section>
    );
  }

  if (data.status !== "live" || typeof data.tempF !== "number") {
    return (
      <section className="panel px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-fog">Outdoor conditions</h3>
          <span className="mono-label text-amber">unavailable</span>
        </div>
        <p className="mt-1.5 text-[0.82rem] leading-relaxed text-dim">
          {data.note ?? data.source}. No figure in the report depends on this.
        </p>
      </section>
    );
  }

  const climate = offenders.filter((o) => CLIMATE_GROUPS.has(o.group ?? ""));
  const climateCost = climate.reduce((s, o) => s + o.costPerYear, 0);
  const verdict = data.hvacVerdict ?? "neither";

  const tint =
    verdict === "heating"
      ? "var(--color-ember)"
      : verdict === "cooling"
        ? "var(--color-cyan)"
        : "var(--color-lime)";

  return (
    <section className="panel ticked @container overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-fog">Outdoor conditions</h3>
          <p className="mt-0.5 truncate text-sm text-mist">
            {data.place ?? "this location"}
            {data.conditions ? ` · ${data.conditions}` : ""}
          </p>
        </div>
        <span className="mono-label">OpenWeather</span>
      </header>

      <div className="grid gap-px bg-line @lg:grid-cols-4">
        <Cell label="outside" value={`${Math.round(data.tempF)}°F`} tint={tint} />
        <Cell
          label="feels like"
          value={
            typeof data.feelsLikeF === "number" ? `${Math.round(data.feelsLikeF)}°F` : "—"
          }
        />
        <Cell
          label="humidity"
          value={typeof data.humidity === "number" ? `${data.humidity}%` : "—"}
        />
        <Cell
          label={verdict === "heating" ? "heating degrees" : "cooling degrees"}
          value={`${Math.round(Math.max(data.hdd ?? 0, data.cdd ?? 0))}`}
        />
      </div>

      <div className="p-5 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-l-2 px-4 py-3"
          style={{ borderColor: tint, background: "color-mix(in srgb, var(--color-surface2) 60%, transparent)" }}
        >
          <p className="text-[0.86rem] leading-relaxed text-mist">{sentence(verdict, data, climate.length)}</p>
        </motion.div>

        {climate.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {climate.map((o) => (
              <li
                key={o.id}
                className="flex items-baseline justify-between gap-3 border border-line bg-surface2/30 px-3 py-2"
              >
                <span className="truncate text-sm text-fog">{o.label}</span>
                <span className="shrink-0 font-mono text-[0.72rem] text-dim tabular-nums">
                  ${Math.round(o.costPerYear).toLocaleString()}/yr
                </span>
              </li>
            ))}
          </ul>
        )}

        {climate.length > 0 && climateCost > 0 && (
          <p className="mt-3 font-mono text-[0.7rem] leading-relaxed text-dim">
            ${Math.round(climateCost).toLocaleString()}/yr of the total sits in climate equipment.
            The weather does not change that arithmetic — it changes how defensible the equipment
            being on is.
          </p>
        )}

        <p className="mt-3 font-mono text-[0.7rem] leading-relaxed text-dim">
          Degree days are base 65°F, the convention the EIA uses, so these are comparable with
          published building-energy figures.
        </p>
      </div>
    </section>
  );
}

function sentence(
  verdict: "heating" | "cooling" | "neither",
  data: WeatherResponse,
  climateCount: number,
): string {
  const t = Math.round(data.tempF ?? 0);

  if (climateCount === 0) {
    return verdict === "neither"
      ? `It is ${t}°F outside — mild enough that neither heating nor cooling is called for. This audit found no climate equipment running, which is the right answer for the day.`
      : `It is ${t}°F outside. This audit found no climate equipment running, so nothing here needs weather context.`;
  }

  if (verdict === "neither") {
    return `It is ${t}°F outside — inside the comfort band where a building should need neither heating nor cooling. Any climate equipment found running below is running for no weather-driven reason, which usually means a thermostat or a schedule rather than a person.`;
  }
  if (verdict === "cooling") {
    return `It is ${t}°F outside, ${Math.round(data.cdd ?? 0)} degrees above the 65°F base. Cooling is legitimate today; a space heater found running is not, and should be treated as a fault rather than a habit.`;
  }
  return `It is ${t}°F outside, ${Math.round(data.hdd ?? 0)} degrees below the 65°F base. Heating is legitimate today — the question for the rows below is whether it is heating an occupied room or an empty one.`;
}

function Cell({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="bg-ink px-4 py-3">
      <div className="mono-label min-h-[2.1em] leading-snug text-balance">{label}</div>
      <div
        className="mt-0.5 font-mono text-xl font-bold text-fog tabular-nums"
        style={tint ? { color: tint } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
