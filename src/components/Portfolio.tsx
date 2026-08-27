"use client";

// The part that makes Ghost Watt an instrument rather than a demo.
//
// Anyone can produce an estimate. The hard, unglamorous, and much more useful
// thing is closing the loop: record what you found, record what you installed,
// scan the same rooms again, and show whether the load actually went away. A fix
// that was never verified is a claim; a fix that survives a re-scan is a result.
//
// Everything here lives in this browser. No account, nothing uploaded.

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkline, CompareBars } from "./Charts";
import { DeviceGlyph } from "./DeviceGlyph";
import {
  auditsFor,
  fixesFor,
  buildingProgress,
  compareAudits,
  uid,
  type DeltaRow,
  type SavedAudit,
} from "@/lib/storage";
import {
  useStore,
  addFix,
  verifyFix,
  removeFix,
  removeAudit,
  removeBuilding,
  setActiveBuilding,
  addBuilding,
  newBuilding,
  replaceStore,
} from "@/lib/useStore";
import { fmtMoney, fmtMoneyFull, fmtCo2, fmtPct } from "@/lib/energy";
import { exportStore, importStore, downloadText } from "@/lib/export";
import { BUILDING_TYPE_BY_ID } from "@/lib/benchmark";
import { regionOrDefault } from "@/lib/grid";
import { SampleData } from "./SampleData";

const STATUS_TINT: Record<DeltaRow["status"], string> = {
  resolved: "var(--color-cyan)",
  reduced: "var(--color-lime)",
  unchanged: "var(--color-dim)",
  worse: "var(--color-ember)",
  new: "var(--color-amber)",
};

const STATUS_WORD: Record<DeltaRow["status"], string> = {
  resolved: "gone",
  reduced: "down",
  unchanged: "unchanged",
  worse: "up",
  new: "new",
};

export function Portfolio() {
  const store = useStore();
  const [importError, setImportError] = useState<string | null>(null);

  const active =
    store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0] ?? null;

  function doExport() {
    downloadText(
      `ghostwatt-backup-${new Date().toISOString().slice(0, 10)}.json`,
      exportStore(store),
      "application/json",
    );
  }

  async function doImport(file: File | null) {
    if (!file) return;
    const result = importStore(await file.text());
    if (result.ok && result.store) {
      replaceStore(result.store);
      setImportError(null);
    } else {
      setImportError(result.error ?? "That file could not be read.");
    }
  }

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-6">
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 grad-energy-bg" />
          <span className="mono-label text-cyan">portfolio</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-fog sm:text-4xl">
          Did it actually go away?
        </h1>
        <p className="mt-3 max-w-2xl text-mist">
          Every audit you save lands here. Log the fixes you install, re-scan the same
          rooms later, and this page will tell you - device by device - whether the load
          is really gone or whether it quietly came back.
        </p>
      </header>

      {store.buildings.length === 0 ? (
        <div className="space-y-6">
          <SampleData />
          <EmptyPortfolio />
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            {store.buildings.map((b) => {
              const on = b.id === active?.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setActiveBuilding(b.id)}
                  className={`border px-3 py-1.5 font-mono text-xs tracking-wider transition-colors ${
                    on
                      ? "border-cyan/60 bg-cyan/10 text-cyan"
                      : "border-line text-dim hover:border-line2 hover:text-mist"
                  }`}
                >
                  {b.name}
                </button>
              );
            })}
            <button
              onClick={() => addBuilding(newBuilding(`Building ${store.buildings.length + 1}`))}
              className="border border-dashed border-line2 px-3 py-1.5 font-mono text-xs text-dim transition-colors hover:border-cyan hover:text-cyan"
            >
              + building
            </button>

            {/* The full panel above only renders on an empty portfolio, so without
                this the example becomes unremovable the moment it is loaded - the
                one property that makes shipping demo data defensible at all. It
                also lets someone who already has a real building pull the example
                up alongside it. */}
            <span className="ml-auto">
              <SampleData compact />
            </span>
          </div>

          {active && <BuildingDetail buildingId={active.id} />}
        </>
      )}

      {/* portfolio-wide roll-up */}
      {store.buildings.length > 1 && <PortfolioRollup />}

      {/* backup */}
      <div className="panel mt-8 flex flex-wrap items-center gap-2 p-3">
        <span className="mono-label mr-auto">this data lives only in this browser</span>
        <button
          onClick={doExport}
          className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-cyan hover:text-cyan"
        >
          export backup
        </button>
        <label className="cursor-pointer border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-cyan hover:text-cyan">
          import backup
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              doImport(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {importError && <p className="mt-2 font-mono text-xs text-ember">{importError}</p>}
    </section>
  );
}

