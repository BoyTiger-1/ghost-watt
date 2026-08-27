"use client";

// The panels that sit around the ranked offender list: how this building compares,
// where the load actually is, and how to get the audit out of the browser.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LoadMixDonut, CompareBars } from "./Charts";
import { benchmark, extrapolate, BUILDING_TYPE_BY_ID } from "@/lib/benchmark";
import { loadMix, concentration, fmtMoney, fmtMoneyFull, fmtPct, fmtWatts } from "@/lib/energy";
import { offendersToCsv, downloadText, slugForFile } from "@/lib/export";
import { regionOrDefault, REGIONS } from "@/lib/grid";
import type { AuditSettings, Offender } from "@/lib/types";
import type { Building } from "@/lib/storage";

// ---- where the load lives ----------------------------------------------

export function LoadMixPanel({ offenders }: { offenders: Offender[] }) {
  const slices = useMemo(() => loadMix(offenders), [offenders]);
  const total = offenders.reduce((s, o) => s + o.costPerYear, 0);
  const top3 = concentration(offenders, 3);

  if (!slices.length) return null;

  return (
    <section className="panel ticked @container p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-fog">Where the waste lives</h3>
        <span className="mono-label">by equipment type</span>
      </div>

      <div className="mt-5">
        <LoadMixDonut slices={slices} total={total} />
      </div>

      <p className="mt-5 border-t border-line pt-4 text-sm leading-relaxed text-mist">
        The top three offenders carry{" "}
        <strong className="font-mono font-semibold text-cyan tabular-nums">{fmtPct(top3)}</strong>{" "}
        of the total. Waste is almost always this concentrated, which is why a short
        list beats a building-wide policy: fix three things and most of it is gone.
      </p>
    </section>
  );
}

// ---- how this building compares ----------------------------------------

export function BenchmarkPanel({
  offenders,
  building,
  settings,
}: {
  offenders: Offender[];
  building: Building;
  settings: AuditSettings;
}) {
  const [auditedSqFt, setAuditedSqFt] = useState(0);

  const kwh = offenders.reduce((s, o) => s + o.kwhPerYear, 0);
  const cost = offenders.reduce((s, o) => s + o.costPerYear, 0);
  const watts = offenders.reduce((s, o) => s + o.totalWatts, 0);

  const result = benchmark(kwh, cost, building.floorAreaSqFt, building.typeId);
  const type = BUILDING_TYPE_BY_ID[building.typeId];
  const projection =
    auditedSqFt > 0 && building.floorAreaSqFt > 0
      ? extrapolate(cost, auditedSqFt, building.floorAreaSqFt)
      : null;

  // What the same waste would cost elsewhere - the cheapest and dearest states.
  const here = regionOrDefault(building.regionCode);
  const sorted = [...REGIONS].sort((a, b) => a.ratePerKwh - b.ratePerKwh);
  const cheapest = sorted[0];
  const dearest = sorted[sorted.length - 1];

  const VERDICT_TINT: Record<string, string> = {
    low: "var(--color-cyan)",
    typical: "var(--color-lime)",
    high: "var(--color-amber)",
    severe: "var(--color-ember)",
  };

  return (
    <section className="panel ticked @container p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-fog">How this building compares</h3>
        <span className="mono-label">CBECS median EUI</span>
      </div>

      {result ? (
        <>
          <div
            className="mt-4 border-l-2 bg-surface2/40 px-4 py-3"
            style={{ borderColor: VERDICT_TINT[result.verdict] }}
          >
            <span
              className="mono-label"
              style={{ color: VERDICT_TINT[result.verdict] }}
            >
              {result.verdict}
            </span>
            <p className="mt-1 text-sm leading-relaxed text-mist">{result.message}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 divide-x divide-line border border-line bg-surface2/50 @2xl:grid-cols-4">
            <Cell label="phantom EUI" value={`${result.phantomEui.toFixed(2)}`} sub="kBtu/sq ft" />
            <Cell label={`${type?.label ?? "type"} median`} value={String(result.medianEui)} sub="kBtu/sq ft" />
            <Cell label="waste / sq ft" value={`$${result.costPerSqFt.toFixed(3)}`} sub="per year" />
            <Cell label="continuous draw" value={fmtWatts(watts)} sub="average" />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-mist">
          Set a floor area on this building to benchmark it against the median{" "}
          {type?.label.toLowerCase() ?? "building"} - the figure that turns &ldquo;this is a lot
          of money&rdquo; into &ldquo;this is a lot of money <em>for a building this size</em>&rdquo;.
        </p>
      )}

      {/* sample extrapolation */}
      {building.floorAreaSqFt > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <label className="block">
            <span className="mono-label">how much of the building did you photograph? (sq ft)</span>
            <input
              type="number"
              min={0}
              step={100}
              value={auditedSqFt || ""}
              placeholder="e.g. 3000"
              onChange={(e) => setAuditedSqFt(parseFloat(e.target.value) || 0)}
              className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
            />
          </label>
          {projection && projection.factor > 1 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2.5 text-sm leading-relaxed text-mist"
            >
              You sampled about {fmtPct(1 / projection.factor)} of the floor area. If the rest of
              the building looks like what you photographed, the whole site is losing roughly{" "}
              <strong className="font-mono font-semibold text-amber tabular-nums">
                {fmtMoneyFull(projection.projectedCost)}
              </strong>{" "}
              a year. That is an extrapolation, not a measurement - photograph more areas to
              replace it with one.
            </motion.p>
          )}
        </div>
      )}

      {/* geography */}
      <div className="mt-5 border-t border-line pt-4">
        <span className="mono-label">the same waste, elsewhere</span>
        <div className="mt-3">
          <CompareBars
            rows={[
              {
                label: `${cheapest.name} (cheapest power)`,
                value: (cost / settings.ratePerKwh) * cheapest.ratePerKwh,
                tint: "var(--color-cyan-deep)",
              },
              { label: `${here.name} - you`, value: cost },
              {
                label: `${dearest.name} (dearest power)`,
                value: (cost / settings.ratePerKwh) * dearest.ratePerKwh,
                tint: "var(--color-ember)",
              },
            ]}
          />
        </div>
        <p className="mt-3 text-[0.78rem] leading-relaxed text-dim">
          Identical equipment, identical hours. Only the electricity price changes. This is why
          the region setting is not a detail.
        </p>
      </div>
    </section>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-3 py-3">
      <div className="mono-label truncate">{label}</div>
      <div className="mt-0.5 font-mono text-base font-bold text-fog tabular-nums">{value}</div>
      {sub && <div className="font-mono text-[0.62rem] text-dim">{sub}</div>}
    </div>
  );
}

