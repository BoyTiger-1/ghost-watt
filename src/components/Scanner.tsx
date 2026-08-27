"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { OffenderCard } from "./OffenderCard";
import { CountUp } from "./CountUp";
import { BuildingBar } from "./BuildingBar";
import { BudgetPlanner } from "./BudgetPlanner";
import { GridPulse } from "./GridPulse";
import { SolarOffset } from "./SolarOffset";
import { BillCalibration } from "./BillCalibration";
import { ContributeBar } from "./ContributeBar";
import { WeatherContext } from "./WeatherContext";
import { EquivalenceStrip } from "./EquivalenceStrip";
import { BenchmarkPanel, ExportBar, LoadMixPanel } from "./AuditPanels";
import { downscaleImage } from "@/lib/image";
import { ROOM_TYPES } from "@/lib/parse";
import { aggregate, fmtCo2, fmtKwh, fmtMoney, fmtMoneyFull } from "@/lib/energy";
import { regionOrDefault } from "@/lib/grid";
import { unoccupiedHours, SCHEDULE_PRESETS } from "@/lib/schedule";
import { uid, type Building, type SavedAudit } from "@/lib/storage";
import { addAudit, addBuilding, currentStore, newBuilding, useStore } from "@/lib/useStore";
import type { AnalysisResult, AuditSettings, Offender } from "@/lib/types";

type PhotoStatus = "idle" | "scanning" | "done" | "error";
type ResultTab = "offenders" | "plan" | "grid" | "context";

/** Shown for the single frame before the first building is written to storage. */
const PLACEHOLDER_BUILDING: Building = {
  id: "placeholder",
  name: "My building",
  typeId: "k12",
  regionCode: "US",
  floorAreaSqFt: 0,
  schedule: SCHEDULE_PRESETS[0].schedule,
  createdAt: new Date(0).toISOString(),
};

interface PhotoEntry {
  id: string;
  dataUrl: string | null;
  roomType: string;
  name: string;
  status: PhotoStatus;
  result?: AnalysisResult;
  error?: string;
}

let counter = 0;
const nextId = () => `p${Date.now()}-${counter++}`;