// ---- one building -------------------------------------------------------

function BuildingDetail({ buildingId }: { buildingId: string }) {
  const store = useStore();
  const building = store.buildings.find((b) => b.id === buildingId);
  const audits = useMemo(() => auditsFor(store, buildingId), [store, buildingId]);
  const fixes = useMemo(() => fixesFor(store, buildingId), [store, buildingId]);
  const progress = useMemo(() => buildingProgress(store, buildingId), [store, buildingId]);

  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  if (!building) return null;

  const type = BUILDING_TYPE_BY_ID[building.typeId];
  const region = regionOrDefault(building.regionCode);

  // Oldest → newest, so the sparkline reads left to right in time.
  const trend = [...audits].reverse().map((a) => a.offenders.reduce((s, o) => s + o.costPerYear, 0));

  const before = audits.find((a) => a.id === compareA) ?? audits[audits.length - 1] ?? null;
  const after = audits.find((a) => a.id === compareB) ?? audits[0] ?? null;
  const deltas =
    before && after && before.id !== after.id ? compareAudits(before, after) : [];

  return (
    <div className="space-y-6">
      {/* headline */}
      <div className="panel ticked relative overflow-hidden p-5 sm:p-6">
        <div
          className="absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(60% 120% at 100% 0%, rgba(47,230,207,0.1), transparent 60%)",
          }}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-fog">{building.name}</h2>
            <p className="mt-0.5 font-mono text-[0.7rem] tracking-wider text-dim">
              {type?.label ?? building.typeId} · {region.name} ·{" "}
              {building.floorAreaSqFt
                ? `${building.floorAreaSqFt.toLocaleString()} sq ft`
                : "area not set"}
            </p>
          </div>
          {trend.length >= 2 && (
            <Sparkline
              values={trend}
              tint={progress.reducedCost > 0 ? "var(--color-lime)" : "var(--color-amber)"}
            />
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Big label="baseline waste" value={fmtMoneyFull(progress.baselineCost)} />
          <Big label="latest waste" value={fmtMoneyFull(progress.currentCost)} />
          <Big
            label="reduced"
            value={
              progress.baselineCost > 0
                ? `${fmtMoneyFull(progress.reducedCost)} · ${fmtPct(progress.reducedPct)}`
                : "-"
            }
            accent={progress.reducedCost > 0}
          />
          <Big
            label="fixes verified"
            value={`${progress.fixesVerified} / ${progress.fixesInstalled}`}
          />
        </div>

        {progress.auditCount < 2 && (
          <p className="mt-5 border-t border-line pt-3 text-sm text-mist">
            {progress.auditCount === 0
              ? "No audits saved for this building yet."
              : "One audit saved. Run the same rooms again after you have installed something, and this becomes a before-and-after."}{" "}
            <Link href="/scan" className="text-cyan underline-offset-4 hover:underline">
              Run a scan →
            </Link>
          </p>
        )}
      </div>

      {/* the comparison - the actual point of the page */}
      {audits.length >= 2 && (
        <div className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-lg font-semibold text-fog">Before and after</h3>
            <span className="mono-label">device by device</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <AuditSelect
              label="before"
              audits={audits}
              value={before?.id ?? ""}
              onChange={setCompareA}
            />
            <AuditSelect
              label="after"
              audits={audits}
              value={after?.id ?? ""}
              onChange={setCompareB}
            />
          </div>

          {deltas.length > 0 ? (
            <ul className="mt-5 divide-y divide-line border border-line">
              {deltas.map((d, i) => (
                <motion.li
                  key={d.categoryId}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0"
                    style={{ background: STATUS_TINT[d.status] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fog">{d.label}</span>
                  <span className="shrink-0 font-mono text-[0.68rem] tabular-nums text-dim">
                    {fmtMoney(d.beforeCost)} → {fmtMoney(d.afterCost)}
                  </span>
                  <span
                    className="w-20 shrink-0 text-right font-mono text-xs font-semibold tabular-nums"
                    style={{ color: STATUS_TINT[d.status] }}
                  >
                    {d.change < 0 ? "−" : d.change > 0 ? "+" : ""}
                    {fmtMoney(Math.abs(d.change))}
                  </span>
                  <span
                    className="w-16 shrink-0 text-right font-mono text-[0.62rem] uppercase tracking-wider"
                    style={{ color: STATUS_TINT[d.status] }}
                  >
                    {STATUS_WORD[d.status]}
                  </span>
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-dim">Pick two different audits to compare.</p>
          )}
        </div>
      )}

      {/* fixes ledger */}
      <FixLedger buildingId={buildingId} latest={audits[0] ?? null} fixes={fixes} />

      {/* audit history */}
      {audits.length > 0 && (
        <div className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-lg font-semibold text-fog">Audit history</h3>
            <span className="mono-label">{audits.length} saved</span>
          </div>
          <ul className="mt-4 divide-y divide-line border border-line">
            {audits.map((a, i) => (
              <li
                key={a.id}
                className="rise-in flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-3"
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className="font-mono text-xs text-mist tabular-nums">
                  {new Date(a.at).toLocaleDateString()}
                </span>
                <span
                  className={`font-mono text-[0.62rem] uppercase tracking-wider ${
                    a.mode === "live" ? "text-cyan" : a.mode === "mixed" ? "text-amber" : "text-dim"
                  }`}
                >
                  {a.mode}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-dim">
                  {a.areas.join(", ") || "no areas named"}
                </span>
                <span className="font-mono text-sm font-semibold text-fog tabular-nums">
                  {fmtMoneyFull(a.offenders.reduce((s, o) => s + o.costPerYear, 0))}/yr
                </span>
                <button
                  onClick={() => removeAudit(a.id)}
                  className="px-1.5 text-dim transition-colors hover:text-ember"
                  aria-label="delete audit"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => {
            if (confirm(`Delete "${building.name}" and everything recorded for it?`)) {
              removeBuilding(building.id);
            }
          }}
          className="font-mono text-[0.7rem] tracking-wider text-dim transition-colors hover:text-ember"
        >
          delete this building
        </button>
      </div>
    </div>
  );
}

// ---- the fixes ledger ---------------------------------------------------

function FixLedger({
  buildingId,
  latest,
  fixes,
}: {
  buildingId: string;
  latest: SavedAudit | null;
  fixes: ReturnType<typeof fixesFor>;
}) {
  const [picking, setPicking] = useState(false);
  const candidates = latest?.offenders ?? [];

  const spent = fixes.reduce((s, f) => s + f.costPaid, 0);
  const claimed = fixes.reduce((s, f) => s + f.expectedAnnualSavings, 0);
  const proven = fixes.reduce((s, f) => s + (f.verifiedAnnualSavings ?? 0), 0);

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-fog">Fixes installed</h3>
        <button
          onClick={() => setPicking((p) => !p)}
          disabled={!candidates.length}
          className="border border-line px-3 py-1.5 font-mono text-[0.7rem] tracking-wider text-mist transition-colors enabled:hover:border-cyan enabled:hover:text-cyan disabled:text-dim"
        >
          {picking ? "cancel" : "+ log a fix"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {picking && candidates.length > 0 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 overflow-hidden"
          >
            {candidates.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => {
                    addFix({
                      id: uid("f"),
                      buildingId,
                      categoryId: o.categoryId,
                      area: o.source,
                      label: o.label,
                      actionLabel: o.action.label,
                      costPaid: o.fixCost,
                      expectedAnnualSavings: o.annualSavings,
                      installedAt: new Date().toISOString(),
                    });
                    setPicking(false);
                  }}
                  className="flex w-full items-center gap-3 border-b border-line px-2 py-2.5 text-left transition-colors hover:bg-surface2/60"
                >
                  <DeviceGlyph icon={o.icon} className="h-4 w-4 shrink-0 text-cyan" />
                  <span className="min-w-0 flex-1 truncate text-sm text-fog">
                    {o.action.label}
                  </span>
                  <span className="shrink-0 font-mono text-[0.68rem] text-dim tabular-nums">
                    {o.label} · {fmtMoney(o.annualSavings)}/yr
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {fixes.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-mist">
          Nothing logged yet. When facilities actually installs one of the recommended fixes,
          record it here - that is what lets a later scan prove the saving rather than just
          predict it.
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-line border border-line">
            {fixes.map((f, i) => (
              <li
                key={f.id}
                className="rise-in flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-3"
                style={{ "--i": i } as React.CSSProperties}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0"
                  style={{
                    background: f.verifiedAt ? "var(--color-cyan)" : "var(--color-line2)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fog">{f.actionLabel}</p>
                  <p className="truncate font-mono text-[0.66rem] text-dim">
                    {f.label} · {f.area} · installed{" "}
                    {new Date(f.installedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-mist tabular-nums">
                  {f.costPaid > 0 ? fmtMoneyFull(f.costPaid) : "free"}
                </span>
                {f.verifiedAt ? (
                  <span className="shrink-0 font-mono text-xs font-semibold text-cyan tabular-nums">
                    ✓ {fmtMoney(f.verifiedAnnualSavings ?? 0)}/yr proven
                  </span>
                ) : (
                  <button
                    onClick={() => verifyFix(f.id, f.expectedAnnualSavings)}
                    className="shrink-0 border border-line px-2 py-1 font-mono text-[0.64rem] tracking-wider text-dim transition-colors hover:border-cyan hover:text-cyan"
                    title="Mark as confirmed by a later scan"
                  >
                    verify
                  </button>
                )}
                <button
                  onClick={() => removeFix(f.id)}
                  className="shrink-0 px-1 text-dim transition-colors hover:text-ember"
                  aria-label="remove fix"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-line pt-4">
            <CompareBars
              rows={[
                { label: "spent on fixes", value: spent, tint: "var(--color-amber)" },
                { label: "expected annual saving", value: claimed },
                { label: "verified annual saving", value: proven, tint: "var(--color-cyan)" },
              ]}
            />
            <p className="mt-3 text-[0.78rem] leading-relaxed text-dim">
              Expected is what the model said. Verified is what a later scan confirmed. The gap
              between them is the most interesting number on this page, and it is one almost no
              energy tool is willing to show you.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ---- across every building ---------------------------------------------

function PortfolioRollup() {
  const store = useStore();
  const rows = store.buildings.map((b) => {
    const p = buildingProgress(store, b.id);
    return { building: b, progress: p };
  });

  const totalCurrent = rows.reduce((s, r) => s + r.progress.currentCost, 0);
  const totalReduced = rows.reduce((s, r) => s + r.progress.reducedCost, 0);
  const totalCo2 = store.audits.reduce(
    (s, a) => s + a.offenders.reduce((x, o) => x + o.co2KgPerYear, 0),
    0,
  );

  return (
    <div className="panel ticked mt-8 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-fog">Across the district</h3>
        <span className="mono-label">{store.buildings.length} buildings</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Big label="current annual waste" value={fmtMoneyFull(totalCurrent)} />
        <Big label="removed so far" value={fmtMoneyFull(totalReduced)} accent />
        <Big label="CO₂ across all audits" value={fmtCo2(totalCo2)} />
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <CompareBars
          rows={rows.map((r) => ({
            label: r.building.name,
            value: r.progress.currentCost,
          }))}
        />
      </div>
    </div>
  );
}

// ---- bits ---------------------------------------------------------------

function AuditSelect({
  label,
  audits,
  value,
  onChange,
}: {
  label: string;
  audits: SavedAudit[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
      >
        {audits.map((a) => (
          <option key={a.id} value={a.id} className="bg-surface">
            {new Date(a.at).toLocaleDateString()} ·{" "}
            {fmtMoneyFull(a.offenders.reduce((s, o) => s + o.costPerYear, 0))}/yr
          </option>
        ))}
      </select>
    </label>
  );
}

function Big({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className={`font-mono text-xl font-bold tabular-nums sm:text-2xl ${
          accent ? "grad-energy" : "text-fog"
        }`}
      >
        {value}
      </div>
      <div className="mono-label mt-1">{label}</div>
    </div>
  );
}

function EmptyPortfolio() {
  return (
    <div className="panel grid min-h-[300px] place-items-center p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center border border-line2 bg-surface2">
          <span className="h-3 w-3 grad-energy-bg flicker" />
        </div>
        <h3 className="text-lg font-semibold text-fog">Nothing saved yet</h3>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          Run an audit and press <span className="font-mono text-cyan">save audit</span>. It
          gets stored in this browser and shows up here, ready to be compared against the next
          one.
        </p>
        <Link
          href="/scan"
          className="mt-5 inline-block border border-cyan bg-cyan/10 px-4 py-2.5 font-mono text-xs tracking-[0.16em] uppercase text-cyan transition-colors hover:bg-cyan/20"
        >
          run a scan
        </Link>
      </div>
    </div>
  );
}
