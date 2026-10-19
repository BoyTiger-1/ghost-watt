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
import { ActionPlan } from "./ActionPlan";
import { useT } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { beep, say } from "@/lib/cues";
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
import type { CategorizedObservation } from "@/lib/parse";
import { ON_DEVICE_ENGINE, describeAnalyzeError, useEngine } from "@/lib/engine";
import { aggregate, counted, fmtCo2, fmtKwh, fmtMoney, fmtMoneyFull } from "@/lib/energy";
import { crossCheck } from "@/lib/crosscheck";
import { costRange, RATE_SIGMA, type RateQuality } from "@/lib/estimate";
import { regionOrDefault, regionRate } from "@/lib/grid";
import { occupiedHours, unoccupiedHours, SCHEDULE_BY_ID, SCHEDULE_PRESETS } from "@/lib/schedule";
import { contextForBuildingType, type UsageContext } from "@/lib/usage";
import { EfficiencyPanel } from "./EfficiencyPanel";
import { nowLocal } from "@/lib/exif";
import { readStill, type StillRead } from "@/lib/still";
import { itemsToObservations, peopleIn } from "@/lib/ondevice";
import { annotateFrame, baseName, loadImage, readPhotoFile, toJpeg, videoFileKeyframes } from "@/lib/media";
import {
  captureId,
  captureSettings,
  costCapture,
  parseOffenderKey,
  promptContext,
  type Capture,
  type CaptureDetails,
  type DeviceAdjust,
  type GeoContext,
} from "@/lib/capture";
import type { Building, SavedAudit } from "@/lib/storage";
import { addBuilding, currentStore, newBuilding, removeAudit, removeCalibration, upsertAudit, upsertCalibration, useStore } from "@/lib/useStore";
import type { AnalysisResult, AnalyzeError, AuditSettings } from "@/lib/types";

type Mode = "camera" | "upload";
type ResultTab = "offenders" | "plan" | "grid" | "context";

/** The saved-scan id a capture writes to, so a re-analysis replaces rather than duplicates. */
const auditIdFor = (captureId: string) => `scan_${captureId}`;

/** A small JPEG of a capture for the saved room list, never the full photo. */
async function thumbOf(dataUrl: string | null): Promise<string | undefined> {
  if (!dataUrl) return undefined;
  try {
    return toJpeg(await loadImage(dataUrl), 240, 0.6) ?? undefined;
  } catch {
    return undefined;
  }
}

/** The on-device reading of a capture as a result: what it is, labelled as what it is. */
function onDeviceResult(c: Pick<Capture, "name" | "onDevice">): AnalysisResult {
  const observations = c.onDevice ?? [];
  return {
    mode: "on-device",
    engine: ON_DEVICE_ENGINE,
    source: c.name,
    offenders: [],
    observations,
    notice: observations.length
      ? "Read on this device: screens, laptops, common appliances and lit fixtures only. Other device types are not recognised and counts tend to run low."
      : "The on-device detector recognised nothing powered in this picture.",
  };
}

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

type Sector = "residential" | "commercial";