// ---- getting it out of the browser -------------------------------------

export function ExportBar({
  offenders,
  settings,
  buildingName,
  onSave,
  saved,
}: {
  offenders: Offender[];
  settings: AuditSettings;
  buildingName: string;
  onSave?: () => void;
  saved?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function exportCsv() {
    const csv = offendersToCsv(offenders, settings, buildingName);
    downloadText(`ghostwatt-${slugForFile(buildingName)}.csv`, csv, "text/csv");
  }

  async function copySummary() {
    const total = offenders.reduce((s, o) => s + o.costPerYear, 0);
    const save = offenders.reduce((s, o) => s + o.annualSavings, 0);
    const lines = [
      `Ghost Watt phantom-load audit - ${buildingName}`,
      `Wasted: ${fmtMoneyFull(total)}/yr. Recoverable: ${fmtMoneyFull(save)}/yr.`,
      "",
      ...offenders
        .slice(0, 5)
        .map((o, i) => `${i + 1}. ${o.label} x${o.count} - ${fmtMoney(o.costPerYear)}/yr - fix: ${o.action.label}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!offenders.length) return null;

  return (
    <div className="panel flex flex-wrap items-center gap-2 p-3">
      <span className="mono-label mr-auto">take it with you</span>

      {onSave && (
        <button
          onClick={onSave}
          disabled={saved}
          className="border border-cyan/50 bg-cyan/10 px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-cyan transition-colors enabled:hover:bg-cyan/20 disabled:border-line disabled:bg-transparent disabled:text-dim"
        >
          {saved ? "✓ saved to this building" : "save audit"}
        </button>
      )}
      <button
        onClick={exportCsv}
        className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-cyan hover:text-cyan"
      >
        CSV for facilities
      </button>
      <button
        onClick={() => window.print()}
        className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-cyan hover:text-cyan"
      >
        print / PDF
      </button>
      <button
        onClick={copySummary}
        className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-cyan hover:text-cyan"
      >
        {copied ? "✓ copied" : "copy summary"}
      </button>
    </div>
  );
}