export function Scanner() {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<ResultTab>("offenders");
  const [savedAuditId, setSavedAuditId] = useState<string | null>(null);
  const [liveRate, setLiveRate] = useState<{ ratePerKwh: number; source: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Anything the user has typed over the top of the building-derived defaults.
  const [override, setOverride] = useState<Partial<AuditSettings>>({});

  const store = useStore();
  const ready = store.buildings.length > 0;
  const building =
    store.buildings.find((b) => b.id === store.activeBuildingId) ??
    store.buildings[0] ??
    PLACEHOLDER_BUILDING;

  // Give a first-time visitor a building to hang the numbers on. This asks the
  // store directly rather than trusting the value from render: on the hydration
  // pass useStore() is still reporting the empty server snapshot, and acting on
  // that would create a second "My building" next to the one already saved.
  useEffect(() => {
    if (!currentStore().buildings.length) addBuilding(newBuilding("My building"));
  }, [store.buildings.length]);

  // The building is the source of truth for the assumptions; the override layer
  // sits on top so a user can still say "no, our rate is actually this".
  const region = regionOrDefault(building.regionCode);
  const settings: AuditSettings = useMemo(
    () => ({
      ratePerKwh: override.ratePerKwh ?? liveRate?.ratePerKwh ?? region.ratePerKwh,
      co2PerKwh: override.co2PerKwh ?? region.co2PerKwh,
      unoccupiedHoursPerYear:
        override.unoccupiedHoursPerYear ?? unoccupiedHours(building.schedule),
      regionCode: building.regionCode,
      buildingTypeId: building.typeId,
      floorAreaSqFt: building.floorAreaSqFt,
      demandChargePerKw: override.demandChargePerKw,
    }),
    [override, liveRate, region, building],
  );

  async function fetchLiveRate() {
    try {
      const res = await fetch(`/api/rates?state=${encodeURIComponent(building.regionCode)}`);
      const json = (await res.json()) as { ratePerKwh: number; source: string };
      if (typeof json.ratePerKwh === "number" && json.ratePerKwh > 0) {
        setLiveRate({ ratePerKwh: json.ratePerKwh, source: json.source });
      }
    } catch {
      // A failed lookup is not an error state - the static table already answered.
    }
  }

  const pendingCount = photos.filter((p) => p.status === "idle" || p.status === "error").length;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const entries: PhotoEntry[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await downscaleImage(file);
      entries.push({
        id: nextId(),
        dataUrl,
        roomType: "unknown",
        name: `Area ${String(photos.length + entries.length + 1).padStart(2, "0")}`,
        status: "idle",
      });
    }
    if (entries.length) setPhotos((prev) => [...prev, ...entries]);
  }

  function addEstimate() {
    setPhotos((prev) => [
      ...prev,
      {
        id: nextId(),
        dataUrl: null,
        roomType: "computer_lab",
        name: `Estimate ${String(prev.length + 1).padStart(2, "0")}`,
        status: "idle",
      },
    ]);
  }

  function patch(id: string, p: Partial<PhotoEntry>) {
    setPhotos((prev) => prev.map((e) => (e.id === id ? { ...e, ...p } : e)));
  }

  function remove(id: string) {
    setPhotos((prev) => prev.filter((e) => e.id !== id));
  }

  async function runAll() {
    const queue = photos.filter((p) => p.status === "idle" || p.status === "error");
    if (!queue.length || running) return;
    setRunning(true);
    setSavedAuditId(null); // results are about to change; this is a different audit
    for (const entry of queue) {
      patch(entry.id, { status: "scanning", error: undefined });
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: entry.dataUrl ?? undefined,
            roomType: entry.roomType,
            source: entry.name,
            settings,
            forceFallback: !entry.dataUrl,
          }),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const result = (await res.json()) as AnalysisResult;
        patch(entry.id, { status: "done", result });
      } catch (err) {
        patch(entry.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Request failed",
        });
      }
    }
    setRunning(false);
  }

  // flatten done results into a single ranked list
  const ranked = useMemo(() => {
    const flat: { offender: Offender; mode: AnalysisResult["mode"]; engine: string }[] = [];
    for (const p of photos) {
      if (p.result) {
        for (const o of p.result.offenders) {
          flat.push({ offender: o, mode: p.result.mode, engine: p.result.engine });
        }
      }
    }
    flat.sort((a, b) => b.offender.costPerYear - a.offender.costPerYear);
    return flat;
  }, [photos]);

  const offenders = useMemo(() => ranked.map((r) => r.offender), [ranked]);
  const totals = useMemo(() => aggregate(offenders), [offenders]);
  const maxCost = ranked[0]?.offender.costPerYear ?? 0;
  const hasResults = ranked.length > 0;
  const liveCount = photos.filter((p) => p.result?.mode === "live").length;

  /** live / fallback / mixed across every area scanned so far. */
  const auditMode = useMemo<SavedAudit["mode"]>(() => {
    const modes = new Set(photos.filter((p) => p.result).map((p) => p.result!.mode));
    return modes.size > 1 ? "mixed" : modes.has("live") ? "live" : "fallback";
  }, [photos]);

  /**
   * Write this audit into the building's history.
   *
   * Saving is what turns a one-shot estimate into an accountability record: the
   * portfolio page can then say "this room cost $310 a year in September, you
   * installed a timer in October, and the November re-scan says it is gone".
   */
  function saveAudit() {
    if (!hasResults || !ready) return;
    const audit: SavedAudit = {
      id: uid("a"),
      buildingId: building.id,
      at: new Date().toISOString(),
      areas: photos.filter((p) => p.result).map((p) => p.name),
      offenders,
      settings,
      mode: auditMode,
      engine: photos.find((p) => p.result)?.result?.engine ?? "unknown",
    };
    addAudit(audit);
    setSavedAuditId(audit.id);
  }

  return (
    <section id="scanner" className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 pt-24 sm:px-6">
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 grad-energy-bg" />
          <span className="mono-label text-cyan">phantom-load audit</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-fog sm:text-4xl">
          Walk the building. Snap what&apos;s still running.
        </h1>
        <p className="mt-3 max-w-2xl text-mist">
          Add photos of empty rooms at 4pm or after hours. A local vision model tags every device
          left drawing power; the ranked list below is what facilities can act on Monday - costed,
          with a one-tap fix for each. New here?{" "}
          <Link href="/about" className="text-cyan underline-offset-4 hover:underline">
            See how it works
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* ---- intake column ---- */}
        <div className="space-y-4">
          <div className="panel p-4 sm:p-5">
            <div className="mono-label">intake</div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                onClick={() => uploadRef.current?.click()}
                className="group flex flex-col items-center gap-2 border border-line bg-surface2/60 px-3 py-5 transition-colors hover:border-cyan"
              >
                <UploadIcon className="h-6 w-6 text-cyan" />
                <span className="font-mono text-[0.7rem] tracking-wider uppercase text-mist group-hover:text-fog">
                  Upload
                </span>
              </button>
              <button
                onClick={() => cameraRef.current?.click()}
                className="group flex flex-col items-center gap-2 border border-line bg-surface2/60 px-3 py-5 transition-colors hover:border-cyan"
              >
                <CameraIcon className="h-6 w-6 text-cyan" />
                <span className="font-mono text-[0.7rem] tracking-wider uppercase text-mist group-hover:text-fog">
                  Camera
                </span>
              </button>
            </div>

            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <button
              onClick={addEstimate}
              className="mt-3 w-full border border-dashed border-line2 px-3 py-2.5 text-left font-mono text-[0.72rem] tracking-wider text-dim transition-colors hover:border-amber hover:text-amber"
            >
              + no photo? add a room-profile estimate
            </button>
          </div>

          {/* building context - drives every number below */}
          {ready && (
            <BuildingBar
              building={building}
              buildings={store.buildings}
              liveRate={liveRate}
              onFetchRate={fetchLiveRate}
            />
          )}

          {/* settings */}
          <div className="panel">
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3.5"
            >
              <span className="mono-label">override assumptions</span>
              <span className="font-mono text-xs text-mist">
                {settings.ratePerKwh.toFixed(3)} $/kWh
                <span className="ml-2 text-cyan">{showSettings ? "−" : "+"}</span>
              </span>
            </button>
            <AnimatePresence initial={false}>
              {showSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 border-t border-line px-4 py-4">
                    <p className="text-[0.75rem] leading-relaxed text-dim">
                      These are filled in from the building above. Change one only if you
                      have a figure off an actual bill - that is always better than ours.
                    </p>
                    <Field
                      label="electricity rate ($/kWh)"
                      value={settings.ratePerKwh}
                      step={0.01}
                      onChange={(v) => setOverride((s) => ({ ...s, ratePerKwh: v }))}
                    />
                    <Field
                      label="grid carbon (kg CO₂ / kWh)"
                      value={settings.co2PerKwh}
                      step={0.005}
                      onChange={(v) => setOverride((s) => ({ ...s, co2PerKwh: v }))}
                    />
                    <Field
                      label="empty hours / year"
                      value={settings.unoccupiedHoursPerYear}
                      step={100}
                      onChange={(v) => setOverride((s) => ({ ...s, unoccupiedHoursPerYear: v }))}
                    />
                    <Field
                      label="demand charge ($/kW-month, optional)"
                      value={settings.demandChargePerKw ?? 0}
                      step={0.5}
                      onChange={(v) => setOverride((s) => ({ ...s, demandChargePerKw: v }))}
                    />
                    <button
                      onClick={() => {
                        setOverride({});
                        setLiveRate(null);
                      }}
                      className="font-mono text-[0.7rem] tracking-wider text-dim hover:text-cyan"
                    >
                      ↺ back to the building&apos;s own figures
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* queue */}
          {photos.length > 0 && (
            <div className="panel p-4">
              <div className="flex items-center justify-between">
                <span className="mono-label">queue · {photos.length}</span>
                <button
                  onClick={() => setPhotos([])}
                  className="font-mono text-[0.68rem] tracking-wider text-dim hover:text-ember"
                >
                  clear all
                </button>
              </div>
              <div className="mt-3 space-y-2.5">
                {photos.map((p) => (
                  <PhotoRow key={p.id} entry={p} onPatch={patch} onRemove={remove} />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={runAll}
            disabled={pendingCount === 0 || running}
            className="relative w-full overflow-hidden border border-cyan bg-cyan/10 px-4 py-3.5 font-mono text-sm font-bold tracking-[0.16em] uppercase text-cyan transition-colors enabled:hover:bg-cyan/20 disabled:cursor-not-allowed disabled:border-line disabled:text-dim"
          >
            {running ? "scanning…" : pendingCount > 0 ? `run audit · ${pendingCount}` : "audit complete"}
            {running && (
              <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan to-transparent scan-line" />
            )}
          </button>
        </div>

        {/* ---- results column ---- */}
        <div className="space-y-5">
          {hasResults ? (
            <>
              <TotalsHeader
                cost={totals.costPerYear}
                costLow={totals.costLowPerYear}
                costHigh={totals.costHighPerYear}
                co2={totals.co2KgPerYear}
                kwh={totals.kwhPerYear}
                recoverable={totals.recoverableCost}
                topLabel={totals.topOffender?.label ?? "-"}
                liveCount={liveCount}
                photoCount={photos.filter((p) => p.result).length}
              />

              <ExportBar
                offenders={offenders}
                settings={settings}
                buildingName={building.name}
                onSave={ready ? saveAudit : undefined}
                saved={savedAuditId !== null}
              />

              <ContributeBar
                offenders={offenders}
                mode={auditMode}
                defaultArea={photos.find((p) => p.result)?.name ?? building.name}
              />

              <TabBar tab={tab} onChange={setTab} count={ranked.length} />

              {tab === "offenders" && (
                <div className="space-y-4">
                  <AnimatePresence>
                    {ranked.map((r, i) => (
                      <OffenderCard
                        key={r.offender.id}
                        offender={r.offender}
                        rank={i + 1}
                        maxCost={maxCost}
                        mode={r.mode}
                        engine={r.engine}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {tab === "plan" && <BudgetPlanner offenders={offenders} />}

              {tab === "grid" && (
                <div className="space-y-5">
                  <GridPulse
                    regionCode={building.regionCode}
                    annualKwhWasted={totals.kwhPerYear}
                  />
                  <WeatherContext
                    lat={building.lat}
                    lon={building.lon}
                    offenders={offenders}
                  />
                  <SolarOffset
                    lat={building.lat}
                    lon={building.lon}
                    regionCode={building.regionCode}
                    annualKwhWasted={totals.kwhPerYear}
                    ratePerKwh={settings.ratePerKwh}
                    co2PerKwh={settings.co2PerKwh}
                  />
                </div>
              )}

              {tab === "context" && (
                <div className="space-y-5">
                  <LoadMixPanel offenders={offenders} />
                  <EquivalenceStrip
                    co2Kg={totals.co2KgPerYear}
                    dollars={totals.costPerYear}
                  />
                  <BenchmarkPanel
                    offenders={offenders}
                    building={building}
                    settings={settings}
                  />
                  <BillCalibration
                    bill={building.bill}
                    auditKwhPerYear={totals.kwhPerYear}
                    assumedRate={settings.ratePerKwh}
                    floorAreaSqFt={building.floorAreaSqFt}
                    typeId={building.typeId}
                  />
                </div>
              )}
            </>
          ) : (
            <EmptyState running={running} />
          )}
        </div>
      </div>
    </section>
  );
}

// ---- subcomponents -----------------------------------------------------

function TabBar({
  tab,
  onChange,
  count,
}: {
  tab: ResultTab;
  onChange: (t: ResultTab) => void;
  count: number;
}) {
  const tabs: { id: ResultTab; label: string; hint: string }[] = [
    { id: "offenders", label: `offenders · ${count}`, hint: "What is running" },
    { id: "plan", label: "plan", hint: "What to do with the money you have" },
    { id: "grid", label: "grid", hint: "When to burn it, and what would cancel it" },
    { id: "context", label: "context", hint: "What it means and how you compare" },
  ];
  return (
    <div className="flex border border-line bg-surface2/40">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          title={t.hint}
          className={`relative flex-1 px-3 py-2.5 font-mono text-[0.7rem] tracking-[0.14em] uppercase transition-colors ${
            tab === t.id ? "text-fog" : "text-dim hover:text-mist"
          }`}
        >
          {t.label}
          {tab === t.id && (
            <motion.span
              layoutId="tab-underline"
              className="absolute inset-x-2 bottom-0 h-px bg-gradient-to-r from-cyan to-lime"
            />
          )}
        </button>
      ))}
    </div>
  );
}

function TotalsHeader({
  cost,
  costLow,
  costHigh,
  co2,
  kwh,
  recoverable,
  topLabel,
  liveCount,
  photoCount,
}: {
  cost: number;
  costLow: number;
  costHigh: number;
  co2: number;
  kwh: number;
  recoverable: number;
  topLabel: string;
  liveCount: number;
  photoCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel ticked relative overflow-hidden p-5 sm:p-6"
    >
      <div className="absolute inset-0 -z-10 opacity-60"
        style={{ background: "radial-gradient(60% 120% at 100% 0%, rgba(47,230,207,0.12), transparent 60%)" }}
      />
      <div className="flex items-center justify-between">
        <span className="mono-label text-cyan">bleeding while you sleep</span>
        <span className="font-mono text-[0.68rem] tracking-wider text-dim">
          {photoCount} area{photoCount === 1 ? "" : "s"} · {liveCount} live
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <BigStat label="wasted / year" accent value={<CountUp value={cost} format={fmtMoneyFull} />} />
        <BigStat label="CO₂ / year" value={<CountUp value={co2} format={fmtCo2} />} />
        <BigStat label="energy / year" value={<CountUp value={kwh} format={fmtKwh} />} />
        <BigStat label="recoverable / yr" value={<CountUp value={recoverable} format={fmtMoneyFull} />} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
        <span className="font-mono text-[0.72rem] tracking-wider text-mist">
          biggest offender: <span className="text-lime">{topLabel}</span>
        </span>
        {/* The band is the honest version of the headline number. */}
        <span
          className="font-mono text-[0.72rem] tracking-wider text-dim"
          title="Range across the published wattage spread for these device classes"
        >
          plausible range {fmtMoney(costLow)} – {fmtMoney(costHigh)} / yr
        </span>
      </div>
    </motion.div>
  );
}

function BigStat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <div
        className={`font-mono text-2xl font-bold sm:text-3xl ${accent ? "grad-energy text-glow" : "text-fog"}`}
      >
        {value}
      </div>
      <div className="mono-label mt-1">{label}</div>
    </div>
  );
}

function PhotoRow({
  entry,
  onPatch,
  onRemove,
}: {
  entry: PhotoEntry;
  onPatch: (id: string, p: Partial<PhotoEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const statusColor =
    entry.status === "done"
      ? "var(--color-cyan)"
      : entry.status === "scanning"
        ? "var(--color-lime)"
        : entry.status === "error"
          ? "var(--color-ember)"
          : "var(--color-dim)";

  return (
    <div className="flex items-center gap-3 border border-line bg-surface2/50 p-2">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden border border-line bg-surface">
        {entry.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.dataUrl} alt={entry.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center font-mono text-[0.6rem] text-dim">EST</div>
        )}
        {entry.status === "scanning" && (
          <span className="absolute inset-x-0 top-0 h-px bg-lime scan-line" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0" style={{ background: statusColor }} />
          <input
            value={entry.name}
            onChange={(e) => onPatch(entry.id, { name: e.target.value })}
            className="w-full bg-transparent font-mono text-xs text-fog outline-none focus:text-cyan"
          />
        </div>
        <select
          value={entry.roomType}
          onChange={(e) => onPatch(entry.id, { roomType: e.target.value })}
          className="mt-1 w-full bg-surface font-mono text-[0.68rem] text-mist outline-none"
        >
          {ROOM_TYPES.map((r) => (
            <option key={r.id} value={r.id} className="bg-surface text-fog">
              {r.label}
            </option>
          ))}
        </select>
        {entry.status === "error" && (
          <p className="mt-1 font-mono text-[0.62rem] text-ember">{entry.error}</p>
        )}
      </div>

      <button
        onClick={() => onRemove(entry.id)}
        className="shrink-0 px-1.5 text-dim transition-colors hover:text-ember"
        aria-label="remove"
      >
        ✕
      </button>
    </div>
  );
}

function EmptyState({ running }: { running: boolean }) {
  return (
    <div className="panel grid min-h-[420px] place-items-center p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center border border-line2 bg-surface2">
          <div className={`h-3 w-3 grad-energy-bg ${running ? "pulse-dot" : ""}`} />
        </div>
        <h3 className="text-lg font-semibold text-fog">
          {running ? "Reading the room…" : "No audit yet"}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          {running
            ? "The local vision model is identifying devices. Ranked offenders appear here as each area finishes."
            : "Add a few photos (or a room-profile estimate), then run the audit. The biggest phantom-load offenders show up here, ranked by dollars."}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
      />
    </label>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
