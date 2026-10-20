"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { PageHeader } from "./PageHeader";
import { BudgetPlanner } from "./BudgetPlanner";
import { GridPulse } from "./GridPulse";
import { SolarOffset } from "./SolarOffset";
import { ActionPlan } from "./ActionPlan";
import { useT } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { beep, say } from "@/lib/cues";
import { BillCalibration } from "./BillCalibration";
import { TeamSend } from "./scan/TeamSend";
import { Ghosty } from "./scan/Ghosty";
import { ManualEntry } from "./scan/ManualEntry";
import { buildContext } from "@/lib/ghosty";
import { WeatherContext } from "./WeatherContext";
import { EquivalenceStrip } from "./EquivalenceStrip";
import { BenchmarkPanel, ExportBar, LoadMixPanel } from "./AuditPanels";
import { offenderAnchor, type DetectionPhoto } from "./DetectionView";
import { ReportBrief, type ReportPicture } from "./ReportBrief";
import { MediaViewer } from "./scan/MediaViewer";
import { Summary } from "./scan/Summary";
import { DeviceList } from "./scan/DeviceList";
import { BillCompare, EmptyTime, MoneyOverTime } from "./scan/Visuals";
import { listActions, rankActions } from "@/lib/actions";
import { CameraMode, type PhotoShot, type VideoShot } from "./scan/CameraMode";
import { UploadMode } from "./scan/UploadMode";
import { CaptureCard } from "./scan/CaptureCard";
import { ClearWorkDialog } from "./scan/ClearWorkDialog";
import { Tour, TOUR_KEY } from "./scan/Tour";
import { Drawer } from "./scan/Drawer";
import { PlaceSelect } from "./scan/PlaceSelect";
import { AddToPlace } from "./scan/AddToPlace";
import { MoreMenu } from "./scan/MoreMenu";
import { clearWorkspace, eraseEverything, loadWorkspace, saveWorkspace } from "@/lib/workspace";
import { Icon } from "./scan/icons";
import { analysisSquare } from "@/lib/image";
import type { CategorizedObservation } from "@/lib/parse";
import { ON_DEVICE_ENGINE, describeAnalyzeError, useEngine } from "@/lib/engine";
import { aggregate, counted } from "@/lib/energy";
import { crossCheck } from "@/lib/crosscheck";
import { costRange, RATE_SIGMA, type RateQuality } from "@/lib/estimate";
import { REGION_BY_CODE, regionOrDefault, regionRate } from "@/lib/grid";
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
import { addBuilding, currentStore, newBuilding, setActiveBuilding, updateBuilding, removeAudit, removeCalibration, upsertAudit, upsertCalibration, useStore } from "@/lib/useStore";
import { BUILDING_TYPE_BY_ID } from "@/lib/benchmark";
import type { AnalysisResult, AnalyzeError, AuditSettings } from "@/lib/types";

type Mode = "camera" | "upload";
type ResultTab = "devices" | "fix" | "charts" | "report";

