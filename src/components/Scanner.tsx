"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { PageHeader } from "./PageHeader";
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
import { DetectionView, type DetectionPhoto } from "./DetectionView";
import { CameraMode, type PhotoShot, type VideoShot } from "./scan/CameraMode";
import { UploadMode } from "./scan/UploadMode";
import { CaptureCard } from "./scan/CaptureCard";
import { Icon } from "./scan/icons";
import { analysisSquare } from "@/lib/image";
import { ROOM_TYPE_BY_ID, type CategorizedObservation } from "@/lib/parse";
import { aggregate, fmtCo2, fmtKwh, fmtMoney, fmtMoneyFull } from "@/lib/energy";
import { costRange, RATE_SIGMA, type RateQuality } from "@/lib/estimate";
import { regionOrDefault } from "@/lib/grid";
import { unoccupiedHours, SCHEDULE_PRESETS } from "@/lib/schedule";
import { nowLocal } from "@/lib/exif";
import { detectStill } from "@/lib/detector";
import { readScene } from "@/lib/scene";
import { itemsToObservations, peopleIn, readItems, type LiveItem } from "@/lib/ondevice";
import { PixelReader, annotateFrame, baseName, loadImage, readPhotoFile, videoFileKeyframes } from "@/lib/media";
import {
  captureId,
  captureSettings,
  costCapture,
  parseOffenderKey,
  promptContext,
  resolveResult,
  type Capture,
  type CaptureDetails,
  type DeviceAdjust,
  type GeoContext,
} from "@/lib/capture";
import { uid, type Building, type SavedAudit } from "@/lib/storage";
import { addAudit, addBuilding, currentStore, newBuilding, useStore } from "@/lib/useStore";
import type { AnalysisResult, AuditSettings, Offender } from "@/lib/types";

type Mode = "camera" | "upload";
type ResultTab = "offenders" | "plan" | "grid" | "context";

const ON_DEVICE_ENGINE = "On-device · EfficientDet + scene analysis";

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

// ~1 km cache: every capture from one building shares one lookup.
const geoCache = new Map<string, Promise<GeoContext | null>>();
function locate(lat: number, lon: number): Promise<GeoContext | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (!geoCache.has(key)) {
    geoCache.set(
      key,
      fetch(`/api/locate?lat=${lat}&lon=${lon}`)
        .then((r) => (r.ok ? (r.json() as Promise<GeoContext>) : null))
        .catch(() => null),
    );
  }
  return geoCache.get(key)!;
}

/** What the on-device detector reads in one still image. */
async function readStill(dataUrl: string, settings: AuditSettings) {
  const img = await loadImage(dataUrl);
  const dets = await detectStill(img).catch(() => []);
  const luma = new PixelReader(160, 120).luma(img);
  const scene = luma ? readScene(luma.data, luma.w, luma.h) : null;
  const items = readItems(dets, scene?.lights ?? [], settings, luma ?? undefined);
  return { items, scene };
}

/** Several frames of one walk: per line, the counts add up, since each keyframe is a different view. */
function mergeObservations(lists: CategorizedObservation[][]): CategorizedObservation[] {
  const out = new Map<string, CategorizedObservation>();
  for (const list of lists) {
    for (const o of list) {
      const key = `${o.categoryId}:${o.state}`;
      const cur = out.get(key);
      if (cur) cur.count += o.count;
      else out.set(key, { ...o, boxes: undefined });
    }
  }
  return [...out.values()];
}

