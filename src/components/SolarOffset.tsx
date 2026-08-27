"use client";

// The array that cancels the waste.
//
// Every other panel in this report tells a school what it is losing. This one is
// the only place the app proposes spending money, so it is deliberately the most
// conservative thing here: it holds the electricity rate flat for 25 years, applies
// linear module degradation, discounts nothing, and sizes the array against the
// audit's own measured waste rather than against total building load.
//
// Sizing against the waste is the point. "Solarise the school" is a bond measure.
// "Seventeen kilowatts on the gym roof cancels the after-hours draw we photographed"
// is a line item, and a line item is a thing that actually gets approved.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  COST_PER_WATT,
  FEDERAL_CREDIT,
  WARRANTY_YEARS,
  sizeArray,
  type SolarEstimate,
} from "@/lib/solar";

const money = (n: number) =>
  n >= 10000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n).toLocaleString()}`;

const exact = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function SolarOffset({
  lat,
  lon,
  regionCode,
  annualKwhWasted,
  ratePerKwh,
  co2PerKwh,
}: {
  lat?: number;
  lon?: number;
  regionCode: string;
  annualKwhWasted: number;
  ratePerKwh: number;
  co2PerKwh: number;
}) {
  const [data, setData] = useState<SolarEstimate | null>(null);
  const [failed, setFailed] = useState(false);
  /** How much of the waste to offset, 0-1.5. Starts at exactly 100%. */
  const [coverage, setCoverage] = useState(1);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    const q =
      typeof lat === "number" && typeof lon === "number"
        ? `lat=${lat}&lon=${lon}&state=${encodeURIComponent(regionCode)}`
        : `state=${encodeURIComponent(regionCode)}`;
    fetch(`/api/solar?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: SolarEstimate) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [lat, lon, regionCode]);

  const proposal = useMemo(
    () =>
      data
        ? sizeArray(data, annualKwhWasted * coverage, ratePerKwh, co2PerKwh)
        : null,
    [data, annualKwhWasted, coverage, ratePerKwh, co2PerKwh],
  );

  if (failed) {
    return (
      <section className="panel p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-fog">Rooftop offset</h3>
        <p className="mt-2 text-sm text-dim">
          The solar resource lookup was unreachable. Nothing else in this report depends on it.
        </p>
      </section>
    );
  }

  if (!data || !proposal) {
    return (
      <section className="panel p-5 sm:p-6">
        <div className="h-4 w-44 animate-pulse bg-surface2" />
        <div className="mt-4 h-24 w-full animate-pulse bg-surface2/60" />
      </section>
    );
  }

  const tierLabel =
    data.status === "live"
      ? "NREL PVWatts"
      : data.status === "modeled"
        ? "measured irradiance"
        : "state average";

  const tint =
    data.status === "live"
      ? "var(--color-lime)"
      : data.status === "modeled"
        ? "var(--color-cyan)"
        : "var(--color-amber)";

  const payback = proposal.paybackYears;

  return (
    <section className="panel ticked @container overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-fog sm:text-xl">
            The array that cancels it
          </h3>
          <p className="mt-0.5 text-sm text-mist">
            Sized against the {Math.round(annualKwhWasted).toLocaleString()} kWh this audit
            found going to waste
          </p>
        </div>
        <span className="mono-label" style={{ color: tint }}>
          {tierLabel}
        </span>
      </header>

      <div className="p-5 sm:p-6">
        {/* ---- headline ---- */}
        <div className="grid gap-4 @lg:grid-cols-3">
          <Stat
            label="system size"
            value={proposal.systemKw.toFixed(1)}
            unit="kW DC"
            tint="var(--color-lime)"
          />
          <Stat
            label="cost after federal credit"
            value={money(proposal.netCost)}
            unit={`from ${money(proposal.grossCost)}`}
            tint="var(--color-cyan)"
          />
          <Stat
            label="simple payback"
            value={payback === null ? "—" : payback.toFixed(1)}
            unit="years"
            tint={payback !== null && payback <= 12 ? "var(--color-lime)" : "var(--color-amber)"}
          />
        </div>

        {/* ---- coverage control ---- */}
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="mono-label">how much of the waste to offset</span>
            <span className="font-mono text-[0.72rem] text-lime tabular-nums">
              {Math.round(coverage * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.25}
            max={1.5}
            step={0.05}
            value={coverage}
            onChange={(e) => setCoverage(Number(e.target.value))}
            aria-label="Share of the audited waste to offset with solar"
            className="mt-2.5 w-full accent-lime"
          />
          <div className="mt-1 flex justify-between font-mono text-[0.62rem] uppercase tracking-wider text-dim">
            <span>quarter of it</span>
            <span>all of it</span>
            <span>half again</span>
          </div>
        </div>

        {/* ---- what it is, physically ---- */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 grid gap-px border border-line bg-line @lg:grid-cols-4"
        >
          <Cell label="panels" value={`${proposal.panelCount}`} />
          <Cell label="roof area" value={`${Math.round(proposal.roofSqFt).toLocaleString()} ft²`} />
          <Cell
            label="produces"
            value={`${Math.round(proposal.annualKwh).toLocaleString()} kWh/yr`}
          />
          <Cell
            label="carbon avoided"
            value={`${(proposal.co2AvoidedKg / 1000).toFixed(1)} t/yr`}
          />
        </motion.div>

        {/* ---- the money, spelled out ---- */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-sm">
            <tbody className="font-mono text-[0.78rem] tabular-nums">
              <Row
                label={`installed cost · ${proposal.systemKw.toFixed(1)} kW at $${COST_PER_WATT.toFixed(2)}/W`}
                value={exact(proposal.grossCost)}
              />
              <Row
                label={`federal investment tax credit · ${Math.round(FEDERAL_CREDIT * 100)}%`}
                value={`− ${exact(proposal.credit)}`}
                tint="var(--color-lime)"
              />
              <Row label="net cost to the district" value={exact(proposal.netCost)} strong />
              <Row
                label={`energy displaced, year one · at $${ratePerKwh.toFixed(3)}/kWh`}
                value={`${exact(proposal.annualValue)}/yr`}
              />
              <Row
                label={`net value over ${WARRANTY_YEARS} years`}
                value={exact(proposal.lifetimeNet)}
                tint={proposal.lifetimeNet > 0 ? "var(--color-lime)" : "var(--color-ember)"}
                strong
              />
            </tbody>
          </table>
        </div>

        {/* ---- the civic point ---- */}
        <div
          className="mt-5 border-l-2 px-4 py-3"
          style={{
            borderColor: "var(--color-lime)",
            background: "color-mix(in srgb, var(--color-surface2) 60%, transparent)",
          }}
        >
          <p className="text-[0.86rem] leading-relaxed text-mist">
            A public school district owes no federal income tax, so for decades a tax credit was
            worth nothing to it. The Inflation Reduction Act changed that: under the elective-pay
            provision (26 U.S.C. §6417) a tax-exempt entity can claim this credit as a direct cash
            payment. That is why the{" "}
            <span className="text-lime">{exact(proposal.credit)}</span> above is real money to a
            school and not a footnote.
          </p>
        </div>

        <p className="mt-4 font-mono text-[0.7rem] leading-relaxed text-dim">
          {data.source}. {data.peakSunHours.toFixed(2)} peak sun hours per day →{" "}
          {Math.round(data.kwhPerKwYear).toLocaleString()} kWh per installed kW per year.
          {data.note ? ` ${data.note}` : ""}
        </p>
        <p className="mt-2 font-mono text-[0.7rem] leading-relaxed text-dim">
          A screening estimate, not an engineering study. It assumes an unshaded south-facing roof
          with structure to spare, holds the electricity rate flat, and discounts nothing — all of
          which a real proposal would revisit. What it is for is deciding whether the conversation
          is worth having.
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

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink px-4 py-3">
      <div className="mono-label min-h-[2.1em] leading-snug text-balance">{label}</div>
      <div className="mt-0.5 font-mono text-base font-bold text-fog tabular-nums">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  tint,
  strong,
}: {
  label: string;
  value: string;
  tint?: string;
  strong?: boolean;
}) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className={`py-2 pr-4 ${strong ? "text-fog" : "text-mist"}`}>{label}</td>
      <td
        className={`py-2 text-right ${strong ? "font-bold" : ""}`}
        style={{ color: tint ?? (strong ? "var(--color-fog)" : "var(--color-mist)") }}
      >
        {value}
      </td>
    </tr>
  );
}
