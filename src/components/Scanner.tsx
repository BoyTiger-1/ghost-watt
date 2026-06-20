"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { OffenderCard } from "./OffenderCard";
import { CountUp } from "./CountUp";
import { downscaleImage } from "@/lib/image";
import { ROOM_TYPES } from "@/lib/parse";
import { aggregate, fmtCo2, fmtKwh, fmtMoneyFull } from "@/lib/energy";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { AnalysisResult, AuditSettings, Offender } from "@/lib/types";

type PhotoStatus = "idle" | "scanning" | "done" | "error";

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
  const [settings, setSettings] = useState<AuditSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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

  const totals = useMemo(() => aggregate(ranked.map((r) => r.offender)), [ranked]);
  const maxCost = ranked[0]?.offender.costPerYear ?? 0;
  const hasResults = ranked.length > 0;
  const liveCount = photos.filter((p) => p.result?.mode === "live").length;

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

          {/* settings */}
          <div className="panel">
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3.5"
            >
              <span className="mono-label">assumptions</span>
              <span className="font-mono text-xs text-mist">
                {settings.ratePerKwh.toFixed(2)} $/kWh · {settings.unoccupiedHoursPerYear} h
                <span className="ml-2 text-cyan">{showSettings ? "-" : "+"}</span>
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
                    <Field
                      label="electricity rate ($/kWh)"
                      value={settings.ratePerKwh}
                      step={0.01}
                      onChange={(v) => setSettings((s) => ({ ...s, ratePerKwh: v }))}
                    />
                    <Field
                      label="grid carbon (kg CO₂ / kWh)"
                      value={settings.co2PerKwh}
                      step={0.005}
                      onChange={(v) => setSettings((s) => ({ ...s, co2PerKwh: v }))}
                    />
                    <Field
                      label="empty hours / year"
                      value={settings.unoccupiedHoursPerYear}
                      step={100}
                      onChange={(v) => setSettings((s) => ({ ...s, unoccupiedHoursPerYear: v }))}
                    />
                    <button
                      onClick={() => setSettings(DEFAULT_SETTINGS)}
                      className="font-mono text-[0.7rem] tracking-wider text-dim hover:text-cyan"
                    >
                      ↺ reset to US-average defaults
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
                co2={totals.co2KgPerYear}
                kwh={totals.kwhPerYear}
                recoverable={totals.recoverableCost}
                topLabel={totals.topOffender?.label ?? "-"}
                liveCount={liveCount}
                photoCount={photos.filter((p) => p.result).length}
              />
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

function TotalsHeader({
  cost,
  co2,
  kwh,
  recoverable,
  topLabel,
  liveCount,
  photoCount,
}: {
  cost: number;
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

      <div className="mt-5 border-t border-line pt-3">
        <span className="font-mono text-[0.72rem] tracking-wider text-mist">
          biggest offender: <span className="text-lime">{topLabel}</span>
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