export function Scanner() {
  const [mode, setMode] = useState<Mode>("camera");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<ResultTab>("offenders");
  const [savedAuditId, setSavedAuditId] = useState<string | null>(null);
  const [liveRate, setLiveRate] = useState<{ ratePerKwh: number; source: string } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [deviceGeo, setDeviceGeo] = useState<{ lat: number; lon: number; geo: GeoContext | null } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [override, setOverride] = useState<Partial<AuditSettings>>({});

  const capturesRef = useRef(captures);
  useEffect(() => {
    capturesRef.current = captures;
  }, [captures]);

  const store = useStore();
  const ready = store.buildings.length > 0;
  const building = store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0] ?? PLACEHOLDER_BUILDING;

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
      unoccupiedHoursPerYear: override.unoccupiedHoursPerYear ?? unoccupiedHours(building.schedule),
      regionCode: building.regionCode,
      buildingTypeId: building.typeId,
      floorAreaSqFt: building.floorAreaSqFt,
      demandChargePerKw: override.demandChargePerKw,
    }),
    [override, liveRate, region, building],
  );
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const rateOverridden = override.ratePerKwh !== undefined || liveRate !== null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

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

  // ---- device location --------------------------------------------------

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const geo = await locate(lat, lon);
        setDeviceGeo({ lat, lon, geo });
        setGeoBusy(false);
      },
      () => {
        setGeoBusy(false);
        setToast("Location unavailable: using the building's rates instead.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }, []);

  // Ask only if the browser already allows it: a permission prompt on page load is rude.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => p.state === "granted" && requestLocation())
      .catch(() => {});
  }, [requestLocation]);

  // ---- captures ---------------------------------------------------------

  const patch = useCallback((id: string, p: Partial<Capture>) => {
    setCaptures((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }, []);

  const add = useCallback((c: Capture) => {
    setSavedAuditId(null);
    setCaptures((prev) => [c, ...prev]);
  }, []);

  const counter = useRef({ photo: 0, video: 0 });
  const nextName = (kind: "photo" | "video") =>
    `${kind === "photo" ? "Photo" : "Video"} ${String(++counter.current[kind]).padStart(2, "0")}`;

  function blank(kind: Capture["kind"], origin: Capture["origin"], name: string): Capture {
    return { id: captureId(), name, kind, origin, dataUrl: null, meta: {}, details: {}, adjust: {}, roomType: "unknown", status: "pending" };
  }

  function onPhoto(shot: PhotoShot) {
    const c = blank("photo", "camera", nextName("photo"));
    add({
      ...c,
      dataUrl: shot.dataUrl,
      onDevice: itemsToObservations(shot.items),
      meta: {
        takenAt: nowLocal(),
        brightness: shot.scene?.brightness,
        lighting: shot.scene?.lighting,
        people: peopleIn(shot.items),
        ...(deviceGeo ? { lat: deviceGeo.lat, lon: deviceGeo.lon, locationFrom: "device" as const } : {}),
      },
      geo: deviceGeo?.geo ?? undefined,
    });
  }

  function onVideo(shot: VideoShot) {
    const c = blank("video", "camera", nextName("video"));
    add({
      ...c,
      dataUrl: shot.keyframes[0]?.dataUrl ?? null,
      videoUrl: shot.url,
      duration: shot.duration,
      keyframes: shot.keyframes,
      meta: {
        takenAt: nowLocal(),
        ...(deviceGeo ? { lat: deviceGeo.lat, lon: deviceGeo.lon, locationFrom: "device" as const } : {}),
      },
      geo: deviceGeo?.geo ?? undefined,
    });
  }

  const onFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const isVideo = file.type.startsWith("video/") || /\.(mov|mp4|webm)$/i.test(file.name);
        const c: Capture = {
          id: captureId(),
          name: baseName(file.name),
          kind: isVideo ? "video" : "photo",
          origin: "upload",
          dataUrl: null,
          meta: { bytes: file.size },
          details: {},
          adjust: {},
          roomType: "unknown",
          status: "working",
          stage: isVideo ? "Finding keyframes" : "Reading photo",
          progress: 0.05,
        };
        add(c);
        try {
          if (isVideo) {
            const url = URL.createObjectURL(file);
            patch(c.id, { videoUrl: url });
            const v = await videoFileKeyframes(url, (f) => patch(c.id, { progress: 0.05 + f * 0.3 }));
            if (!v.keyframes.length) throw new Error("No usable frames in that video.");
            patch(c.id, {
              status: "pending",
              dataUrl: v.keyframes[0].dataUrl,
              keyframes: v.keyframes,
              duration: v.duration,
              meta: { bytes: file.size, width: v.width, height: v.height },
            });
          } else {
            const photo = await readPhotoFile(file);
            patch(c.id, {
              status: "pending",
              dataUrl: photo.dataUrl,
              meta: { ...photo.meta, ...(photo.meta.lat !== undefined ? { locationFrom: "exif" as const } : {}) },
            });
          }
        } catch (err) {
          patch(c.id, { status: "error", error: err instanceof Error ? err.message : "Couldn't read that file." });
        }
      }
    },
    [add, patch],
  );

  function addEstimate() {
    const c = blank("photo", "upload", `Estimate ${String(captures.length + 1).padStart(2, "0")}`);
    const roomType = "classroom";
    add({
      ...c,
      roomType,
      status: "done",
      result: {
        mode: "fallback",
        engine: `room preset · ${ROOM_TYPE_BY_ID[roomType].label}`,
        source: c.name,
        offenders: [],
        notice: "Estimated from a typical room profile - no photo.",
        fallbackReason: "requested",
      },
    });
  }

  // ---- the analysis queue -------------------------------------------------

  const busyRef = useRef(false);
  const analyze = useCallback(
    async (id: string) => {
      const get = () => capturesRef.current.find((c) => c.id === id);
      let c = get();
      if (!c) return;
      patch(id, { status: "working", stage: "Reading on device", progress: 0.4, error: undefined });
      try {
        const s = settingsRef.current;
        // 1. What the detector and the pixels say, unless the camera already said it.
        let onDevice = c.onDevice;
        let meta = c.meta;
        let keyframes = c.keyframes;
        if (!onDevice && c.kind === "photo" && c.dataUrl) {
          const { items, scene } = await readStill(c.dataUrl, s);
          onDevice = itemsToObservations(items);
          meta = { ...meta, brightness: scene?.brightness, lighting: scene?.lighting, people: peopleIn(items) };
        } else if (!onDevice && c.kind === "video" && keyframes?.length) {
          const reads: { items: LiveItem[]; scene: ReturnType<typeof readScene> | null }[] = [];
          for (const k of keyframes) reads.push(await readStill(k.dataUrl, s));
          keyframes = await Promise.all(keyframes.map(async (k, i) => ({ ...k, annotated: await annotateFrame(k.dataUrl, reads[i].items) })));
          onDevice = mergeObservations(reads.map((r) => itemsToObservations(r.items)));
          const lit = reads.filter((r) => r.scene?.lighting === "on").length;
          meta = {
            ...meta,
            brightness: reads.reduce((a, r) => a + (r.scene?.brightness ?? 0), 0) / reads.length,
            lighting: lit ? "on" : reads.every((r) => r.scene?.lighting === "off") ? "off" : "unclear",
            people: Math.max(0, ...reads.map((r) => peopleIn(r.items))),
          };
        }
        patch(id, { onDevice, meta, keyframes, progress: 0.5 });

        // 2. Where it is: the local tariff and grid.
        let geo = c.geo;
        if (geo === undefined && meta.lat !== undefined && meta.lon !== undefined) {
          patch(id, { stage: "Finding the local utility" });
          geo = await locate(meta.lat, meta.lon);
          patch(id, { geo });
        }

        // 3. The full AI reading.
        c = get() ?? c;
        patch(id, { stage: c.kind === "video" ? `AI reading ${keyframes?.length ?? 0} frames` : "AI reading the photo", progress: 0.65 });
        const context = promptContext({ ...c, onDevice, meta, geo }, building.schedule);
        let body: Record<string, unknown>;
        if (c.kind === "video") {
          body = { images: (keyframes ?? []).map((k) => k.dataUrl) };
        } else {
          const square = c.dataUrl ? await analysisSquare(c.dataUrl, 0.8) : null;
          body = { image: square?.dataUrl, frame: square?.frame };
        }
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, roomType: c.roomType, source: c.name, settings: s, context }),
        });
        if (!res.ok) throw new Error(res.status === 413 ? "That capture is too large to send." : `Server returned ${res.status}`);
        const result = resolveResult((await res.json()) as AnalysisResult, onDevice, ON_DEVICE_ENGINE);
        patch(id, { status: "done", result, stage: undefined, progress: undefined });
      } catch (err) {
        // Offline or the server is down: the device's own reading still stands.
        const onDevice = get()?.onDevice;
        if (onDevice?.length) {
          patch(id, {
            status: "done",
            stage: undefined,
            progress: undefined,
            result: {
              mode: "live",
              engine: ON_DEVICE_ENGINE,
              source: c.name,
              offenders: [],
              observations: onDevice,
              notice: "Couldn't reach the AI. Read on this device instead: screens, laptops, appliances and lit fixtures only.",
            },
          });
        } else {
          patch(id, { status: "error", stage: undefined, progress: undefined, error: err instanceof Error ? err.message : "Analysis failed" });
        }
      }
    },
    [patch, building.schedule],
  );

  // One at a time: hosted vision endpoints rate-limit, and order is what the user expects.
  useEffect(() => {
    if (busyRef.current) return;
    const next = [...captures].reverse().find((c) => c.status === "pending");
    if (!next) return;
    busyRef.current = true;
    analyze(next.id).finally(() => {
      busyRef.current = false;
      // Wake the effect for whatever is queued behind it.
      setCaptures((prev) => [...prev]);
    });
  }, [captures, analyze]);

  const setDetails = (id: string, d: Partial<CaptureDetails>) => {
    setSavedAuditId(null);
    setCaptures((prev) => prev.map((c) => (c.id === id ? { ...c, details: { ...c.details, ...d } } : c)));
  };

  const setAdjust = (offenderId: string, a: DeviceAdjust) => {
    const key = parseOffenderKey(offenderId);
    if (!key) return;
    setSavedAuditId(null);
    setCaptures((prev) =>
      prev.map((c) => (c.id === key.captureId ? { ...c, adjust: { ...c.adjust, [key.categoryId]: a } } : c)),
    );
  };

  function remove(id: string) {
    setCaptures((prev) => {
      const c = prev.find((x) => x.id === id);
      if (c?.videoUrl) URL.revokeObjectURL(c.videoUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  // ---- pricing ------------------------------------------------------------

  const priced = useMemo(
    () =>
      captures.map((c) => {
        const { settings: s, rateQuality } = captureSettings(settings, c, rateOverridden);
        return { c, offenders: costCapture(c, s), rateQuality };
      }),
    [captures, settings, rateOverridden],
  );

  const ranked = useMemo(() => {
    const flat: { offender: Offender; mode: AnalysisResult["mode"]; engine: string }[] = [];
    for (const p of priced) {
      if (!p.c.result) continue;
      for (const o of p.offenders) flat.push({ offender: o, mode: p.c.result.mode, engine: p.c.result.engine });
    }
    return flat.sort((a, b) => b.offender.costPerYear - a.offender.costPerYear);
  }, [priced]);

  const offenders = useMemo(() => ranked.map((r) => r.offender), [ranked]);
  const totals = useMemo(() => aggregate(offenders), [offenders]);
  const done = priced.filter((p) => p.c.result);
  const rateQuality = useMemo<RateQuality>(() => {
    // The loosest price among the captures bounds the whole range.
    const qs = done.map((p) => p.rateQuality);
    return qs.length ? qs.reduce((a, b) => (RATE_SIGMA[b] > RATE_SIGMA[a] ? b : a)) : "national";
  }, [done]);
  const range = useMemo(() => costRange(offenders, rateQuality), [offenders, rateQuality]);
  const maxCost = ranked[0]?.offender.costPerYear ?? 0;
  const hasResults = done.length > 0;
  const working = captures.some((c) => c.status === "working" || c.status === "pending");

  const detectionPhotos = useMemo<DetectionPhoto[]>(
    () =>
      priced
        .filter((p) => p.c.kind === "photo" && p.c.dataUrl && p.c.result)
        .map((p) => ({
          id: p.c.id,
          name: p.c.name,
          dataUrl: p.c.dataUrl!,
          mode: p.c.result!.mode,
          engine: p.c.result!.engine,
          offenders: p.offenders,
          sightings: p.c.result!.sightings,
        })),
    [priced],
  );

  /** live / fallback / mixed across every capture scanned so far. */
  const auditMode = useMemo<SavedAudit["mode"]>(() => {
    const modes = new Set(done.map((p) => p.c.result!.mode));
    return modes.size > 1 ? "mixed" : modes.has("live") ? "live" : "fallback";
  }, [done]);

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
      areas: done.map((p) => p.c.name),
      offenders,
      settings,
      mode: auditMode,
      engine: done[0]?.c.result?.engine ?? "unknown",
    };
    addAudit(audit);
    setSavedAuditId(audit.id);
  }

  const basisMix = useMemo(() => {
    const m = { measured: 0, ai: 0, catalog: 0 };
    for (const o of offenders) m[o.basis ?? "catalog"]++;
    return m;
  }, [offenders]);

  return (
    <section id="scanner" className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 pt-[4.25rem] sm:px-6 md:pt-24">
      <div className="mb-3 flex flex-col gap-4 md:mb-6 md:flex-row md:items-end md:justify-between">
        <PageHeader eyebrow="Scanner" title="Point at the building." accent="See what it's costing you." className="hidden md:block">
          Live detection on the camera, a full AI audit on every photo or walkthrough video, priced for your utility.{" "}
          <Link href="/methodology" className="text-cyan underline decoration-cyan/30 underline-offset-4 hover:decoration-cyan">
            How the numbers work
          </Link>
          .
        </PageHeader>
        <h1 className="sr-only">Scanner</h1>
        <ModeSwitch mode={mode} onChange={setMode} />
      </div>

      {mode === "camera" ? (
        <CameraMode
          settings={settings}
          schedule={building.schedule}
          geo={deviceGeo?.geo ?? null}
          geoBusy={geoBusy}
          onLocate={requestLocation}
          onPhoto={onPhoto}
          onVideo={onVideo}
          onUseUpload={() => setMode("upload")}
        />
      ) : (
        <UploadMode onFiles={onFiles} />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* ---- captures ---- */}
        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="mono-label">captures · {captures.length}</span>
            <div className="flex items-center gap-3">
              <button onClick={addEstimate} className="text-[0.74rem] text-dim hover:text-amber">
                + estimate without a photo
              </button>
              {captures.length > 0 && (
                <button onClick={() => setCaptures([])} className="text-[0.74rem] text-dim hover:text-ember">
                  Clear
                </button>
              )}
            </div>
          </div>
          {captures.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line2 px-4 py-6 text-center text-[0.84rem] leading-relaxed text-mist">
              {mode === "camera"
                ? "Take a photo or record a walkthrough. Each one shows up here as it's analysed."
                : "Photos and videos you add show up here as they're analysed."}
            </div>
          )}
          <AnimatePresence initial={false}>
            {priced.map(({ c, offenders: os }) => (
              <CaptureCard
                key={c.id}
                capture={c}
                cost={os.reduce((s, o) => s + o.costPerYear, 0)}
                devices={os.reduce((s, o) => s + o.count, 0)}
                schedule={building.schedule}
                defaultOpen={c.origin === "upload" && captures.length <= 2}
                onDetails={(d) => setDetails(c.id, d)}
                onPatch={(p) => patch(c.id, p)}
                onReanalyze={() => patch(c.id, { status: "pending", result: undefined })}
                onRemove={() => remove(c.id)}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* ---- results ---- */}
        <div className="min-w-0 space-y-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {hasResults ? (
            <>
              <TotalsHeader
                cost={totals.costPerYear}
                range={range}
                rateQuality={rateQuality}
                co2={totals.co2KgPerYear}
                kwh={totals.kwhPerYear}
                recoverable={totals.recoverableCost}
                topLabel={totals.topOffender?.label ?? "-"}
                captures={done.length}
                basisMix={basisMix}
                working={working}
              />

              <ExportBar offenders={offenders} settings={settings} buildingName={building.name} onSave={ready ? saveAudit : undefined} saved={savedAuditId !== null} />

              <ContributeBar offenders={offenders} mode={auditMode} defaultArea={done[0]?.c.name ?? building.name} />

              <TabBar tab={tab} onChange={setTab} count={ranked.length} />

              {tab === "offenders" && (
                <div className="space-y-4">
                  {detectionPhotos.length > 0 && <DetectionView photos={detectionPhotos} hovered={hovered} onHover={setHovered} />}
                  {ranked.length === 0 && (
                    <div className="panel p-6 text-center text-[0.9rem] text-mist">
                      Nothing left drawing power in what&apos;s been scanned so far. That&apos;s the result you want.
                    </div>
                  )}
                  <AnimatePresence>
                    {ranked.map((r, i) => {
                      const key = parseOffenderKey(r.offender.id);
                      const cap = key ? captures.find((c) => c.id === key.captureId) : undefined;
                      return (
                        <OffenderCard
                          key={r.offender.id}
                          offender={r.offender}
                          rank={i + 1}
                          maxCost={maxCost}
                          mode={r.mode}
                          engine={r.engine}
                          highlighted={hovered === r.offender.id}
                          onHover={setHovered}
                          adjust={key ? cap?.adjust[key.categoryId] : undefined}
                          onAdjust={(a) => setAdjust(r.offender.id, a)}
                        />
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}

              {tab === "plan" && <BudgetPlanner offenders={offenders} />}

              {tab === "grid" && (
                <div className="space-y-5">
                  <GridPulse regionCode={building.regionCode} annualKwhWasted={totals.kwhPerYear} />
                  <WeatherContext lat={building.lat ?? deviceGeo?.lat} lon={building.lon ?? deviceGeo?.lon} offenders={offenders} />
                  <SolarOffset
                    lat={building.lat ?? deviceGeo?.lat}
                    lon={building.lon ?? deviceGeo?.lon}
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
                  <EquivalenceStrip co2Kg={totals.co2KgPerYear} dollars={totals.costPerYear} />
                  <BenchmarkPanel offenders={offenders} building={building} settings={settings} />
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
            <EmptyState working={working} mode={mode} />
          )}
        </div>

        {/* ---- assumptions ---- */}
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
          {ready && <BuildingBar building={building} buildings={store.buildings} liveRate={liveRate} onFetchRate={fetchLiveRate} />}

          <div className="panel">
            <button onClick={() => setShowSettings((s) => !s)} className="flex w-full items-center justify-between px-4 py-3.5" aria-expanded={showSettings}>
              <span className="mono-label">Override assumptions</span>
              <span className="font-mono text-xs text-mist">
                {settings.ratePerKwh.toFixed(3)} $/kWh
                <span className="ml-2 text-cyan">{showSettings ? "−" : "+"}</span>
              </span>
            </button>
            <AnimatePresence initial={false}>
              {showSettings && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="space-y-4 border-t border-line px-4 py-4">
                    <p className="text-[0.75rem] leading-relaxed text-dim">
                      Filled in from the building above, or from where each capture was taken. Change one only if you have a figure off an
                      actual bill - that beats every estimate, and tightens the range.
                    </p>
                    <Field label="electricity rate ($/kWh)" value={settings.ratePerKwh} step={0.01} onChange={(v) => setOverride((s) => ({ ...s, ratePerKwh: v }))} />
                    <Field label="grid carbon (kg CO₂ / kWh)" value={settings.co2PerKwh} step={0.005} onChange={(v) => setOverride((s) => ({ ...s, co2PerKwh: v }))} />
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
                      className="text-[0.7rem] text-dim hover:text-cyan"
                    >
                      ↺ back to the building&apos;s own figures
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            role="status"
            className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-sm rounded-2xl bg-fog px-4 py-3 text-center text-[0.85rem] text-ink shadow-lg md:bottom-6"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ---- subcomponents -----------------------------------------------------

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opts: { id: Mode; label: string; icon: "camera" | "upload" }[] = [
    { id: "camera", label: "Camera", icon: "camera" },
    { id: "upload", label: "Upload", icon: "upload" },
  ];
  return (
    <div className="grid grid-cols-2 rounded-full bg-fog/[0.06] p-1 md:w-[260px]" role="tablist" aria-label="Scan mode">
      {opts.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={mode === o.id}
          onClick={() => onChange(o.id)}
          className={`relative flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[0.9rem] font-medium transition-colors ${
            mode === o.id ? "text-fog" : "text-dim hover:text-mist"
          }`}
        >
          {mode === o.id && (
            <motion.span
              layoutId="scan-mode-pill"
              className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_rgba(28,27,24,0.08),0_4px_12px_-6px_rgba(28,27,24,0.25)]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <Icon name={o.icon} className="relative h-[1.1rem] w-[1.1rem]" />
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function TabBar({ tab, onChange, count }: { tab: ResultTab; onChange: (t: ResultTab) => void; count: number }) {
  const tabs: { id: ResultTab; label: string; hint: string }[] = [
    { id: "offenders", label: "Offenders", hint: "What is running" },
    { id: "plan", label: "Plan", hint: "What to do with the money you have" },
    { id: "grid", label: "Grid", hint: "When to burn it, and what would cancel it" },
    { id: "context", label: "Context", hint: "What it means and how you compare" },
  ];
  return (
    <div className="flex rounded-full bg-fog/[0.05] p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onChange(t.id)}
          title={t.hint}
          className={`relative flex-1 whitespace-nowrap rounded-full px-2 py-2 text-[0.85rem] transition-colors ${tab === t.id ? "text-fog" : "text-dim hover:text-mist"}`}
        >
          {tab === t.id && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_rgba(28,27,24,0.08),0_4px_12px_-6px_rgba(28,27,24,0.2)]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative">
            {t.label}
            {t.id === "offenders" && <span className="ml-1 tabular-nums text-dim">{count}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

const RATE_WORDS: Record<RateQuality, string> = {
  bill: "your bill's rate",
  utility: "your utility's rate",
  state: "a state-average rate",
  national: "the national-average rate",
};

function TotalsHeader({
  cost,
  range,
  rateQuality,
  co2,
  kwh,
  recoverable,
  topLabel,
  captures,
  basisMix,
  working,
}: {
  cost: number;
  range: ReturnType<typeof costRange>;
  rateQuality: RateQuality;
  co2: number;
  kwh: number;
  recoverable: number;
  topLabel: string;
  captures: number;
  basisMix: { measured: number; ai: number; catalog: number };
  working: boolean;
}) {
  const lines = basisMix.measured + basisMix.ai + basisMix.catalog;
  // Precision: how tight the 80% band is, as a share of the headline.
  const precision = Math.max(0, Math.min(1, 1 - range.spread));
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel ticked relative overflow-hidden p-5 sm:p-6">
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{ background: "radial-gradient(60% 120% at 100% 0%, rgba(239,157,46,0.1), transparent 60%)" }}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="mono-label text-cyan">bleeding while you sleep</span>
        <span className="font-mono text-[0.68rem] text-dim">
          {captures} capture{captures === 1 ? "" : "s"}
          {working && <span className="ml-1.5 text-sodium-deep">· analysing…</span>}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <BigStat label="wasted / year" accent value={<CountUp value={cost} format={fmtMoneyFull} />} />
        <BigStat label="CO₂ / year" value={<CountUp value={co2} format={fmtCo2} />} />
        <BigStat label="energy / year" value={<CountUp value={kwh} format={fmtKwh} />} />
        <BigStat label="recoverable / yr" value={<CountUp value={recoverable} format={fmtMoneyFull} />} />
      </div>

      {cost > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[0.84rem] text-fog">
              Likely <span className="font-mono font-semibold">{fmtMoney(range.p10)}</span> – <span className="font-mono font-semibold">{fmtMoney(range.p90)}</span> a year
            </span>
            <span className="font-mono text-[0.72rem] text-dim">±{Math.round(range.spread * 100)}% · 80% range</span>
          </div>
          {/* The band, drawn: where the headline sits inside what's plausible. */}
          <div className="relative mt-2.5 h-2 rounded-full bg-surface2">
            <div
              className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sodium/40 via-sodium to-sodium/40"
              style={{ left: `${(range.p10 / (range.p90 * 1.15)) * 100}%`, right: `${100 - (range.p90 / (range.p90 * 1.15)) * 100}%` }}
            />
            <div className="absolute -top-1 h-4 w-0.5 rounded bg-fog" style={{ left: `${(cost / (range.p90 * 1.15)) * 100}%` }} />
          </div>
          <p className="mt-2.5 text-[0.74rem] leading-relaxed text-dim">
            {lines > 0 && (
              <>
                {basisMix.measured > 0 && `${basisMix.measured} measured by you · `}
                {basisMix.ai > 0 && `${basisMix.ai} wattage${basisMix.ai > 1 ? "s" : ""} read by AI · `}
                {basisMix.catalog > 0 && `${basisMix.catalog} from published ranges · `}
              </>
            )}
            priced at {RATE_WORDS[rateQuality]}. {precision < 0.75 ? "Add measured watts or a bill rate to narrow it." : ""}
          </p>
        </div>
      )}

      <div className="mt-4 font-mono text-[0.72rem] text-mist">
        biggest offender: <span className="text-lime">{topLabel}</span>
      </div>
    </motion.div>
  );
}

function BigStat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className={`font-mono text-2xl font-bold sm:text-3xl ${accent ? "grad-energy text-glow" : "text-fog"}`}>{value}</div>
      <div className="mono-label mt-1">{label}</div>
    </div>
  );
}

function EmptyState({ working, mode }: { working: boolean; mode: Mode }) {
  const steps =
    mode === "camera"
      ? [
          ["Point", "Boxes appear on screens, laptops, appliances and lit fixtures, priced live."],
          ["Photo", "Tap the shutter for the full AI audit of that view, with every device located."],
          ["Video", "Record a walkthrough; the whole clip is audited once you stop."],
        ]
      : [
          ["Add", "Drop in photos or walkthrough videos from any camera."],
          ["Read", "Location and time come from the file; the AI reads every device and its wattage."],
          ["Refine", "Type in a measured wattage or hours if you know them; the numbers update instantly."],
        ];
  return (
    <div className="panel p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-line2 bg-surface2">
          <div className={`h-2.5 w-2.5 rounded-full grad-energy-bg ${working ? "pulse-dot" : ""}`} />
        </div>
        <div>
          <h3 className="text-[1.05rem] font-semibold text-fog">{working ? "Reading your capture…" : "No audit yet"}</h3>
          <p className="text-[0.84rem] text-mist">
            {working ? "Ranked offenders appear here as each capture finishes." : "Ranked offenders, costs and fixes appear here."}
          </p>
        </div>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="rounded-xl bg-surface2 px-3.5 py-3">
            <div className="font-mono text-[0.7rem] text-dim">0{i + 1}</div>
            <div className="mt-1 text-[0.92rem] font-medium text-fog">{t}</div>
            <p className="mt-1 text-[0.8rem] leading-relaxed text-mist">{d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Field({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        min={0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono text-base text-fog outline-none focus:border-cyan sm:text-sm"
      />
    </label>
  );
}