/** Rooms saved in a place: one per room name, however many times it was scanned. */
const rollupRoomCount = (audits: SavedAudit[]) => new Set(audits.map((a) => (a.areas[0] ?? "").trim().toLowerCase())).size;

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
  const [manualOpen, setManualOpen] = useState(false);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<ResultTab>("devices");
  /** The capture shown large in the viewer. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The device row opened from a box on the photo. */
  const [openDevice, setOpenDevice] = useState<string | null>(null);
  /** "Scan this room again" from My places: new pictures are saved as that room, so it gets a before and after. */
  const [roomName, setRoomName] = useState<string | null>(null);
  const roomRef = useRef<string | null>(null);
  useEffect(() => {
    roomRef.current = roomName;
  }, [roomName]);
  // /report used to be its own page; it now lands on this tab.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      if (q.get("view") === "report") setTab("report");
      const room = q.get("room")?.trim();
      if (room) setRoomName(room.slice(0, 60));
    }, 0);
    return () => clearTimeout(t);
  }, []);
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
        // The place takes the location on (state, coordinates), so its default
        // price, grid carbon, weather and solar all follow; a place someone has
        // already located keeps theirs. Pictures with no location of their own
        // are priced where the phone is.
        const st = currentStore();
        const b = st.buildings.find((x) => x.id === st.activeBuildingId) ?? st.buildings[0];
        if (b && (b.lat === undefined || b.lon === undefined)) {
          const state = geo?.state;
          updateBuilding(b.id, {
            lat: Number(lat.toFixed(4)),
            lon: Number(lon.toFixed(4)),
            ...(state && REGION_BY_CODE[state] ? { regionCode: state } : {}),
          });
          if (geo?.place || state) setToast(`Prices, carbon and weather set for ${[geo?.place, state].filter(Boolean).join(", ")}.`);
        }
        if (geo) {
          setCaptures((prev) =>
            prev.map((c) =>
              !c.geo && c.meta.lat === undefined ? { ...c, geo, meta: { ...c.meta, lat, lon, locationFrom: "device" as const } } : c,
            ),
          );
        }
      },
      () => {
        setGeoBusy(false);
        setToast("Location unavailable: using the building's rates instead.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }, []);

  // Ask for the location straight away: without it every price, carbon factor,
  // the weather and the solar figures fall back to a default state. Someone who
  // has already said no is not asked again; the browser remembers that.
  useEffect(() => {
    if (!navigator.permissions?.query) {
      const t = setTimeout(requestLocation, 0);
      return () => clearTimeout(t);
    }
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((p) => p.state !== "denied" && requestLocation())
      .catch(() => requestLocation());
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
    const named = roomRef.current ? { ...c, name: roomRef.current } : c;
    setCaptures((prev) => [named, ...prev]);
    setSelectedId(c.id);
  }, []);

  const counter = useRef({ photo: 0, video: 0 });

  // ---- the work in progress, kept on this device ---------------------------

  /** Captures saved to a place, and the room name each was saved as. Nothing is saved until it's added. */
  const [added, setAdded] = useState<Record<string, { buildingId: string; room: string }>>({});

  /** True once the saved work has been read, so an empty first render never overwrites it. */
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let alive = true;
    loadWorkspace().then((ws) => {
      if (!alive) return;
      if (ws && !capturesRef.current.length) {
        setCaptures(ws.captures);
        setSelectedId(ws.selectedId);
        setAdded(ws.added);
        // Carry on numbering where the saved work left off.
        for (const c of ws.captures) {
          const m = /^(Photo|Video) (\d+)$/.exec(c.name);
          if (m) {
            const k = m[1] === "Photo" ? "photo" : "video";
            counter.current[k] = Math.max(counter.current[k], Number(m[2]));
          }
        }
        // A picture opened in upload mode reopens there.
        if (ws.captures.some((c) => c.origin === "upload")) setMode("upload");
      }
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => saveWorkspace(captures, selectedId, added), 800);
    return () => clearTimeout(t);
  }, [captures, selectedId, added, restored]);

  const [confirmClear, setConfirmClear] = useState(false);

  const [touring, setTouring] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (!localStorage.getItem(TOUR_KEY)) setTouring(true);
      } catch {
        // Storage blocked: don't nag on every visit.
      }
    }, 900);
    return () => clearTimeout(t);
  }, []);
  async function clearWork(everything: boolean) {
    setConfirmClear(false);
    for (const c of capturesRef.current) if (c.videoUrl) URL.revokeObjectURL(c.videoUrl);
    setCaptures([]);
    setSelectedId(null);
    setAdded({});
    setOverride({});
    setTab("devices");
    counter.current = { photo: 0, video: 0 };
    await clearWorkspace();
    try {
      // The notes written on this scan's report go with it.
      const notes = JSON.parse(localStorage.getItem("gw-report-notes") ?? "{}") as Record<string, unknown>;
      for (const k of Object.keys(notes)) if (k.startsWith("current:")) delete notes[k];
      localStorage.setItem("gw-report-notes", JSON.stringify(notes));
    } catch {
      // Nothing kept.
    }
    if (everything) {
      await eraseEverything();
      window.location.reload();
      return;
    }
    setToast("Cleared. Ready for a fresh scan.");
  }
  const nextName = (kind: "photo" | "video") =>
    `${kind === "photo" ? "Photo" : "Video"} ${String(++counter.current[kind]).padStart(2, "0")}`;

  function blank(kind: Capture["kind"], origin: Capture["origin"], name: string): Capture {
    return { id: captureId(), name, kind, origin, dataUrl: null, meta: {}, details: {}, adjust: {}, roomType: "unknown", status: "pending" };
  }

  /** Typed in: an already-read capture with no picture, added to the current place. */
  function onManual(room: string, roomType: string, observations: CategorizedObservation[]) {
    const c: Capture = {
      ...blank("photo", "manual", room),
      roomType,
      status: "done",
      meta: {
        takenAt: nowLocal(),
        ...(deviceGeo ? { lat: deviceGeo.lat, lon: deviceGeo.lon, locationFrom: "device" as const } : {}),
      },
      geo: deviceGeo?.geo ?? undefined,
      result: { mode: "on-device", engine: "Entered by hand", source: room, offenders: [], observations },
    };
    setCaptures((prev) => [c, ...prev]);
    setSelectedId(c.id);
    if (ready) setAdded((prev) => ({ ...prev, [c.id]: { buildingId: building.id, room } }));
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
    setAdded((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
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
   * A scan is saved to My places only once it's added to a place. After that it
   * is kept up to date there as its reading, corrections or prices change.
   */
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const t = setTimeout(async () => {
      for (const p of priced) {
        const r = p.c.result;
        const where = added[p.c.id];
        if (!where || !r || p.c.status !== "done") continue;
        const id = auditIdFor(p.c.id);
        const existing = currentStore().audits.find((a) => a.id === id);
        const thumb = existing?.thumb ?? (await thumbOf(p.c.dataUrl));
        if (!alive) return;
        const audit: SavedAudit = {
          id,
          buildingId: where.buildingId,
          at: existing?.at ?? new Date().toISOString(),
          areas: [where.room],
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
  }, [priced, ready, settings, rateQualityBase, added]);

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

  const actions = useMemo(() => rankActions(listActions(countedOffenders, settings)), [countedOffenders, settings]);
  const ghostyContext = useMemo(
    () =>
      buildContext({
        place,
        buildingName: building.name,
        ratePerKwh: settings.ratePerKwh,
        emptyHoursPerYear: settings.unoccupiedHoursPerYear,
        annual: totals.annualCostPerYear,
        wasted: totals.costPerYear,
        recoverable: totals.recoverableCost,
        co2Kg: totals.co2KgPerYear,
        offenders: countedOffenders,
        actions,
      }),
    [place, building.name, settings.ratePerKwh, settings.unoccupiedHoursPerYear, totals, countedOffenders, actions],
  );
  const viewerItems = useMemo(() => priced.map((p) => ({ capture: p.c, offenders: p.offenders })), [priced]);
  const deviceLines = useMemo(
    () =>
      ranked.map((r) => {
        const key = parseOffenderKey(r.offender.id);
        const cap = key ? captures.find((c) => c.id === key.captureId) : undefined;
        return { offender: r.offender, adjust: key ? cap?.adjust[key.categoryId] : undefined };
      }),
    [ranked, captures],
  );

  /** This scan as one audit, for the report tab. */
  const currentAudit = useMemo<SavedAudit | null>(() => {
    if (!done.length) return null;
    const engines = [...new Set(done.map((p) => p.c.result!.engine))];
    return {
      id: "current",
      buildingId: building.id,
      at: new Date().toISOString(),
      areas: done.map((p) => p.c.name),
      offenders,
      settings,
      mode: auditMode,
      engine: engines.length === 1 ? engines[0] : `${engines.length} engines`,
    };
  }, [done, building.id, offenders, settings, auditMode]);

  const reportPictures = useMemo<ReportPicture[]>(
    () =>
      done.map((p) => {
        const photo = detectionPhotos.find((d) => d.id === p.c.id);
        return photo ? { id: p.c.id, name: p.c.name, photo } : { id: p.c.id, name: p.c.name, src: p.c.keyframes?.[0]?.annotated ?? p.c.dataUrl ?? undefined };
      }),
    [done, detectionPhotos],
  );

  const selected = captures.find((c) => c.id === selectedId) ?? captures[0];
  const scrollBehavior: ScrollBehavior = prefs.motion === "reduce" ? "auto" : "smooth";

  /** A box on the photo was tapped: open that device's row. */
  function pickDevice(id: string) {
    setTab("devices");
    setOpenDevice(id);
    setTimeout(() => document.getElementById(offenderAnchor(id))?.scrollIntoView({ behavior: scrollBehavior, block: "center" }), 60);
  }

  function goTab(next: ResultTab) {
    setTab(next);
    setTimeout(() => document.getElementById("scan-tabs")?.scrollIntoView({ behavior: scrollBehavior, block: "start" }), 30);
  }

  function showAssumptions() {
    setShowSettings(true);
  }


  const PLACE_WORD: Record<UsageContext, string> = { home: "Home", school: "School", office: "Office" };
  const priceChip = (
    <button
      onClick={() => setShowSettings(true)}
      aria-haspopup="dialog"
      data-tour="settings"
      title="Building and prices"
      className="inline-flex min-w-0 items-center gap-2 rounded-full bg-fog/[0.06] px-3.5 py-2.5 text-[0.84rem] font-medium text-mist transition-colors hover:bg-fog/[0.1] hover:text-fog"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </svg>
      {PLACE_WORD[place]}
      <span className="text-dim">·</span>
      <span className="shrink-0 font-mono text-[0.78rem]">${settings.ratePerKwh.toFixed(2)}/kWh</span>
    </button>
  );

  const [addOpen, setAddOpen] = useState(0);
  const addedHere = done.filter((p) => added[p.c.id]);
  const allAdded = done.length > 0 && addedHere.length === done.length;
  const addedPlace = allAdded ? store.buildings.find((b) => b.id === added[done[0].c.id]?.buildingId) : undefined;
  const addButton = hasResults && (
    <button
      onClick={() => setAddOpen((n) => n + 1)}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[0.92rem] font-semibold shadow-[0_8px_20px_-10px_rgba(168,97,12,0.7)] transition-transform hover:scale-[1.02] active:scale-[0.98] ${
        allAdded ? "bg-lime text-white" : "bg-sodium text-black"
      }`}
    >
      {allAdded ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
      {allAdded ? `Saved to ${addedPlace?.name ?? "a place"}` : "Add to place"}
    </button>
  );

  const moreMenu = (
    <MoreMenu
      items={[
        { label: "Building and prices", onClick: () => setShowSettings(true) },
        { label: "Show me around", onClick: () => setTouring(true) },
        ...(captures.length ? [{ label: "Clear current work", danger: true, onClick: () => setConfirmClear(true) }] : []),
      ]}
    />
  );

  function addToPlace(target: { buildingId: string } | { newPlace: { name: string; typeId: string } }, rooms: { captureId: string; room: string }[]) {
    let buildingId: string;
    let name: string;
    let typeId: string;
    if ("newPlace" in target) {
      const b = newBuilding(target.newPlace.name, target.newPlace.typeId, building.regionCode);
      addBuilding(b);
      buildingId = b.id;
      name = b.name;
      typeId = b.typeId;
    } else {
      const b = store.buildings.find((x) => x.id === target.buildingId)!;
      setActiveBuilding(b.id);
      buildingId = b.id;
      name = b.name;
      typeId = b.typeId;
    }
    // Prices now follow the place the rooms belong to.
    choosePlace(contextForBuildingType(typeId));
    setAdded((prev) => ({ ...prev, ...Object.fromEntries(rooms.map((r) => [r.captureId, { buildingId, room: r.room }])) }));
    setCaptures((prev) => prev.map((c) => (rooms.find((r) => r.captureId === c.id) ? { ...c, name: rooms.find((r) => r.captureId === c.id)!.room } : c)));
    setAddOpen(0);
    setToast(`Added ${rooms.length} room${rooms.length === 1 ? "" : "s"} to ${name}. Find ${rooms.length === 1 ? "it" : "them"} in My places.`);
  }

  const roomChip = roomName && (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan/10 py-1.5 pl-3.5 pr-1.5 text-[0.82rem] text-cyan">
      Saving as <span className="font-medium">{roomName}</span>
      <button
        onClick={() => {
          setRoomName(null);
          window.history.replaceState(null, "", "/scan");
        }}
        aria-label="Stop saving pictures under this room name"
        className="grid h-6 w-6 place-items-center rounded-full hover:bg-cyan/15"
      >
        <Icon name="close" className="h-3 w-3" />
      </button>
    </span>
  );

  return (
    <section id="scanner" className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 pt-[4.25rem] sm:px-6 md:pt-24">
      {captures.length === 0 ? (
      <div className="no-print mb-3 flex flex-col gap-4 md:mb-6 md:flex-row md:items-end md:justify-between">
        <PageHeader eyebrow={t("nav.scanner")} title={t("scan.title")} accent={t("scan.accent")} className="hidden md:block">
          {t("scan.intro")}{" "}
          <Link href="/methodology" className="text-cyan underline decoration-cyan/30 underline-offset-4 hover:decoration-cyan">
            {t("scan.how")}
          </Link>
          .
        </PageHeader>
        <h1 className="sr-only">{t("nav.scanner")}</h1>
        <div className="flex items-center justify-between gap-2 md:flex-col md:items-end">
          <div data-tour="mode" className="flex items-center gap-2">
            <ModeSwitch mode={mode} onChange={setMode} />
            <TypeItIn onClick={() => setManualOpen(true)} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {roomChip}
            {priceChip}
            {moreMenu}
          </div>
        </div>
      </div>
      ) : (
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <h1 className="sr-only">{t("nav.scanner")}</h1>
          <div data-tour="mode" className="flex items-center gap-2">
            <ModeSwitch mode={mode} onChange={setMode} />
            <TypeItIn onClick={() => setManualOpen(true)} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {roomChip}
            {priceChip}
            {addButton}
            {moreMenu}
          </div>
        </div>
      )}

      <div className="no-print" data-tour="add">
        {mode === "camera" && (
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
        )}

        {/* Nothing added yet: the drop zone (upload) or what to expect (camera). */}
        {captures.length === 0 &&
          (mode === "upload" ? (
            <UploadMode onFiles={onFiles} />
          ) : (
            <div className="mt-6">
              <EmptyState working={working} mode={mode} />
            </div>
          ))}

        {/* Something added: what was found, drawn on it, beside the short version. */}
        {captures.length > 0 && (
          <div className={`grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] ${mode === "camera" ? "mt-6" : ""}`}>
            <div className="min-w-0 space-y-3">
              <MediaViewer
                items={viewerItems}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                hovered={hovered}
                onHover={setHovered}
                onPick={pickDevice}
                onFiles={mode === "upload" ? onFiles : undefined}
                onClear={() => setConfirmClear(true)}
                footer={
                  selected && (
                    <CaptureCard
                      key={selected.id}
                      compact
                      capture={selected}
                      cost={priced.find((p) => p.c.id === selected.id)?.offenders.reduce((s, o) => s + o.costPerYear, 0) ?? 0}
                      devices={priced.find((p) => p.c.id === selected.id)?.offenders.reduce((s, o) => s + o.count, 0) ?? 0}
                      schedule={building.schedule}
                      onDetails={(d) => setDetails(selected.id, d)}
                      onPatch={(p) => patch(selected.id, p)}
                      onReanalyze={() => patch(selected.id, { status: "pending", result: undefined, error: undefined, errorCode: undefined })}
                      onUseOnDevice={selected.onDevice?.length ? () => adoptOnDevice(selected.id) : undefined}
                      onRemove={() => remove(selected.id)}
                    />
                  )
                }
              />
            </div>
            <div className="flex min-w-0 flex-col">
              {hasResults ? (
                <Summary
                  annual={totals.annualCostPerYear}
                  range={annualRange}
                  wasted={totals.costPerYear}
                  needed={Math.max(0, totals.annualCostPerYear - totals.costPerYear)}
                  recoverable={totals.recoverableCost}
                  actions={actions}
                  top={totals.topOffender}
                  co2Kg={totals.co2KgPerYear}
                  place={place}
                  photos={done.length}
                  working={working}
                  unverifiedCount={offenders.length - countedOffenders.length}
                  rateQuality={rateQuality}
                  onDevices={() => goTab("devices")}
                  onFixes={() => goTab("fix")}
                  onAccuracy={showAssumptions}
                />
              ) : (
                <EmptyState working={working} mode={mode} />
              )}
            </div>
          </div>
        )}
      </div>

      {hasResults && (
        <div className="mt-5">
          <TeamSend offenders={countedOffenders} mode={auditMode} defaultRoom={done[0]?.c.name ?? building.name} />
        </div>
      )}

      {hasResults && (
        <div className="no-print mt-5">
          <Ghosty context={ghostyContext} working={working} />
        </div>
      )}

      {hasResults && (
        <div id="scan-tabs" className="mt-8 scroll-mt-20 space-y-5">
          <div className="no-print">
            <TabBar tab={tab} onChange={setTab} count={ranked.length} />
          </div>

          {tab === "devices" && (
            <div className="no-print">
              <DeviceList lines={deviceLines} hovered={hovered} onHover={setHovered} onAdjust={setAdjust} openId={openDevice} onOpen={setOpenDevice} />
            </div>
          )}

          {tab === "fix" && (
            <div className="no-print space-y-5">
              <ActionPlan offenders={countedOffenders} settings={settings} />
              <BudgetPlanner offenders={countedOffenders} />
            </div>
          )}

          {tab === "charts" && (
            <div className="no-print space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <BillCompare offenders={countedOffenders} settings={settings} />
                <EmptyTime settings={settings} home={place === "home"} />
              </div>
              <MoneyOverTime offenders={countedOffenders} settings={settings} />
              <div className="grid gap-5 md:grid-cols-2">
                <LoadMixPanel offenders={countedOffenders} />
                {countedOffenders.length > 0 && <EfficiencyPanel offenders={countedOffenders} settings={settings} />}
              </div>
              <EquivalenceStrip co2Kg={totals.co2KgPerYear} dollars={totals.costPerYear} />
              <BenchmarkPanel offenders={countedOffenders} building={building} settings={settings} />
              <div className="grid gap-5 md:grid-cols-2">
                <GridPulse regionCode={building.regionCode} annualKwhWasted={totals.kwhPerYear} />
                <WeatherContext lat={building.lat ?? deviceGeo?.lat} lon={building.lon ?? deviceGeo?.lon} offenders={countedOffenders} />
              </div>
              <SolarOffset
                lat={building.lat ?? deviceGeo?.lat}
                lon={building.lon ?? deviceGeo?.lon}
                regionCode={building.regionCode}
                annualKwhWasted={totals.kwhPerYear}
                ratePerKwh={settings.ratePerKwh}
                co2PerKwh={settings.co2PerKwh}
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

          {tab === "report" && (
            <div className="space-y-5">
              <ReportBrief current={currentAudit} pictures={reportPictures} />
              <div className="no-print space-y-3">
                <ExportBar offenders={countedOffenders} settings={settings} buildingName={building.name} savedTo={ready ? building.name : undefined} roomCount={done.length} />
                {ready && (
                  <Link
                    href={`/stickers?building=${building.id}`}
                    className="panel panel-hover flex items-center justify-between gap-4 p-4 sm:p-5"
                  >
                    <span>
                      <span className="block text-[0.95rem] font-semibold text-fog">Print room stickers</span>
                      <span className="mt-0.5 block text-[0.84rem] text-mist">
                        One per room, with what it wastes and a QR code that opens a before-you-leave checklist.
                      </span>
                    </span>
                    <span aria-hidden className="text-cyan">&rarr;</span>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ManualEntry open={manualOpen} onClose={() => setManualOpen(false)} defaultRoom={`Room ${captures.length + 1}`} onAdd={onManual} />

      {/* ---- the place and the figures everything is priced with ---- */}
      <Drawer open={showSettings} onClose={() => setShowSettings(false)} title="Building and prices" sub="What every number on this page is priced with.">
        <div className="space-y-7">
          {ready && (
            <section>
              <h3 className="text-[0.92rem] font-medium text-fog">Place</h3>
              <p className="mt-0.5 text-[0.8rem] text-dim">Its state and opening hours set the prices below. Right-click to rename or edit it.</p>
              <div className="mt-2.5">
                <PlaceSelect buildings={store.buildings} activeId={building.id} />
              </div>
              <p className="mt-2 text-[0.78rem] text-dim">
                {BUILDING_TYPE_BY_ID[building.typeId]?.label ?? "Place"} · {region.name}
              </p>
            </section>
          )}
          <section>
            <h3 className="text-[0.92rem] font-medium text-fog">What kind of place is this room in?</h3>
            <p className="mt-0.5 text-[0.8rem] text-dim">Homes and businesses pay different prices and sit empty at different times.</p>
            <div className="mt-2.5">
              <PlacePicker place={place} onChange={choosePlace} label={false} />
            </div>
          </section>
          <a
            href={`/places?place=${building.id}&action=bill`}
            className="flex items-center gap-3 rounded-2xl border border-lime/30 bg-lime/[0.06] px-4 py-3.5 transition-colors hover:bg-lime/[0.1]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/15 text-lime">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM10 8h4M10 12h4M10 16h2" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.92rem] font-medium text-fog">{building.bill ? "Your bill is in use" : "Have an electric bill?"}</span>
              <span className="block text-[0.78rem] leading-snug text-mist">
                {building.bill ? "Every number uses the price you actually pay. Update it in My places." : "Snap a photo of it or type three numbers, and every estimate uses your real price."}
              </span>
            </span>
            <Icon name="chevron" className="h-4 w-4 shrink-0 -rotate-90 text-dim" />
          </a>
          <section className="space-y-4">
            <div>
              <h3 className="text-[0.92rem] font-medium text-fog">Prices and hours</h3>
              <p className="mt-0.5 text-[0.8rem] leading-relaxed text-dim">
                Change these if you know better. The price on your electric bill beats every estimate
                {override.ratePerKwh === undefined && billRate !== undefined ? ", and it's already in use" : ""}.
              </p>
            </div>
            <Field
              label="Price of electricity (dollars per kWh, on your bill)"
              value={Math.round(settings.ratePerKwh * 1000) / 1000}
              step={0.01}
              onChange={(v) => setOverride((s) => ({ ...s, ratePerKwh: v }))}
            />
            <Field
              label="Hours a year the place is empty"
              value={Math.round(settings.unoccupiedHoursPerYear)}
              step={100}
              onChange={(v) => setOverride((s) => ({ ...s, unoccupiedHoursPerYear: v }))}
            />
            <Field
              label="Carbon per kWh from your grid (kg of CO₂)"
              value={Math.round(settings.co2PerKwh * 1000) / 1000}
              step={0.005}
              onChange={(v) => setOverride((s) => ({ ...s, co2PerKwh: v }))}
            />
            <Field
              label="Demand charge, businesses only (dollars per kW each month, optional)"
              value={settings.demandChargePerKw ?? 0}
              step={0.5}
              onChange={(v) => setOverride((s) => ({ ...s, demandChargePerKw: v }))}
            />
            <button
              onClick={() => {
                setOverride({});
                setLiveRate(null);
              }}
              className="text-[0.76rem] text-dim hover:text-cyan"
            >
              ↺ Back to the building&apos;s own figures
            </button>
            <button onClick={fetchLiveRate} className="block w-full rounded-xl border border-line px-3.5 py-2.5 text-left text-[0.84rem] text-mist transition-colors hover:border-fog/40 hover:text-fog">
              {liveRate ? `Published price for this state: $${liveRate.ratePerKwh.toFixed(3)} per kWh` : "Look up the latest published price for this state"}
              {liveRate && <span className="mt-0.5 block text-[0.74rem] text-dim">{liveRate.source}</span>}
            </button>
          </section>
        </div>
      </Drawer>

      <AddToPlace
        key={addOpen}
        open={addOpen > 0}
        onClose={() => setAddOpen(0)}
        buildings={store.buildings}
        activeId={building.id}
        roomCounts={Object.fromEntries(store.buildings.map((b) => [b.id, rollupRoomCount(store.audits.filter((x) => x.buildingId === b.id))]))}
        items={done.map((p) => ({
          captureId: p.c.id,
          name: p.c.name,
          thumb: p.c.keyframes?.[0]?.annotated ?? p.c.dataUrl ?? undefined,
          wastePerYear: counted(p.offenders).reduce((t, o) => t + o.costPerYear, 0),
          savedIn: added[p.c.id],
        }))}
        onAdd={addToPlace}
      />

      <Tour open={touring} onClose={() => setTouring(false)} />
      <ClearWorkDialog open={confirmClear} count={captures.length} onCancel={() => setConfirmClear(false)} onConfirm={clearWork} />

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
function PlacePicker({ place, onChange, label = true }: { place: UsageContext; onChange: (p: UsageContext) => void; label?: boolean }) {
  const t = useT();
  const opts: { id: UsageContext; label: string }[] = [
    { id: "home", label: t("scan.home") },
    { id: "school", label: t("scan.school") },
    { id: "office", label: t("scan.office") },
  ];
  return (
    <div className="flex shrink-0 items-center gap-3">
      {label && <span className="hidden text-[0.78rem] text-dim sm:inline">{t("scan.scanning")}</span>}
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

/** The way in when there's no camera, or you'd rather just say what's there. */
function TypeItIn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Add devices by name, no camera needed"
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-2 text-[0.82rem] font-medium text-mist transition-colors hover:border-fog/30 hover:text-fog md:px-4 md:py-2.5 md:text-[0.9rem]"
    >
      <svg viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
      </svg>
      Type it in
    </button>
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
    { id: "devices", label: t("tab.devices"), hint: "Everything found, most wasteful first" },
    { id: "fix", label: t("tab.fix"), hint: "What to do, in order, and what it saves" },
    { id: "charts", label: t("tab.charts"), hint: "Pictures of the result, and how you compare" },
    { id: "report", label: t("tab.report"), hint: "A report to print or save as a PDF" },
  ];
  return (
    <div className="flex rounded-full bg-fog/[0.05] p-1" role="tablist">
      {tabs.map((x) => (
        <button
          key={x.id}
          role="tab"
          aria-selected={tab === x.id}
          onClick={() => onChange(x.id)}
          title={x.hint}
          className={`relative flex-1 whitespace-nowrap rounded-full px-2 py-2.5 text-[0.85rem] font-medium transition-colors sm:text-[0.92rem] ${tab === x.id ? "text-fog" : "text-dim hover:text-mist"}`}
        >
          {tab === x.id && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_rgba(28,27,24,0.08),0_4px_12px_-6px_rgba(28,27,24,0.2)]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative">
            {x.label}
            {x.id === "devices" && <span className="ml-1 tabular-nums text-dim">{count}</span>}
          </span>
        </button>
      ))}
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
