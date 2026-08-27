"use client";

// The grid, as it actually was over the last three days.
//
// Every other number in Ghost Watt answers "how much". This panel answers "when",
// and it is the only part of the app that can tell a facilities manager something
// they could not have worked out with a clipboard: that the identical kilowatt-hour
// is worth a different amount of carbon depending on the hour it is burned.
//
// The data is EIA-930, the hourly grid monitor - generation by fuel type, per
// balancing authority, per hour, free with the same EIA key the price lookup uses.
// Intensity is computed here from the mix rather than taken from a vendor, so the
// arithmetic is inspectable on the methodology page like everything else.
//
// A note on honesty: the feed lags real time by up to a day and the lag varies by
// operator. Calling this "live" would be a small lie, so the panel always stamps
// the hour it is actually showing and describes the window as recent, not current.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FUEL_COLORS, type HourlyMix } from "@/lib/balancing";
import { regionOrDefault } from "@/lib/grid";

interface CarbonResponse {
  status: "live" | "static" | "error";
  co2PerKwh: number;
  cleanShare?: number;
  source: string;
  note?: string;
  zone?: string;
  authority?: { code: string; name: string };
  mix?: HourlyMix[];
  best?: { period: string; co2PerKwh: number };
  worst?: { period: string; co2PerKwh: number };
}

/** "2026-08-22T06" is a UTC stamp. Render it in the viewer's own clock. */
function localHourLabel(period: string): string {
  const d = new Date(`${period.length === 13 ? period : period.slice(0, 13)}:00:00Z`);
  if (Number.isNaN(d.getTime())) return period;
  return d.toLocaleTimeString([], { hour: "numeric", hour12: true });
}

function localDayHour(period: string): string {
  const d = new Date(`${period.slice(0, 13)}:00:00Z`);
  if (Number.isNaN(d.getTime())) return period;
  return d.toLocaleString([], { weekday: "short", hour: "numeric", hour12: true });
}

function g(co2PerKwh: number): string {
  return `${Math.round(co2PerKwh * 1000)}`;
}

