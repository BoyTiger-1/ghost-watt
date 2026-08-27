"use client";

// The reality check.
//
// This panel exists to do something most estimating tools carefully avoid: compare
// the estimate against a measurement, in public, and report the result even when it
// is unflattering. If the audit claims a share of the meter that phantom load could
// not plausibly account for, this says so in plain language rather than quietly
// rendering a confident number.
//
// That is not modesty for its own sake. The single sharpest question anyone can ask
// this app is "these are guesses from photographs, why should I believe the total?"
// A tool that has already checked itself against the bill, and shows the check, has
// an answer. One that hasn't, doesn't.

import { motion } from "framer-motion";
import { calibrate, euiVerdict, type UtilityBill } from "@/lib/calibration";
import { BUILDING_TYPE_BY_ID, BUILDING_TYPES } from "@/lib/benchmark";

export function BillCalibration({
  bill,
  auditKwhPerYear,
  assumedRate,
  floorAreaSqFt,
  typeId,
}: {
  bill?: UtilityBill;
  auditKwhPerYear: number;
  assumedRate: number;
  floorAreaSqFt: number;
  typeId: string;
}) {
  // No bill entered: ask for it once, and say precisely what it buys.
  if (!bill) {
    return (
      <section className="panel px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-fog">Checked against a real bill</h3>
          <span className="mono-label">no bill entered</span>
        </div>
        <p className="mt-1.5 text-[0.82rem] leading-relaxed text-dim">
          Three numbers off one electricity bill — kWh, dollars, and days — in Settings, and this
          report stops using a state-average price and starts using what this building actually
          pays. It also lets the app check its own total against the meter and tell you if the
          estimate looks too big to believe.
        </p>
      </section>
    );
  }

  const result = calibrate(bill, auditKwhPerYear, assumedRate, floorAreaSqFt, typeId);

  if (!result) {
    return (
      <section className="panel px-5 py-4 sm:px-6">
        <h3 className="text-sm font-semibold text-fog">Checked against a real bill</h3>
        <p className="mt-1.5 text-[0.82rem] text-dim">
          The bill on file is incomplete — kWh, dollars and days all need to be above zero.
        </p>
      </section>
    );
  }

  const type = BUILDING_TYPE_BY_ID[typeId] ?? BUILDING_TYPES[0];
  const tint =
    result.plausibility === "believable"
      ? "var(--color-lime)"
      : result.plausibility === "high"
        ? "var(--color-amber)"
        : "var(--color-ember)";

  const rateDelta = result.rateErrorVsAssumed;
  const verdict = euiVerdict(result.vsMedian, type.label);

  return (
    <section className="panel ticked @container overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-fog">Checked against a real bill</h3>
          <p className="mt-0.5 text-sm text-mist">
            {bill.days} days ending {formatDate(bill.periodEnd)} ·{" "}
            {Math.round(bill.kwh).toLocaleString()} kWh
          </p>
        </div>
        <span className="mono-label" style={{ color: tint }}>
          {result.plausibility === "believable" ? "model checks out" : result.plausibility}
        </span>
      </header>

      <div className="grid gap-px bg-line @lg:grid-cols-4">
        <Cell
          label="price actually paid"
          value={`$${result.ratePerKwh.toFixed(3)}`}
          sub="per kWh"
          tint="var(--color-lime)"
        />
        <Cell
          label="vs the assumed rate"
          value={`${rateDelta >= 0 ? "+" : ""}${Math.round(rateDelta * 100)}%`}
          sub={`was $${assumedRate.toFixed(3)}`}
          tint={Math.abs(rateDelta) > 0.15 ? "var(--color-amber)" : undefined}
        />
        <Cell
          label="whole-building spend"
          value={`$${Math.round(result.annualDollars).toLocaleString()}`}
          sub="per year, annualised"
        />
        <Cell
          label="this audit is"
          value={`${(result.shareOfBill * 100).toFixed(1)}%`}
          sub="of that meter"
          tint={tint}
        />
      </div>

      <div className="p-5 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-l-2 px-4 py-3"
          style={{
            borderColor: tint,
            background: "color-mix(in srgb, var(--color-surface2) 60%, transparent)",
          }}
        >
          <p className="text-[0.86rem] leading-relaxed text-mist">{result.message}</p>
        </motion.div>

        {result.eui !== null && verdict && (
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="mono-label">electricity use intensity</span>
              <span className="font-mono text-[0.7rem] text-dim tabular-nums">
                {result.eui.toFixed(1)} vs {result.medianEui} kBtu/ft²/yr median
              </span>
            </div>

            {/* One bar, this building against the peer median. */}
            <div className="mt-2.5 h-6 w-full overflow-hidden border border-line bg-surface2/40">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, ((result.vsMedian ?? 0) / 2) * 100)}%`,
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full"
                style={{
                  background:
                    (result.vsMedian ?? 1) > 1.2 ? "var(--color-ember)" : "var(--color-cyan)",
                }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[0.62rem] uppercase tracking-wider text-dim">
              <span>0</span>
              <span>median {type.label.toLowerCase()}</span>
              <span>2×</span>
            </div>

            <p className="mt-3 text-[0.84rem] leading-relaxed text-mist">{verdict}</p>
          </div>
        )}

        <p className="mt-4 font-mono text-[0.7rem] leading-relaxed text-dim">
          Rate is the blended figure off the bill — energy, delivery, demand charges and taxes
          divided by kWh — which is the number that matters for a savings estimate, and is usually
          higher than the advertised energy rate. Annualising one billing period assumes the rest of
          the year looks like it; a summer bill from an air-conditioned building will overstate.
        </p>
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function Cell({
  label,
  value,
  sub,
  tint,
}: {
  label: string;
  value: string;
  sub: string;
  tint?: string;
}) {
  return (
    <div className="bg-ink px-4 py-3">
      <div className="mono-label min-h-[2.1em] leading-snug text-balance">{label}</div>
      <div
        className="mt-0.5 font-mono text-xl font-bold text-fog tabular-nums"
        style={tint ? { color: tint } : undefined}
      >
        {value}
      </div>
      <div className="font-mono text-[0.62rem] text-dim">{sub}</div>
    </div>
  );
}