// ~1 km cache: every capture from one building shares one lookup per sector.
const geoCache = new Map<string, Promise<GeoContext | null>>();
function locate(lat: number, lon: number, sector: Sector): Promise<GeoContext | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${sector}`;
  if (!geoCache.has(key)) {
    geoCache.set(
      key,
      fetch(`/api/locate?lat=${lat}&lon=${lon}&sector=${sector}`)
        .then((r) => (r.ok ? (r.json() as Promise<GeoContext>) : null))
        .catch(() => null),
    );
  }
  return geoCache.get(key)!;
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
  const t = useT();
  const prefs = usePrefs();
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  const [mode, setMode] = useState<Mode>("camera");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<ResultTab>("offenders");
  const engine = useEngine();
  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);
  const [liveRate, setLiveRate] = useState<{ ratePerKwh: number; source: string } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [deviceGeo, setDeviceGeo] = useState<{ lat: number; lon: number; geo: GeoContext | null } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const deviceGeoRef = useRef(deviceGeo);
  useEffect(() => {
    deviceGeoRef.current = deviceGeo;
  }, [deviceGeo]);
  const [toast, setToast] = useState<string | null>(null);
  const [override, setOverride] = useState<Partial<AuditSettings>>({});
  /** Where the scan is: null until chosen, then remembered on this device. */
  const [placeChoice, setPlaceChoice] = useState<UsageContext | null>(null);
  useEffect(() => {
    // Deferred so the first render matches the prerendered page.
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem("gw-place");
        if (saved === "home" || saved === "school" || saved === "office") setPlaceChoice(saved);
      } catch {
        // Storage blocked: the building's own type decides.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const choosePlace = (p: UsageContext) => {
    setPlaceChoice(p);
    try {
      localStorage.setItem("gw-place", p);
    } catch {
      // Not remembered, still applied.
    }
  };

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
  // Home, school or office decides three things: how many hours each device is
  // typically in use, which hours count as empty, and which price applies - a
  // house pays the residential rate, which can be twice the commercial one.
  const place: UsageContext = placeChoice ?? contextForBuildingType(building.typeId);
  const sector: Sector = place === "home" ? "residential" : "commercial";
  const schedule =
    place === contextForBuildingType(building.typeId) ? building.schedule : SCHEDULE_BY_ID[place].schedule;
  // A real bill beats every lookup: dollars ÷ kWh off the paper is the price this building pays.
  const billRate = building.bill && building.bill.kwh > 0 && building.bill.dollars > 0 ? building.bill.dollars / building.bill.kwh : undefined;
  const settings: AuditSettings = useMemo(
    () => ({
      ratePerKwh: override.ratePerKwh ?? billRate ?? liveRate?.ratePerKwh ?? regionRate(region, sector),
      co2PerKwh: override.co2PerKwh ?? region.co2PerKwh,
      unoccupiedHoursPerYear: override.unoccupiedHoursPerYear ?? unoccupiedHours(schedule),
      occupiedHoursPerYear: occupiedHours(schedule),
      usageContext: place,
      regionCode: building.regionCode,
      buildingTypeId: building.typeId,
      floorAreaSqFt: building.floorAreaSqFt,
      demandChargePerKw: override.demandChargePerKw,
    }),
    [override, billRate, liveRate, region, building, place, sector, schedule],
  );
  const sectorRef = useRef(sector);
  useEffect(() => {
    sectorRef.current = sector;
  }, [sector]);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  // How well the price is known: a bill or a typed figure is exact, a utility lookup close, a state table loose.
  const rateQualityBase: RateQuality = override.ratePerKwh !== undefined || billRate !== undefined ? "bill" : liveRate ? "utility" : "state";

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
        const geo = await locate(lat, lon, sectorRef.current);
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

  // Switching home / school / office changes the price sector: re-price every
  // located capture, and the phone's own location, for the new one.
  useEffect(() => {
    let alive = true;
    for (const c of capturesRef.current) {
      if (c.meta.lat === undefined || c.meta.lon === undefined || (c.geo && c.geo.sector === sector)) continue;
      locate(c.meta.lat, c.meta.lon, sector).then((geo) => {
        if (alive && geo) setCaptures((prev) => prev.map((x) => (x.id === c.id ? { ...x, geo } : x)));
      });
    }
    const d = deviceGeoRef.current;
    if (d && d.geo?.sector !== sector) {
      locate(d.lat, d.lon, sector).then((geo) => {
        if (alive) setDeviceGeo({ lat: d.lat, lon: d.lon, geo });
      });
    }
    return () => {
      alive = false;
    };
  }, [sector]);

  // ---- captures ---------------------------------------------------------

  const patch = useCallback((id: string, p: Partial<Capture>) => {
    setCaptures((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }, []);

  const add = useCallback((c: Capture) => {
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
    // Only a confirmed view counts as already read; live candidates are not a reading,
    // so an unconfirmed frame goes through the strong path like any other photo.
    const confirmedOnDevice = shot.confirmed && shot.mode === "on-device" ? itemsToObservations(shot.items) : undefined;
    add({
      ...c,
      dataUrl: shot.dataUrl,
      onDevice: confirmedOnDevice,
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
        const cloud = engineRef.current.mode === "enhanced";
        // 1. What the detector and the pixels say, unless the camera already said it.
        let onDevice = c.onDevice;
        let meta = c.meta;
        let keyframes = c.keyframes;
        // In Enhanced mode the cloud call starts at once and the on-device read
        // runs beside it; the two are compared when both are back. Waiting for
        // the detector first used to add its whole run time to every photo.
        let cloudCall: Promise<Response> | null = null;
        if (cloud && c.kind === "photo" && c.dataUrl) {
          patch(id, { stage: "Cloud model reading the photo · detector checking it", progress: 0.5 });
          const context = promptContext({ ...c, meta }, building.schedule);
          const square = await analysisSquare(c.dataUrl, 0.8);
          cloudCall = fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: square?.dataUrl, frame: square?.frame, source: c.name, settings: s, context }),
          });
          // A rejection here is handled where the call is awaited.
          cloudCall.catch(() => undefined);
        }
        if (!onDevice && c.kind === "photo" && c.dataUrl) {
          const { items, scene, timing } = await readStill(c.dataUrl, s);
          onDevice = itemsToObservations(items);
          meta = { ...meta, brightness: scene?.brightness, lighting: scene?.lighting, people: peopleIn(items), onDeviceMs: Math.round(timing.total) };
        } else if (!onDevice && c.kind === "video" && keyframes?.length) {
          const reads: StillRead[] = [];
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
          geo = await locate(meta.lat, meta.lon, sectorRef.current);
          patch(id, { geo });
        }

        // 3. The reading itself. On-device mode stops here: the picture never leaves.
        c = get() ?? c;
        if (engineRef.current.mode === "on-device") {
          patch(id, { status: "done", result: onDeviceResult({ name: c.name, onDevice }), errorCode: undefined, stage: undefined, progress: undefined });
          return;
        }
        patch(id, { stage: c.kind === "video" ? `Cloud model reading ${keyframes?.length ?? 0} frames` : "Waiting for the cloud model", progress: 0.65 });
        let res: Response;
        try {
          if (cloudCall) {
            res = await cloudCall;
          } else {
            const context = promptContext({ ...c, onDevice, meta, geo }, building.schedule);
            let body: Record<string, unknown>;
            if (c.kind === "video") {
              body = { images: (keyframes ?? []).map((k) => k.dataUrl) };
            } else {
              const square = c.dataUrl ? await analysisSquare(c.dataUrl, 0.8) : null;
              body = { image: square?.dataUrl, frame: square?.frame };
            }
            res = await fetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, source: c.name, settings: s, context }),
            });
          }
        } catch {
          throw Object.assign(new Error(navigator.onLine ? "The server could not be reached." : "You are offline, so the cloud model cannot read this picture."), {
            code: "engine-failed",
          });
        }
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as AnalyzeError | null;
          throw Object.assign(new Error(describeAnalyzeError(res.status, errBody)), { code: errBody?.code ?? "engine-failed" });
        }
        const result = (await res.json()) as AnalysisResult;
        // Two readers of one picture: what the detector cannot back is shown, not counted.
        result.observations = crossCheck(result.observations ?? [], onDevice);
        patch(id, { status: "done", result, errorCode: undefined, stage: undefined, progress: undefined });
      } catch (err) {
        // No invented answer. The card shows the error and, when the detector saw
        // something, offers that reading as a choice the user makes.
        const code = (err as { code?: AnalyzeError["code"] }).code;
        patch(id, {
          status: "error",
          stage: undefined,
          progress: undefined,
          error: err instanceof Error ? err.message : "Analysis failed.",
          errorCode: code,
        });
      }
    },
    [patch, building.schedule],
  );

  /** The user chose the on-device reading after the cloud model failed. */
  const adoptOnDevice = useCallback(
    (id: string) => {
      const c = capturesRef.current.find((x) => x.id === id);
      if (!c) return;
      patch(id, { status: "done", error: undefined, errorCode: undefined, result: onDeviceResult(c) });
    },
    [patch],
  );

  // One at a time: hosted vision endpoints rate-limit, and order is what the user expects.
  useEffect(() => {
    if (busyRef.current) return;
    const next = [...captures].reverse().find((c) => c.status === "pending");
    if (!next) return;
    busyRef.current = true;
    // Off the effect's own tick: analysis sets state as it goes, and the queue
    // only needs to start, not to run synchronously inside the effect.
    queueMicrotask(() => {
      analyze(next.id).finally(() => {
        busyRef.current = false;
        // Wake the effect for whatever is queued behind it.
        setCaptures((prev) => [...prev]);
      });
    });
  }, [captures, analyze]);

  const setDetails = (id: string, d: Partial<CaptureDetails>) => {
    setCaptures((prev) => prev.map((c) => (c.id === id ? { ...c, details: { ...c.details, ...d } } : c)));
  };

  function remove(id: string) {
    setCaptures((prev) => {
      const c = prev.find((x) => x.id === id);
      if (c?.videoUrl) URL.revokeObjectURL(c.videoUrl);
      return prev.filter((x) => x.id !== id);
    });
    // The saved room goes with it: removing a capture is saying it was not a reading to keep.
    removeAudit(auditIdFor(id));
  }

  // ---- pricing ------------------------------------------------------------

  const priced = useMemo(
    () =>
      captures.map((c) => {
        // A location looked up for the other sector is not this capture's price.
        const geo = c.geo && (c.geo.sector ?? sector) === sector ? c.geo : null;
        const { settings: s, rateQuality } = captureSettings(settings, { geo }, rateQualityBase);
        return { c, offenders: costCapture(c, s, schedule), rateQuality };
      }),
    [captures, settings, rateQualityBase, sector, schedule],
  );

  const ranked = useMemo(
    () =>
      priced
        .flatMap((p) => {
          const r = p.c.result;
          return r ? p.offenders.map((offender) => ({ offender, mode: r.mode, engine: r.engine })) : [];
        })
        .sort((a, b) => b.offender.costPerYear - a.offender.costPerYear),
    [priced],
  );

  const setAdjust = (offenderId: string, a: DeviceAdjust) => {
    const key = parseOffenderKey(offenderId);
    if (!key) return;
    // A measured wattage is the one accuracy figure the app can later show: record
    // what it had estimated for this device before the meter reading replaced it.
    const line = ranked.find((r) => r.offender.id === offenderId)?.offender;
    const calId = `cal_${key.captureId}_${key.categoryId}`;
    if (a.watts !== undefined && a.watts > 0 && line && ready) {
      const estimated = line.basis === "measured" ? currentStore().calibrations.find((c) => c.id === calId)?.estimatedWatts : line.activeWattsPerUnit ?? line.perUnitWatts;
      if (estimated && estimated > 0) {
        upsertCalibration({
          id: calId,
          buildingId: building.id,
          categoryId: key.categoryId,
          label: line.label,
          estimatedWatts: estimated,
          estimateBasis: line.basis === "ai" ? "ai" : "catalog",
          measuredWatts: a.watts,
          at: new Date().toISOString(),
        });
      }
    } else if (a.watts === undefined) {
      removeCalibration(calId);
    }
    setCaptures((prev) =>
      prev.map((c) => (c.id === key.captureId ? { ...c, adjust: { ...c.adjust, [key.categoryId]: a } } : c)),
    );
  };

  /** Every line, unverified ones included, for the list. */
  const offenders = useMemo(() => ranked.map((r) => r.offender), [ranked]);
  /** The lines that count toward totals, plans and exports. */
  const countedOffenders = useMemo(() => counted(offenders), [offenders]);
  const totals = useMemo(() => aggregate(offenders), [offenders]);
  const done = priced.filter((p) => p.c.result);
  const rateQuality = useMemo<RateQuality>(() => {
    // The loosest price among the captures bounds the whole range.
    const qs = done.map((p) => p.rateQuality);
    return qs.length ? qs.reduce((a, b) => (RATE_SIGMA[b] > RATE_SIGMA[a] ? b : a)) : "national";
  }, [done]);
  // The year's running cost, as a range: each line's band scales with it.
  const annualRange = useMemo(
    () =>
      costRange(
        countedOffenders.map((o) => {
          const a = o.annualCostPerYear ?? 0;
          const k = o.costPerYear > 0 ? a / o.costPerYear : 0;
          return {
            costPerYear: a,
            costLowPerYear: k ? o.costLowPerYear * k : a * 0.7,
            costHighPerYear: k ? o.costHighPerYear * k : a * 1.4,
            hoursKnown: o.hoursKnown,
          };
        }),
        rateQuality,
      ),
    [countedOffenders, rateQuality],
  );
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

  /** enhanced / on-device / mixed across every capture scanned so far. */
  const auditMode = useMemo<SavedAudit["mode"]>(() => {
    const modes = new Set(done.map((p) => p.c.result!.mode));
    return modes.size > 1 ? "mixed" : modes.has("enhanced") ? "enhanced" : "on-device";
  }, [done]);

  /**
   * Every finished capture is saved as a room of the active building, and
   * re-saved whenever its pricing or its name changes.
   *
   * Saving used to be a button, and a brief or a building roll-up that depended
   * on someone having pressed it was a brief that usually said "nothing saved".
   * The saved record is what the rooms page, the brief and the building total
   * are built from, so it is written as soon as there is a reading to write.
   */
  const buildingIdRef = useRef(building.id);
  useEffect(() => {
    buildingIdRef.current = building.id;
  }, [building.id]);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const t = setTimeout(async () => {
      for (const p of priced) {
        const r = p.c.result;
        if (!r || p.c.status !== "done") continue;
        const id = auditIdFor(p.c.id);
        const existing = currentStore().audits.find((a) => a.id === id);
        const thumb = existing?.thumb ?? (await thumbOf(p.c.dataUrl));
        if (!alive) return;
        const audit: SavedAudit = {
          id,
          buildingId: existing?.buildingId ?? buildingIdRef.current,
          at: existing?.at ?? new Date().toISOString(),
          areas: [p.c.name],
          offenders: p.offenders,
          settings: captureSettings(settings, { geo: p.c.geo ?? null }, rateQualityBase).settings,
          mode: r.mode,
          engine: r.engine,
          roomType: p.c.roomType,
          thumb,
          captureId: p.c.id,
        };
        // Skip the write when nothing about the record changed.
        if (existing && JSON.stringify({ ...existing, at: 0 }) === JSON.stringify({ ...audit, at: 0 })) continue;
        upsertAudit(audit);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [priced, ready, settings, rateQualityBase]);

  // A finished capture gets a tone and, if asked, a spoken summary.
  const announcedRef = useRef(new Set<string>());
  useEffect(() => {
    for (const p of priced) {
      if (p.c.status !== "done" || !p.c.result || announcedRef.current.has(p.c.id)) continue;
      announcedRef.current.add(p.c.id);
      const pr = prefsRef.current;
      beep(pr, "done");
      const os = counted(p.offenders);
      const devices = os.reduce((n, o) => n + o.count, 0);
      const cost = Math.round(os.reduce((n, o) => n + o.costPerYear, 0));
      say(pr, devices ? `${p.c.name}: ${devices} ${t("speak.result")} ${cost} ${t("speak.year")}.` : `${p.c.name}: ${t("speak.nothing")}`);
    }
  }, [priced, t]);

  const basisMix = useMemo(() => {
    const m = { measured: 0, ai: 0, catalog: 0 };
    for (const o of countedOffenders) m[o.basis ?? "catalog"]++;
    return m;
  }, [countedOffenders]);

  return (
    <section id="scanner" className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 pt-[4.25rem] sm:px-6 md:pt-24">
      <div className="mb-3 flex flex-col gap-4 md:mb-6 md:flex-row md:items-end md:justify-between">
        <PageHeader eyebrow={t("nav.scanner")} title={t("scan.title")} accent={t("scan.accent")} className="hidden md:block">
          {t("scan.intro")}{" "}
          <Link href="/methodology" className="text-cyan underline decoration-cyan/30 underline-offset-4 hover:decoration-cyan">
            {t("scan.how")}
          </Link>
          .
        </PageHeader>
        <h1 className="sr-only">{t("nav.scanner")}</h1>
        <div className="flex items-center justify-between gap-2 md:flex-col md:items-end">
          <ModeSwitch mode={mode} onChange={setMode} />
          <PlacePicker place={place} onChange={choosePlace} />
        </div>
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
            <span className="mono-label">{t("scan.captures")} · {captures.length}</span>
            <div className="flex items-center gap-3">
              {captures.length > 0 && (
                <button onClick={() => setCaptures([])} className="text-[0.74rem] text-dim hover:text-ember">
                  {t("scan.clear")}
                </button>
              )}
            </div>
          </div>
          {captures.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line2 px-4 py-6 text-center text-[0.84rem] leading-relaxed text-mist">
              {mode === "camera" ? t("scan.empty.camera") : t("scan.empty.upload")}
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
                onReanalyze={() => patch(c.id, { status: "pending", result: undefined, error: undefined, errorCode: undefined })}
                onUseOnDevice={c.onDevice?.length ? () => adoptOnDevice(c.id) : undefined}
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
                annual={totals.annualCostPerYear}
                annualRange={annualRange}
                rateQuality={rateQuality}
                co2={totals.co2KgPerYear}
                kwh={totals.kwhPerYear}
                recoverable={totals.recoverableCost}
                topLabel={totals.topOffender?.label ?? "-"}
                captures={done.length}
                basisMix={basisMix}
                working={working}
                typical={countedOffenders.reduce((t, o) => t + (o.typicalCostPerYear ?? 0), 0)}
                unverified={totals.unverifiedCost}
                unverifiedCount={offenders.length - countedOffenders.length}
                place={place}
              />

              <ExportBar offenders={countedOffenders} settings={settings} buildingName={building.name} savedTo={ready ? building.name : undefined} roomCount={done.length} />

              <ContributeBar offenders={countedOffenders} mode={auditMode} defaultArea={done[0]?.c.name ?? building.name} />

              <TabBar tab={tab} onChange={setTab} count={ranked.length} />

              {tab === "offenders" && (
                <div className="space-y-4">
                  {countedOffenders.length > 0 && <EfficiencyPanel offenders={countedOffenders} settings={settings} />}
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
                        <motion.div
                          key={r.offender.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
                        >
                        <OffenderCard
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
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}

              {tab === "plan" && (
                <div className="space-y-5">
                  <ActionPlan offenders={countedOffenders} settings={settings} />
                  <BudgetPlanner offenders={countedOffenders} />
                </div>
              )}

              {tab === "grid" && (
                <div className="space-y-5">
                  <GridPulse regionCode={building.regionCode} annualKwhWasted={totals.kwhPerYear} />
                  <WeatherContext lat={building.lat ?? deviceGeo?.lat} lon={building.lon ?? deviceGeo?.lon} offenders={countedOffenders} />
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
                  <LoadMixPanel offenders={countedOffenders} />
                  <EquivalenceStrip co2Kg={totals.co2KgPerYear} dollars={totals.costPerYear} />
                  <BenchmarkPanel offenders={countedOffenders} building={building} settings={settings} />
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
                {override.ratePerKwh === undefined && billRate !== undefined && <span className="ml-1.5 text-lime">from bill</span>}
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

/** Where the scan is. Sets typical hours, empty hours and the price sector. */
function PlacePicker({ place, onChange }: { place: UsageContext; onChange: (p: UsageContext) => void }) {
  const t = useT();
  const opts: { id: UsageContext; label: string }[] = [
    { id: "home", label: t("scan.home") },
    { id: "school", label: t("scan.school") },
    { id: "office", label: t("scan.office") },
  ];
  return (
    <div className="flex shrink-0 items-center justify-end gap-3">
      <span className="hidden text-[0.78rem] text-dim sm:inline">{t("scan.scanning")}</span>
      <div className="flex rounded-full bg-fog/[0.06] p-0.5" role="radiogroup" aria-label="Where you are scanning">
        {opts.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={place === o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-full px-2.5 py-1.5 text-[0.78rem] font-medium transition-colors sm:px-3.5 sm:text-[0.82rem] ${
              place === o.id ? "bg-surface text-fog shadow-[0_1px_2px_rgba(28,27,24,0.1)]" : "text-dim hover:text-mist"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const t = useT();
  const opts: { id: Mode; label: string; icon: "camera" | "upload" }[] = [
    { id: "camera", label: t("scan.camera"), icon: "camera" },
    { id: "upload", label: t("scan.upload"), icon: "upload" },
  ];
  return (
    <div className="grid min-w-0 grid-cols-2 rounded-full bg-fog/[0.06] p-1 md:w-[260px]" role="tablist" aria-label="Scan mode">
      {opts.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={mode === o.id}
          onClick={() => onChange(o.id)}
          className={`relative flex items-center justify-center gap-1.5 rounded-full px-2.5 py-2 text-[0.82rem] font-medium transition-colors md:px-4 md:py-2.5 md:text-[0.9rem] ${
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
  const t = useT();
  const tabs: { id: ResultTab; label: string; hint: string }[] = [
    { id: "offenders", label: t("tab.offenders"), hint: "What is running" },
    { id: "plan", label: t("tab.plan"), hint: "What to do, in order, and what it changes" },
    { id: "grid", label: t("tab.grid"), hint: "When to burn it, and what would cancel it" },
    { id: "context", label: t("tab.context"), hint: "What it means and how you compare" },
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
  annual,
  annualRange,
  rateQuality,
  co2,
  kwh,
  recoverable,
  topLabel,
  captures,
  basisMix,
  working,
  typical,
  unverified,
  unverifiedCount,
  place,
}: {
  cost: number;
  annual: number;
  annualRange: ReturnType<typeof costRange>;
  rateQuality: RateQuality;
  co2: number;
  kwh: number;
  recoverable: number;
  topLabel: string;
  captures: number;
  basisMix: { measured: number; ai: number; catalog: number };
  working: boolean;
  typical: number;
  /** Annual cost of lines shown but not counted, and how many there are. */
  unverified: number;
  unverifiedCount: number;
  place: UsageContext;
}) {
  const t = useT();
  const lines = basisMix.measured + basisMix.ai + basisMix.catalog;
  // Precision: how tight the 80% band is, as a share of the headline.
  const precision = Math.max(0, Math.min(1, 1 - annualRange.spread));
  const wasteShare = annual > 0 ? Math.min(1, cost / annual) : 0;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel ticked relative overflow-hidden p-5 sm:p-6">
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{ background: "radial-gradient(60% 120% at 100% 0%, rgba(239,157,46,0.1), transparent 60%)" }}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="mono-label text-cyan">{t("totals.eyebrow.run")}</span>
        <span className="font-mono text-[0.68rem] text-dim">
          {captures} {captures === 1 ? t("totals.capture") : t("totals.captures")}
          {working && <span className="ml-1.5 text-sodium-deep">· {t("totals.analysing")}</span>}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <BigStat
          label={t("totals.run")}
          accent
          value={
            annual > 0 ? (
              <span className="whitespace-nowrap">
                <CountUp value={annualRange.p10} format={fmtMoney} />–<CountUp value={annualRange.p90} format={fmtMoney} />
              </span>
            ) : (
              "$0"
            )
          }
        />
        <BigStat label={t("totals.wasted")} value={<CountUp value={cost} format={fmtMoneyFull} />} />
        <BigStat label={t("totals.recoverable")} value={<CountUp value={recoverable} format={fmtMoneyFull} />} />
        <BigStat label={t("totals.co2")} value={<CountUp value={co2} format={fmtCo2} />} />
      </div>

      {annual > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[0.84rem] text-fog">
              {t("totals.best")} <span className="font-mono font-semibold">{fmtMoneyFull(annual)}</span> {t("totals.year.between")}{" "}
              <span className="font-mono font-semibold">{fmtMoney(annualRange.p10)}</span> {t("totals.and")} <span className="font-mono font-semibold">{fmtMoney(annualRange.p90)}</span>
            </span>
            <span className="font-mono text-[0.72rem] text-dim">±{Math.round(annualRange.spread * 100)}% · {t("totals.range")} · {fmtKwh(kwh)} {t("totals.wasted.kwh")}</span>
          </div>
          {/* The year, drawn: the part spent in normal use and the part wasted after hours. */}
          <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-surface2" aria-hidden="true">
            <motion.div className="h-full bg-cyan/70" initial={{ width: 0 }} animate={{ width: `${(1 - wasteShare) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
            <motion.div className="h-full bg-ember" initial={{ width: 0 }} animate={{ width: `${wasteShare * 100}%` }} transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }} />
          </div>
          <div className="mt-1 flex justify-between text-[0.7rem] text-dim">
            <span>{t("totals.normal.use")}</span>
            <span className="text-ember">
              {Math.round(wasteShare * 100)}% {t("totals.after.hours.share")}
            </span>
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

      {annual > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface2/60 p-3 text-[0.8rem]">
          <div>
            <div className="font-mono text-lg font-semibold text-fog">{fmtMoneyFull(cost)}</div>
            <div className="leading-snug text-mist">{place === "home" ? t("totals.after.hours.explain.home") : t("totals.after.hours.explain")}</div>
          </div>
          <div>
            <div className="font-mono text-lg font-semibold text-fog">{fmtMoneyFull(typical)}</div>
            <div className="leading-snug text-mist">{t("totals.typical.explain")}</div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-[0.72rem] text-mist">
        <span>
          {t("totals.biggest")} <span className="text-lime">{topLabel}</span>
        </span>
        {unverifiedCount > 0 && (
          <span className="text-amber" title="The cloud model reported these but the on-device detector could not back them. Confirm or delete each one on its card.">
            + {fmtMoney(unverified)}{t("plan.yr")} · {unverifiedCount} {unverifiedCount > 1 ? t("totals.unverified.plural") : t("totals.unverified")}, {t("totals.not.counted")}
          </span>
        )}
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
  const t = useT();
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
          <h3 className="text-[1.05rem] font-semibold text-fog">{working ? t("empty.reading") : t("empty.none")}</h3>
          <p className="text-[0.84rem] text-mist">{working ? t("empty.reading.sub") : t("empty.none.sub")}</p>
        </div>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map(([title, d], i) => (
          <li key={title} className="rounded-xl bg-surface2 px-3.5 py-3">
            <div className="font-mono text-[0.7rem] text-dim">0{i + 1}</div>
            <div className="mt-1 text-[0.92rem] font-medium text-fog">{title}</div>
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