export function GridPulse({
  regionCode,
  annualKwhWasted,
}: {
  regionCode: string;
  /** Wasted kWh per year from the current audit, so the swing has a dollar-shaped meaning. */
  annualKwhWasted: number;
}) {
  const [data, setData] = useState<CarbonResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    fetch(`/api/grid?zone=${encodeURIComponent(regionCode)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: CarbonResponse) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [regionCode]);

  const region = regionOrDefault(regionCode);

  if (failed) {
    return (
      <section className="panel p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-fog">Grid conditions</h3>
        <p className="mt-2 text-sm text-dim">
          Could not reach the grid feed. Every figure elsewhere in this report uses the stored
          eGRID average for {region.name}, so nothing is missing - only the hourly detail.
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="panel p-5 sm:p-6">
        <div className="h-4 w-40 animate-pulse bg-surface2" />
        <div className="mt-4 h-24 w-full animate-pulse bg-surface2/60" />
      </section>
    );
  }

  const mix = data.mix ?? [];
  const latest = mix[0];

  // No hourly data: say what is being used instead, plainly.
  if (data.status !== "live" || !latest) {
    return (
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-fog">Grid conditions</h3>
          <span className="mono-label">annual average</span>
        </div>
        <p className="mt-3 font-mono text-3xl font-bold text-fog tabular-nums">
          {g(data.co2PerKwh)}
          <span className="ml-1.5 text-sm font-normal text-dim">gCO₂e / kWh</span>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-mist">{data.source}.</p>
        {data.note && <p className="mt-2 text-[0.8rem] leading-relaxed text-dim">{data.note}</p>}
      </section>
    );
  }

  const best = data.best;
  const worst = data.worst;
  const swing = best && worst && best.co2PerKwh > 0 ? worst.co2PerKwh / best.co2PerKwh : 1;

  // What the timing choice is worth on this building's own wasted energy.
  const kgAtWorst = annualKwhWasted * (worst?.co2PerKwh ?? latest.co2PerKwh);
  const kgAtBest = annualKwhWasted * (best?.co2PerKwh ?? latest.co2PerKwh);
  const kgSwing = Math.max(0, kgAtWorst - kgAtBest);

  const vsAnnual = (latest.co2PerKwh - region.co2PerKwh) / Math.max(0.001, region.co2PerKwh);

  const maxIntensity = Math.max(...mix.map((h) => h.co2PerKwh), 0.0001);
  // Oldest to newest reads left to right, the way a chart is expected to.
  const series = [...mix].reverse();

  return (
    <section className="panel ticked @container overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-fog sm:text-xl">
            The grid you are plugged into
          </h3>
          <p className="mt-0.5 truncate text-sm text-mist">
            {data.authority?.name ?? data.zone} · {region.name}
          </p>
        </div>
        <span className="mono-label text-lime">EIA hourly grid monitor</span>
      </header>

      <div className="p-5 sm:p-6">
        {/* ---- headline ---- */}
        <div className="grid gap-4 @lg:grid-cols-3">
          <Stat
            label={`most recent hour · ${localDayHour(latest.period)}`}
            value={g(latest.co2PerKwh)}
            unit="gCO₂e/kWh"
            tint="var(--color-lime)"
          />
          <Stat
            label="carbon-free right then"
            value={`${Math.round(latest.cleanShare * 100)}`}
            unit="% of generation"
            tint="var(--color-cyan)"
          />
          <Stat
            label={`vs the ${region.name} annual average`}
            value={`${vsAnnual >= 0 ? "+" : ""}${Math.round(vsAnnual * 100)}`}
            unit="%"
            tint={vsAnnual > 0 ? "var(--color-ember)" : "var(--color-lime)"}
          />
        </div>

        {/* ---- fuel mix ---- */}
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="mono-label">what was burning</span>
            <span className="font-mono text-[0.66rem] text-dim tabular-nums">
              {Math.round(latest.totalMwh).toLocaleString()} MWh that hour
            </span>
          </div>

          <div className="mt-2.5 flex h-7 w-full overflow-hidden border border-line">
            {latest.slices.map((s, i) => (
              <motion.div
                key={s.fuel}
                initial={{ width: 0 }}
                animate={{ width: `${s.share * 100}%` }}
                transition={{ duration: 0.6, delay: i * 0.04, ease: "easeOut" }}
                title={`${s.label}: ${Math.round(s.mwh).toLocaleString()} MWh (${Math.round(s.share * 100)}%)`}
                style={{ background: FUEL_COLORS[s.fuel] ?? "#6a6a72" }}
              />
            ))}
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {latest.slices
              .filter((s) => s.share >= 0.01)
              .map((s) => (
                <li key={s.fuel} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0"
                    style={{ background: FUEL_COLORS[s.fuel] ?? "#6a6a72" }}
                  />
                  <span className="text-[0.76rem] text-mist">{s.label}</span>
                  <span className="font-mono text-[0.68rem] text-dim tabular-nums">
                    {Math.round(s.share * 100)}%
                  </span>
                </li>
              ))}
          </ul>
        </div>

        {/* ---- the 72-hour shape ---- */}
        <div className="mt-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="mono-label">carbon intensity, last {series.length} hours</span>
            <span className="font-mono text-[0.66rem] text-dim">
              cleanest {best ? localHourLabel(best.period) : "-"} · dirtiest{" "}
              {worst ? localHourLabel(worst.period) : "-"}
            </span>
          </div>

          <div className="mt-2.5 flex h-24 items-end gap-px border-b border-line">
            {series.map((h, i) => {
              const isBest = best && h.period === best.period;
              const isWorst = worst && h.period === worst.period;
              return (
                <motion.div
                  key={h.period}
                  initial={{ height: 0 }}
                  animate={{ height: `${(h.co2PerKwh / maxIntensity) * 100}%` }}
                  transition={{ duration: 0.4, delay: Math.min(0.5, i * 0.006) }}
                  title={`${localDayHour(h.period)} · ${g(h.co2PerKwh)} gCO₂e/kWh · ${Math.round(h.cleanShare * 100)}% carbon-free`}
                  className="min-w-0 flex-1"
                  style={{
                    background: isBest
                      ? "var(--color-cyan)"
                      : isWorst
                        ? "var(--color-ember)"
                        : "var(--color-line2)",
                  }}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[0.62rem] text-dim">
            <span>{localDayHour(series[0].period)}</span>
            <span>{localDayHour(series[series.length - 1].period)}</span>
          </div>
        </div>

        {/* ---- the point ---- */}
        {swing > 1.05 && (
          <div className="mt-6 border-l-2 border-cyan bg-cyan/5 px-4 py-3">
            <p className="text-[0.86rem] leading-relaxed text-mist">
              Over these {series.length} hours the grid swung by{" "}
              <strong className="font-semibold text-cyan">{swing.toFixed(1)}×</strong> — from{" "}
              {g(best!.co2PerKwh)} gCO₂e/kWh at {localHourLabel(best!.period)} to{" "}
              {g(worst!.co2PerKwh)} at {localHourLabel(worst!.period)}. A kilowatt-hour is the
              same kilowatt-hour; the hour it is burned in is not.
              {annualKwhWasted > 0 && kgSwing > 1 && (
                <>
                  {" "}
                  For the {Math.round(annualKwhWasted).toLocaleString()} kWh this audit found
                  going to waste, that timing difference alone is worth{" "}
                  <strong className="font-semibold text-cyan">
                    {Math.round(kgSwing).toLocaleString()} kg CO₂e a year
                  </strong>
                  .
                </>
              )}
            </p>
          </div>
        )}

        <p className="mt-4 font-mono text-[0.7rem] leading-relaxed text-dim">
          {data.source}. Intensity is computed from the published fuel mix using EPA
          generation-side emission factors — the arithmetic is on the methodology page. The feed
          lags real time by several hours and the lag differs per operator, so this is the most
          recent hour published, not the current one.
        </p>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  tint,
}: {
  label: string;
  value: string;
  unit: string;
  tint: string;
}) {
  return (
    <div className="border border-line bg-surface2/40 px-4 py-3">
      <div className="mono-label min-h-[2.1em] leading-snug text-balance">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold tabular-nums" style={{ color: tint }}>
        {value}
        <span className="ml-1.5 text-[0.7rem] font-normal text-dim">{unit}</span>
      </div>
    </div>
  );
}
