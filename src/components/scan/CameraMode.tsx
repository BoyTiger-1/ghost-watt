"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  COCO_MAP,
  COOLDOWN_MIN_MS,
  SIG_H,
  SIG_W,
  STEADY_MS,
  STILL_DIFF,
  Tracker,
  frameSignature,
  nearestView,
  nextCooldown,
  shouldAutoAudit,
  sigDiff,
  type Track,
} from "@/lib/live";
import { classifyRegion, getClassifier, getDetector, padBox, toPixelDetections } from "@/lib/detector";
import { CENTER_ROI, CenterLamp, Verifier, judge, lampScore, withLamps } from "@/lib/verify";
import { observationsToItems, panelOf, readItems, type LiveItem } from "@/lib/ondevice";
import { dedupeCandidates, isLiveClass, looksLikeWindow, tooBig } from "@/lib/candidates";
import { useT } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { beep, buzz } from "@/lib/cues";
import { readStill } from "@/lib/still";
import { analysisSquare } from "@/lib/image";
import { LightTracker, readScene, regionSaturation, regionStats, type SceneRead } from "@/lib/scene";
import { FrameReader, KeyframeCollector, PixelReader, itemColor, recorderMime, toCanvas, toJpeg, type Keyframe } from "@/lib/media";
import { fmtMoney, fmtWatts } from "@/lib/energy";
import { readTime, type GeoContext } from "@/lib/capture";
import { nowLocal } from "@/lib/exif";
import { useEngine } from "@/lib/engine";
import type { WeeklySchedule } from "@/lib/schedule";
import type { AnalysisMode, AnalysisResult, AnalyzeError, AuditSettings } from "@/lib/types";
import { Icon } from "./icons";

/**
 * Bright things inside these are not lights: glare on a car's paint or windscreen,
 * a white page or a bright UI on a screen. (A "screen" the classifier calls a lamp
 * is not one, and does not block.)
 */
const LIGHT_BLOCKERS = new Set(["car", "truck", "bus", "motorcycle", "train", "boat", "tv", "laptop", "cell phone"]);

/** A walkthrough longer than this is several rooms; better as several clips. */
const MAX_RECORD_S = 60;

export interface PhotoShot {
  dataUrl: string;
  /** What was on screen: the confirmed reading of this view, or only candidates. */
  items: LiveItem[];
  scene: SceneRead | null;
  /** True when `items` came from the strong path (confirmed), not the live candidate finder. */
  confirmed: boolean;
  /** Which path confirmed it, when it was. */
  mode?: AnalysisMode;
}

/** A live item that is only a suggestion until the strong path confirms it. */
type ViewItem = LiveItem & { candidate?: boolean };

export interface VideoShot {
  url: string;
  duration: number;
  keyframes: Keyframe[];
}

type Phase = "starting" | "live" | "error";

/**
 * A view the strong path has confirmed, keyed by what it looked like.
 *
 * The live detector is a candidate finder: fast, private, and wrong often
 * enough that nothing it says is priced. When the camera settles on a view,
 * that frame goes through the same reading a photo gets - the cloud model in
 * Enhanced mode, the full tiled on-device read otherwise - and while the camera
 * stays there, the confirmed answer replaces the candidates and is what the
 * cost pill counts.
 */
interface AuditedView {
  id: number;
  sig: Float32Array;
  /** Empty when nothing powered was found: kept so the same view is not re-read. */
  items: LiveItem[];
  mode: AnalysisMode;
}

type AiStatus =
  | { kind: "moving"; candidates: number }
  | { kind: "confirming"; mode: AnalysisMode }
  | { kind: "confirmed"; count: number; mode: AnalysisMode }
  | { kind: "waiting"; seconds: number }
  | { kind: "note"; text: string };

/** How many audited views to remember; older ones are re-audited if revisited. */
const MAX_VIEWS = 24;

/** Where a source of size (sw, sh) lands in a box (cw, ch) with object-fit: cover. */
function coverRect(sw: number, sh: number, cw: number, ch: number) {
  const s = Math.max(cw / sw, ch / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

export function CameraMode({
  settings,
  schedule,
  geo,
  geoBusy,
  onLocate,
  onPhoto,
  onVideo,
  onUseUpload,
}: {
  settings: AuditSettings;
  schedule?: WeeklySchedule;
  geo: GeoContext | null;
  geoBusy: boolean;
  onLocate: () => void;
  onPhoto: (shot: PhotoShot) => void;
  onVideo: (shot: VideoShot) => void;
  onUseUpload: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef(new Tracker());
  const itemsRef = useRef<LiveItem[]>([]);
  const sceneRef = useRef<SceneRead | null>(null);
  const settingsRef = useRef(settings);
  const visibleRef = useRef(true);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; collector: KeyframeCollector; start: number; lastSample: number } | null>(null);
  const genRef = useRef(0);
  const mirroredRef = useRef(false);
  // Live AI audit. Read by the frame loop, so it lives in refs.
  const viewsRef = useRef<AuditedView[]>([]);
  const aiRef = useRef({
    inFlight: false,
    cooldown: COOLDOWN_MIN_MS,
    lastDone: 0,
    /** Why the cloud model is not being used right now, if it is not. */
    cloudNote: null as string | null,
    /** The cloud model is not tried again before this time (ms). */
    cloudRetryAt: 0,
    /** Which path is confirming the current view. */
    confirmingWith: "on-device" as AnalysisMode,
  });

  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<{ text: string; noCamera: boolean } | null>(null);
  const t = useT();
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [canFlip, setCanFlip] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [detector, setDetector] = useState<{ model: string; delegate: string } | "loading" | "failed">("loading");
  const [fps, setFps] = useState(0);
  const [items, setItems] = useState<LiveItem[]>([]);
  const [scene, setScene] = useState<SceneRead | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [flash, setFlash] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [full, setFull] = useState(false);
  // Whether still views go to the cloud model follows the one app-wide mode.
  const engine = useEngine();
  const aiOn = engine.mode === "enhanced";
  const engineModeRef = useRef(engine.mode);
  const [ai, setAi] = useState<AiStatus>({ kind: "moving", candidates: 0 });
  const prefs = usePrefs();
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  /** Set by the Confirm button or the C key: the next steady frame is sent whatever the gates say. */
  const manualRef = useRef(false);
  const viewRef = useRef<HTMLDivElement>(null);
  // Null until mounted: the page is prerendered, and a build-time clock would not match.
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // The clock line ("9:42 PM · after hours") ticks once a minute.
  useEffect(() => {
    const tick = () => setNow(nowLocal());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const stopStream = useCallback(() => {
    genRef.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackerRef.current.reset();
    // A different camera sees different views.
    viewsRef.current = [];
  }, []);

  useEffect(() => {
    engineModeRef.current = engine.mode;
    // Switching mode changes what "confirmed" means; earlier confirmations do not carry over.
    viewsRef.current = [];
  }, [engine.mode]);

  /**
   * Confirm the current view through the strong path: the same reading a photo
   * gets. Enhanced mode sends the frame to the cloud model; if that fails, or
   * in On-device mode, the frame gets the full tiled on-device read instead.
   * Either way the answer is labelled with the path that produced it.
   */
  const confirmView = useCallback(async (sig: Float32Array) => {
    const v = videoRef.current;
    const a = aiRef.current;
    if (!v || a.inFlight) return;
    const gen = genRef.current;
    const still = toCanvas(v, 1280);
    if (!still) return;
    a.inFlight = true;
    let ok = false;
    let items: LiveItem[] | null = null;
    let mode: AnalysisMode = "on-device";
    const now0 = performance.now();
    try {
      if (engineModeRef.current === "enhanced" && now0 >= a.cloudRetryAt) {
        a.confirmingWith = "enhanced";
        try {
          const square = await analysisSquare(still.toDataURL("image/jpeg", 0.85), 0.8);
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: square.dataUrl, frame: square.frame, source: "Live view", settings: settingsRef.current }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => null)) as AnalyzeError | null;
            a.cloudNote =
              err?.code === "rate-limited"
                ? "Cloud limit reached · confirming on-device for now"
                : err?.code === "no-engine"
                  ? "No cloud model configured · confirming on-device"
                  : "Cloud model did not answer · confirming on-device";
            a.cloudRetryAt = performance.now() + (err?.code === "rate-limited" ? Math.min(600, err.retryAfterSeconds ?? 60) * 1000 : err?.code === "no-engine" ? 600000 : 30000);
          } else {
            const result = (await res.json()) as AnalysisResult;
            items = observationsToItems(result.observations ?? [], settingsRef.current);
            mode = "enhanced";
            a.cloudNote = null;
          }
        } catch {
          a.cloudNote = navigator.onLine ? "Cloud model unreachable · confirming on-device" : "Offline · confirming on-device";
          a.cloudRetryAt = performance.now() + 30000;
        }
      }
      if (!items) {
        a.confirmingWith = "on-device";
        const read = await readStill(still, settingsRef.current);
        items = read.items.filter((i) => i.kind !== "other");
        mode = "on-device";
      }
      if (gen !== genRef.current) return;
      ok = true;
      const id = (viewsRef.current.at(-1)?.id ?? 0) + 1;
      viewsRef.current = [...viewsRef.current, { id, sig, items, mode }].slice(-MAX_VIEWS);
      beep(prefsRef.current, "confirmed");
      buzz(prefsRef.current, [8, 30, 8]);
    } catch {
      // The still read itself failed (detector not loaded yet, most likely): try again after the cooldown.
    } finally {
      a.inFlight = false;
      a.lastDone = performance.now();
      a.cooldown = nextCooldown(a.cooldown, ok);
    }
  }, []);

  const start = useCallback(
    async (face: "environment" | "user") => {
      stopStream();
      const gen = genRef.current;
      let stream: MediaStream;
      try {
        // Browsers only expose the camera on https or localhost. Opening the dev
        // server from a phone at http://192.168.x.x hits exactly this.
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("", "SecurityError");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: face }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (err) {
        if (gen !== genRef.current) return;
        const name = err instanceof Error ? err.name : "";
        setPhase("error");
        setError(
          name === "SecurityError"
            ? { text: "cam.https", noCamera: true }
            : name === "NotAllowedError"
              ? { text: "cam.blocked", noCamera: false }
              : name === "NotFoundError" || name === "OverconstrainedError"
                ? { text: "cam.no.camera", noCamera: true }
                : { text: "cam.busy", noCamera: false },
        );
        return;
      }
      if (gen !== genRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setPhase("live");

      // Offer only the controls this camera actually has.
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch(caps.torch ? false : null);
      navigator.mediaDevices
        .enumerateDevices?.()
        .then((d) => setCanFlip(d.filter((x) => x.kind === "videoinput").length > 1))
        .catch(() => {});
    },
    [stopStream],
  );

  useEffect(() => {
    let cancelled = false;
    getDetector("VIDEO")
      .then((d) => !cancelled && setDetector({ model: d.model, delegate: d.delegate }))
      .catch(() => !cancelled && setDetector("failed"));
    start("environment");
    return () => {
      cancelled = true;
      if (recRef.current?.rec.state === "recording") recRef.current.rec.stop();
      recRef.current = null;
      stopStream();
    };
  }, [start, stopStream]);

  // Pause the work - not the camera - while the viewfinder is scrolled away or the tab hidden.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (visibleRef.current = e.intersectionRatio > 0.15 && !document.hidden), {
      threshold: [0, 0.15, 0.5],
    });
    io.observe(el);
    const onVis = () => (visibleRef.current = !document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // The frame loop. Detection and drawing run outside React; the panel updates a few times a second.
  useEffect(() => {
    if (phase !== "live") return;
    let raf = 0;
    let lastTs = 0;
    let lastHud = 0;
    let lastScene = 0;
    let lastFrame = performance.now();
    let fpsEma = 0;
    let det: Awaited<ReturnType<typeof getDetector>>["detector"] | null = null;
    getDetector("VIDEO")
      .then((d) => (det = d.detector))
      .catch(() => {});
    // 256 across: enough to see a downlight as a shape, cheap enough for every few frames.
    // The second opinion: checks the detector's boxes and finds lamps (lib/verify.ts).
    let classifier: Awaited<ReturnType<typeof getClassifier>> | null = null;
    getClassifier()
      .then((c) => (classifier = c))
      .catch(() => {});
    const verifier = new Verifier();
    const centerLamp = new CenterLamp();
    let lastClassify = 0;
    let classifyTurn = 0;
    const reader = new FrameReader(256);
    const lightTracker = new LightTracker();
    let luma: ReturnType<FrameReader["read"]> = null;
    let tracks: Track[] = [];
    // Is the camera still, and on which audited view? Ten times a second, on a thumbnail.
    const sigReader = new PixelReader(SIG_W, SIG_H);
    let lastSig = 0;
    let prevSig: Float32Array | null = null;
    let steadySince = 0;
    let view: AuditedView | null = null;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const v = videoRef.current;
      const canvas = canvasRef.current;
      if (!v || !canvas || !v.videoWidth) return;
      const now = performance.now();
      const rec = recRef.current;

      if (rec) {
        // Recording: collect keyframes, draw nothing over the picture.
        if (now - rec.lastSample > 350) {
          rec.lastSample = now;
          rec.collector.push(v, (now - rec.start) / 1000);
        }
        clear(canvas);
        return;
      }
      if (!visibleRef.current) return;

      const sw = v.videoWidth;
      const sh = v.videoHeight;
      if (now - lastSig > 100) {
        lastSig = now;
        const px = sigReader.rgba(v);
        if (px) {
          const sig = frameSignature(px);
          const still = prevSig ? sigDiff(prevSig, sig) < STILL_DIFF : false;
          prevSig = sig;
          steadySince = still ? steadySince || now : 0;
          view = nearestView(sig, viewsRef.current)?.view ?? null;
          const a = aiRef.current;
          const wanted = manualRef.current;
          if (wanted && !a.inFlight) {
            manualRef.current = false;
            viewsRef.current = viewsRef.current.filter((x) => x.sig !== view?.sig);
            view = null;
            confirmView(sig);
          } else if (
            !prefsRef.current.manualConfirm &&
            shouldAutoAudit({
              enabled: true,
              inFlight: a.inFlight,
              steadyMs: steadySince ? now - steadySince : 0,
              alreadyAudited: !!view,
              sinceLastMs: now - a.lastDone,
              cooldownMs: a.cooldown,
            })
          )
            confirmView(sig);
        }
      }
      if (det) {
        try {
          const ts = Math.max(now, lastTs + 1);
          lastTs = ts;
          // Only the classes the small model is reliably good at become candidates;
          // vehicles are kept (never drawn) so glare on them is not read as a lamp.
          const raw = toPixelDetections(det.detectForVideo(v, ts).detections as never).filter(
            (d) => isLiveClass(d.cls, d.score) || COCO_MAP[d.cls]?.kind === "other",
          );
          tracks = trackerRef.current.update(raw);
        } catch {
          // A dropped frame is not worth a visible error.
        }
      }
      const frac = (t: Track) =>
        [t.box.x / sw, t.box.y / sh, (t.box.x + t.box.w) / sw, (t.box.y + t.box.h) / sh] as [number, number, number, number];
      verifier.prune(trackerRef.current.ids());

      // One classifier look every ~180 ms, alternating between the track most in
      // need of a check and the middle of the frame (is the camera on a lamp?).
      if (classifier && now - lastClassify > 180) {
        lastClassify = now;
        const job = verifier.due(tracks, now);
        try {
          if (job && classifyTurn++ % 2 === 0) {
            const box = frac(job);
            let verdict = judge(job.cls, classifyRegion(classifier, v, padBox(box)));
            // A fridge is white, steel or black; a wooden door or cupboard is not.
            if (job.cls === "refrigerator" && verdict !== "lamp" && luma?.rgba && regionSaturation(luma.rgba, luma.w, luma.h, box) > 0.33)
              verdict = "reject";
            verifier.record(job.id, verdict, now);
          } else {
            centerLamp.update(lampScore(classifyRegion(classifier, v, CENTER_ROI)));
          }
        } catch {
          // A failed classification is just a missed vote.
        }
      }
      const ready = classifier !== null;
      const lampTracks = tracks.filter((t) => verifier.status(t.id, t.cls, t.score, ready) === "lamp");
      // Candidates: shown by the verifier, not the whole wall, and - for screens - not a
      // bright flat patch, which is a window or a white wall, not a lit display.
      const shown = tracks.filter((t) => {
        if (verifier.status(t.id, t.cls, t.score, ready) !== "show") return false;
        const box = frac(t);
        if (tooBig(t.cls, box)) return false;
        if ((t.cls === "tv" || t.cls === "laptop") && luma) {
          const panel = panelOf(t.cls, box);
          if (looksLikeWindow(regionStats(luma.data, luma.w, luma.h, panel), luma.rgba ? regionSaturation(luma.rgba, luma.w, luma.h, panel) : undefined)) return false;
        }
        return true;
      });

      if (now - lastScene > 220) {
        lastScene = now;
        luma = reader.read(v);
        if (luma) {
          const scene = readScene(luma.data, luma.w, luma.h, luma.rgba, "live");
          const blockers = [
            ...shown.filter((t) => LIGHT_BLOCKERS.has(t.cls)),
            // Vehicles are never drawn, but glare on them still is not a lamp.
            ...tracks.filter((t) => LIGHT_BLOCKERS.has(t.cls) && COCO_MAP[t.cls]?.kind === "other"),
          ].map(frac);
          const candidates = scene.lights.filter((l) => {
            const cx = (l.box[0] + l.box[2]) / 2;
            const cy = (l.box[1] + l.box[3]) / 2;
            return !blockers.some((b) => cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]);
          });
          // Only lights that hold steady across reads: no blinking LEDs, no passing glints.
          let lights = lightTracker.update(candidates);
          // Lamps the classifier recognised - mislabelled detections, or what the
          // camera is pointed at - where the pixels show them lit.
          if (!scene.outdoor) {
            const lamps: { box: number[]; confidence: number; min?: number }[] = lampTracks.map((t) => ({ box: frac(t), confidence: 0.75 }));
            if (centerLamp.confidence) lamps.push({ box: CENTER_ROI, confidence: 0.5 + centerLamp.confidence / 2, min: 240 });
            lights = withLamps(lights, lamps, luma);
          }
          sceneRef.current = { ...scene, lights, lighting: lights.length ? "on" : scene.dark ? "off" : "unclear" };
        }
      }
      const dets = dedupeCandidates(
        shown.map((t) => ({
          id: t.id,
          cls: t.cls,
          score: t.score,
          box: [t.box.x / sw, t.box.y / sh, (t.box.x + t.box.w) / sw, (t.box.y + t.box.h) / sh] as [number, number, number, number],
        })),
      );
      // Candidates carry no cost: the live detector suggests, the strong path decides.
      const candidates: ViewItem[] = readItems(dets, sceneRef.current?.lights ?? [], settingsRef.current, luma ?? undefined).map((i) => ({
        ...i,
        candidate: true,
      }));
      // On a confirmed view, the confirmed answer replaces the candidates.
      itemsRef.current = view ? view.items : candidates;
      const holdProgress = view || aiRef.current.inFlight ? 0 : steadySince ? Math.min(1, (now - steadySince) / STEADY_MS) : 0;
      drawOverlay(canvas, sw, sh, itemsRef.current, now, mirroredRef.current, aiRef.current.inFlight, holdProgress, prefsRef.current.minimalOverlay);

      const dt = now - lastFrame;
      lastFrame = now;
      fpsEma = fpsEma ? fpsEma * 0.9 + (1000 / Math.max(dt, 1)) * 0.1 : 1000 / Math.max(dt, 1);
      if (now - lastHud > 300) {
        lastHud = now;
        setFps(Math.round(fpsEma));
        setItems(itemsRef.current);
        setScene(sceneRef.current);
        const a = aiRef.current;
        const wait = Math.ceil((a.cooldown - (now - a.lastDone)) / 1000);
        setAi(
          a.inFlight
            ? { kind: "confirming", mode: a.confirmingWith }
            : view
              ? { kind: "confirmed", count: view.items.filter((i) => i.kind !== "other").length, mode: view.mode }
              : a.cloudNote && engineModeRef.current === "enhanced"
                ? { kind: "note", text: a.cloudNote }
                : wait > 0 && steadySince && now - steadySince >= STEADY_MS
                  ? { kind: "waiting", seconds: wait }
                  : { kind: "moving", candidates: candidates.filter((i) => i.kind !== "other").length },
        );
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, confirmView]);

  // ---- actions -----------------------------------------------------------

  // ---- full screen ---------------------------------------------------------
  //
  // The viewfinder takes the whole screen as a fixed layer, which works on every
  // phone. Where the browser allows it (Android, desktop) it also asks for real
  // full screen so the address bar goes too; iOS Safari only allows that for a
  // bare <video>, which would lose the overlay, so there it stays a layer. A
  // history entry makes the phone's back gesture leave full screen, not the page.

  const enterFull = useCallback(() => {
    setFull(true);
    setSheetOpen(false);
    document.body.classList.add("cam-full");
    history.pushState({ camFull: true }, "");
    const el = viewRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    try {
      const req = el?.requestFullscreen?.({ navigationUI: "hide" });
      req?.catch(() => {});
      if (!req) el?.webkitRequestFullscreen?.();
    } catch {
      // A fixed layer is full screen enough.
    }
  }, []);

  const leaveFull = useCallback(() => {
    setFull(false);
    document.body.classList.remove("cam-full");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const exitFull = useCallback(() => {
    // Unwind our history entry; the popstate handler does the rest.
    if ((history.state as { camFull?: boolean } | null)?.camFull) history.back();
    else leaveFull();
  }, [leaveFull]);

  useEffect(() => {
    if (!full) return;
    const onPop = () => leaveFull();
    // Leaving the browser's own full screen (Esc, a system gesture) leaves ours.
    const onFs = () => {
      if (!document.fullscreenElement) exitFull();
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [full, leaveFull, exitFull]);

  // Unmounting (switching to Upload, leaving the page) must not strand the class.
  useEffect(() => () => document.body.classList.remove("cam-full"), []);

  function shoot() {
    const v = videoRef.current;
    if (!v || phase !== "live" || recording) return;
    const dataUrl = toJpeg(v, 1280, 0.86);
    if (!dataUrl) return;
    setFlash((f) => f + 1);
    buzz(prefsRef.current, 12);
    const items = itemsRef.current as ViewItem[];
    const confirmed = items.length > 0 ? !items.some((i) => i.candidate) : ai.kind === "confirmed";
    onPhoto({ dataUrl, items, scene: sceneRef.current, confirmed, mode: confirmed && ai.kind === "confirmed" ? ai.mode : undefined });
  }

  function startRecording() {
    const stream = streamRef.current;
    const mime = recorderMime();
    if (!stream || phase !== "live") return;
    if (!mime) {
      setError({ text: "This browser can't record video. Take photos, or upload a clip from your camera app.", noCamera: false });
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const state = { rec, chunks: [] as Blob[], collector: new KeyframeCollector(), start: performance.now(), lastSample: 0 };
    rec.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
    rec.onstop = () => {
      const duration = (performance.now() - state.start) / 1000;
      const blob = new Blob(state.chunks, { type: mime.split(";")[0] });
      const keyframes = state.collector.finish(6);
      if (keyframes.length) onVideo({ url: URL.createObjectURL(blob), duration, keyframes });
    };
    recRef.current = state;
    rec.start(1000);
    setRecording(true);
    setRecSeconds(0);
    setSheetOpen(false);
    buzz(prefsRef.current, 20);
  }

  const stopRecording = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (r && r.rec.state !== "inactive") r.rec.stop();
    buzz(prefsRef.current, [10, 40, 10]);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const r = recRef.current;
      if (!r) return;
      const s = (performance.now() - r.start) / 1000;
      setRecSeconds(s);
      if (s >= MAX_RECORD_S) stopRecording();
    }, 250);
    return () => clearInterval(t);
  }, [recording, stopRecording]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }

  function flip() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    setPhase("starting");
    start(next);
  }

  // Keyboard: Space photo, V video, F flip, C confirm. Never while typing in a field.
  useEffect(() => {
    if (!prefs.shortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === " ") {
        e.preventDefault();
        shoot();
      } else if (k === "v") {
        if (recRef.current) stopRecording();
        else startRecording();
      } else if (k === "f") {
        if (canFlip) flip();
      } else if (k === "c") {
        manualRef.current = true;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const time = useMemo(() => (now ? readTime(now, schedule) : null), [now, schedule]);
  const mirrored = facing === "user";
  useEffect(() => {
    mirroredRef.current = mirrored;
  }, [mirrored]);

  return (
    <div ref={rootRef} className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4">
      {/* ---- viewfinder ---- */}
      <div
        ref={viewRef}
        className={`overflow-hidden bg-[#07090c] text-white ${
          full
            ? "fixed inset-0 z-[200] h-[100dvh] w-screen"
            : "relative h-[calc(100svh-10.5rem-env(safe-area-inset-bottom))] min-h-[440px] rounded-[1.5rem] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)] lg:h-auto lg:min-h-0 lg:aspect-[4/3]"
        }`}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
        />
        {/* Not mirrored with the video: boxes are flipped when drawn, so labels stay readable. */}
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {/* shutter flash */}
        <AnimatePresence>
          {flash > 0 && (
            <motion.div
              key={flash}
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
              className="pointer-events-none absolute inset-0 bg-white"
            />
          )}
        </AnimatePresence>

        {/* top bar */}
        <div
          className={`cam-topbar absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 pb-10 sm:p-4 ${
            full ? "pt-[max(0.75rem,env(safe-area-inset-top))]" : ""
          }`}
        >
          {recording ? (
            <div className="flex items-center gap-2 rounded-full bg-[#e5372a] px-3 py-1.5 font-mono text-[0.78rem] font-semibold">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              REC {fmtClock(recSeconds)}
              <span className="font-normal opacity-75">/ {fmtClock(MAX_RECORD_S)}</span>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 font-mono text-[0.68rem] backdrop-blur-md">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${phase === "live" ? "bg-[#ff6a5c] pulse-dot" : "bg-white/40"}`} />
              <span className="font-semibold tracking-wide">LIVE</span>
              {/* The detail line is for a wide screen; a phone keeps the chip to one word and says the rest in the sheet. */}
              <span className="hidden truncate text-white/60 sm:inline">
                {ai.kind !== "moving"
                  ? aiLine(ai)
                  : typeof detector === "object"
                    ? `${detector.model.replace("EfficientDet-", "")} · ${detector.delegate} · ${fps} fps`
                    : detector === "loading"
                      ? "loading detector…"
                      : "detector offline"}
              </span>
            </div>
          )}
          <div className="flex shrink-0 gap-2">
            {!recording && (
              <span
                title={engine.detail}
                className={`flex h-10 items-center gap-1.5 rounded-full px-3 font-mono text-[0.68rem] font-semibold backdrop-blur-md ${
                  engine.offline ? "bg-[#e5372a]/80 text-white" : aiOn ? "bg-[#ffd84d] text-black" : "bg-black/45 text-white/85"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {engine.offline ? "Offline" : aiOn ? "Enhanced" : "On-device"}
              </span>
            )}
            {torch !== null && !recording && (
              <RoundButton label={torch ? "Torch off" : "Torch on"} onClick={toggleTorch} active={torch}>
                <Icon name="torch" className="h-[1.15rem] w-[1.15rem]" />
              </RoundButton>
            )}
            <RoundButton label={full ? "Exit full screen" : "Full screen"} onClick={full ? exitFull : enterFull}>
              <Icon name={full ? "collapse" : "expand"} className="h-[1.15rem] w-[1.15rem]" />
            </RoundButton>
          </div>
        </div>

        {/* starting / error */}
        {phase !== "live" && (
          <div className="absolute inset-0 grid place-items-center p-6">
            {error ? (
              <div className="max-w-xs rounded-2xl bg-black/70 p-5 text-center backdrop-blur-md">
                <Icon name="camera" className="mx-auto h-8 w-8 text-white/70" />
                <p className="mt-3 text-[0.92rem] leading-relaxed text-white/85">{error.text.startsWith("cam.") ? t(error.text as Parameters<typeof t>[0]) : error.text}</p>
                <div className="mt-4 flex justify-center gap-2">
                  {!error.noCamera && (
                    <button
                      onClick={() => {
                        setPhase("starting");
                        setError(null);
                        start(facing);
                      }}
                      className="rounded-full border border-white/30 px-4 py-2 text-[0.85rem]">
                      {t("cam.try.again")}
                    </button>
                  )}
                  <button onClick={onUseUpload} className="rounded-full bg-white px-4 py-2 text-[0.85rem] font-medium text-black">
                    {t("cam.upload.instead")}
                  </button>
                </div>
              </div>
            ) : (
              <p className="font-mono text-[0.75rem] text-white/60">opening camera…</p>
            )}
          </div>
        )}

        {/* phone: the live read, as a sheet over the picture */}
        {phase === "live" && !recording && (
          <div
            className={`absolute inset-x-3 ${
              full ? "bottom-[calc(7.5rem+env(safe-area-inset-bottom))] mx-auto max-w-md" : "bottom-[7.25rem] lg:hidden"
            }`}
          >
            <AnimatePresence initial={false}>
              {sheetOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  className={`mb-2 overflow-y-auto rounded-2xl bg-black/70 p-3 backdrop-blur-xl ${full ? "max-h-[48dvh]" : "max-h-[38svh]"}`}
                >
                  <LiveRead items={items} scene={scene} ai={ai} time={time} geo={geo} geoBusy={geoBusy} onLocate={onLocate} dark />
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={() => setSheetOpen((o) => !o)}
              aria-expanded={sheetOpen}
              className="flex w-full items-center justify-between gap-3 rounded-full bg-black/55 py-2 pl-4 pr-3 text-left backdrop-blur-xl"
            >
              <SummaryLine items={items} dark ai={ai} />
              <Icon name="chevron" className={`h-4 w-4 shrink-0 text-white/70 transition-transform ${sheetOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        )}

        {/* controls */}
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-6 pt-12 ${
            full ? "pb-[max(1.5rem,env(safe-area-inset-bottom))]" : "pb-5"
          }`}
        >
          {prefs.manualConfirm && phase === "live" && !recording && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  manualRef.current = true;
                }}
                className="rounded-full bg-white/90 px-4 py-1.5 text-[0.8rem] font-medium text-black backdrop-blur-md"
              >
                {t("cam.confirm.now")}
              </button>
            </div>
          )}
          <div className="cam-controls mx-auto flex max-w-sm items-center justify-between">
            <div className="flex w-16 justify-center">
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={phase !== "live"}
                aria-label={recording ? "Stop recording and analyse" : "Record a walkthrough video"}
                className="group flex flex-col items-center gap-1 disabled:opacity-40"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-white/80 bg-black/30 backdrop-blur-md">
                  <motion.span
                    animate={recording ? { borderRadius: 4, width: 16, height: 16 } : { borderRadius: 999, width: 22, height: 22 }}
                    className="block bg-[#e5372a]"
                  />
                </span>
                <span className="text-[0.66rem] font-medium tracking-wide text-white/80">{recording ? "Stop" : "Video"}</span>
              </button>
            </div>

            <button
              onClick={shoot}
              disabled={phase !== "live" || recording}
              aria-label="Take a photo and run the full AI audit on it"
              className="group flex flex-col items-center gap-1 disabled:opacity-35"
            >
              <span className="grid h-[4.6rem] w-[4.6rem] place-items-center rounded-full border-[3px] border-white transition-transform active:scale-90">
                <span className="h-[3.7rem] w-[3.7rem] rounded-full bg-white transition-colors group-active:bg-white/70" />
              </span>
              <span className="text-[0.66rem] font-medium tracking-wide text-white/80">Photo</span>
            </button>

            <div className="flex w-16 justify-center">
              {canFlip && !recording ? (
                <button onClick={flip} aria-label="Switch camera" className="flex flex-col items-center gap-1">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15 backdrop-blur-md">
                    <Icon name="flip" className="h-5 w-5" />
                  </span>
                  <span className="text-[0.66rem] font-medium tracking-wide text-white/80">Flip</span>
                </button>
              ) : null}
            </div>
          </div>
          {recording && (
            <p className="mt-3 text-center text-[0.72rem] text-white/70">
              Walk slowly and pan across the room. Stop to analyse the whole clip.
            </p>
          )}
        </div>
      </div>

      {/* ---- desktop side panel ---- */}
      <aside className="panel hidden min-h-0 flex-col p-4 lg:flex">
        {recording ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e5372a]/10 text-[#e5372a]">
              <Icon name="video" />
            </span>
            <p className="mt-3 font-mono text-2xl font-semibold text-fog">{fmtClock(recSeconds)}</p>
            <p className="mt-2 max-w-[24ch] text-[0.85rem] leading-relaxed text-mist">
              Recording. Labels are hidden while you film; the whole clip is analysed when you stop.
            </p>
          </div>
        ) : (
          <LiveRead items={items} scene={scene} ai={ai} time={time} geo={geo} geoBusy={geoBusy} onLocate={onLocate} />
        )}
      </aside>
    </div>
  );
}

// ---- the live read --------------------------------------------------------

interface Row {
  key: string;
  label: string;
  kind: LiveItem["kind"];
  state: LiveItem["state"];
  count: number;
  watts: number;
  cost: number;
  typical: number;
  score: number;
}

function group(items: readonly LiveItem[]): Row[] {
  const rows = new Map<string, Row>();
  for (const it of items) {
    if (it.kind === "other") continue;
    const key = `${it.label}:${it.state ?? ""}`;
    const r = rows.get(key);
    if (r) {
      r.count++;
      r.watts += it.watts;
      r.cost += it.costPerYear;
      r.typical += it.typicalCostPerYear;
      r.score = Math.max(r.score, it.score);
    } else {
      rows.set(key, { key, label: it.label, kind: it.kind, state: it.state, count: 1, watts: it.watts, cost: it.costPerYear, typical: it.typicalCostPerYear, score: it.score });
    }
  }
  return [...rows.values()].sort((a, b) => b.cost - a.cost || b.count - a.count);
}

/**
 * The cost pill: everything in view, priced at once. While the view is only the
 * on-device read it is an estimate and says so; when the confirm step has read
 * it through the strong path the same pill says confirmed.
 */
function SummaryLine({ items, dark, ai }: { items: readonly ViewItem[]; dark?: boolean; ai?: AiStatus }) {
  const t = useT();
  const shown = items.filter((i) => i.kind !== "other" && i.state !== "off");
  const estimate = shown.some((i) => i.candidate);
  const cost = shown.reduce((s, i) => s + i.costPerYear, 0);
  if (!shown.length) {
    return (
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={`text-[0.9rem] font-medium ${dark ? "text-white" : "text-fog"}`}>{ai?.kind === "confirming" ? t("cam.confirming") : t("cam.scanning")}</span>
        <span className={`truncate text-[0.78rem] ${dark ? "text-white/70" : "text-mist"}`}>{t("cam.point.short")}</span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className={`font-mono text-[1.05rem] font-semibold ${dark ? "text-white" : "text-fog"}`}>
        ≈{fmtMoney(cost)}
        <span className={`text-[0.72rem] font-normal ${dark ? "text-white/60" : "text-dim"}`}>{t("cam.if.left.on")}</span>
      </span>
      <span className={`truncate text-[0.78rem] ${dark ? "text-white/70" : "text-mist"}`}>
        {shown.length} {t("cam.in.view")} · {estimate ? (ai?.kind === "confirming" ? t("cam.confirming") : t("cam.estimate")) : t("cam.confirmed.short")}
      </span>
    </span>
  );
}

const PATH_WORD: Record<AnalysisMode, string> = { enhanced: "cloud model", "on-device": "on-device read" };

/** One line on what the confirm step is doing. */
function aiLine(ai: AiStatus): string {
  switch (ai.kind) {
    case "moving":
      return ai.candidates ? `${ai.candidates} in view · live estimate` : "Scanning";
    case "confirming":
      return `Confirming with the ${PATH_WORD[ai.mode]}…`;
    case "confirmed":
      return ai.count ? `Confirmed by the ${PATH_WORD[ai.mode]} · ${ai.count} found` : `Confirmed by the ${PATH_WORD[ai.mode]} · nothing powered`;
    case "waiting":
      return `Confirms this view in ${ai.seconds}s`;
    case "note":
      return ai.text;
  }
}

function LiveRead({
  items,
  scene,
  ai,
  time,
  geo,
  geoBusy,
  onLocate,
  dark,
}: {
  items: readonly ViewItem[];
  scene: SceneRead | null;
  ai: AiStatus;
  time: ReturnType<typeof readTime>;
  geo: GeoContext | null;
  geoBusy: boolean;
  onLocate: () => void;
  dark?: boolean;
}) {
  const shown = items.filter((i) => i.state !== "off");
  const rows = group(shown);
  const cost = shown.reduce((s, i) => s + i.costPerYear, 0);
  const typical = shown.reduce((s, i) => s + i.typicalCostPerYear, 0);
  const watts = shown.reduce((s, i) => s + i.watts, 0);
  const confirmed = ai.kind === "confirmed";
  const estimate = shown.some((i) => i.candidate);
  const tr = useT();
  const t = dark
    ? { fog: "text-white", mist: "text-white/75", dim: "text-white/55", line: "border-white/10", chip: "bg-white/10" }
    : { fog: "text-fog", mist: "text-mist", dim: "text-dim", line: "border-line", chip: "bg-surface2" };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!dark && (
        <div className="flex items-center justify-between">
          <span className="mono-label">{confirmed && !estimate ? `${tr("cam.confirmed.by")} · ${PATH_WORD[ai.mode]}` : tr("cam.live.estimate")}</span>
          <span className="font-mono text-[0.66rem] text-dim">{ai.kind === "confirming" ? tr("cam.confirming") : confirmed && !estimate ? tr("cam.priced") : tr("cam.refines")}</span>
        </div>
      )}

      <div className={dark ? "" : "mt-3"}>
        {shown.length ? (
          <>
            <div className={`font-mono text-[2rem] font-bold leading-none ${t.fog}`}>
              ≈{fmtMoney(cost)}
              <span className={`ml-1 text-sm font-normal ${t.dim}`}>{tr("cam.if.left.on")}</span>
            </div>
            <p className={`mt-1.5 text-[0.78rem] ${t.mist}`}>
              <span className={`font-mono font-semibold ${t.fog}`}>≈{fmtMoney(typical)}/yr</span> {tr("cam.typical")} · {fmtWatts(watts)} {tr("cam.drawing")}
            </p>
          </>
        ) : (
          <>
            <div className={`text-[1.3rem] font-semibold leading-tight ${t.fog}`}>{ai.kind === "confirming" ? tr("cam.confirming") : tr("cam.scanning")}</div>
            <p className={`mt-1 text-[0.78rem] ${t.mist}`}>{tr("cam.point")}</p>
          </>
        )}
      </div>

      <ul className={`mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto ${dark ? "" : "max-h-[300px]"}`}>
        {rows.length === 0 && (
          <li className={`rounded-xl border border-dashed ${t.line} px-3 py-4 text-center text-[0.8rem] ${t.dim}`}>
            {tr("cam.nothing")}
          </li>
        )}
        {rows.map((r, i) => (
          <motion.li
            key={r.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04 }}
            className={`flex items-center gap-2.5 rounded-xl ${t.chip} px-2.5 py-2`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: itemColor(r) }} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[0.84rem] font-medium ${t.fog}`}>
                {r.count > 1 ? `${r.count} × ` : ""}
                {r.label}
                {r.state === "standby" && <span className={`ml-1.5 text-[0.72rem] font-normal ${t.dim}`}>screen dark</span>}
                {r.state === "on" && r.kind === "device" && (r.label === "screen" || r.label === "laptop") && (
                  <span className={`ml-1.5 text-[0.72rem] font-normal ${t.dim}`}>lit</span>
                )}
              </span>
              <span className={`block font-mono text-[0.66rem] ${t.dim}`}>
                {r.kind === "person" ? "room in use" : `${fmtWatts(r.watts)} · ${Math.round(r.score * 100)}% sure`}
              </span>
            </span>
            {r.kind !== "person" && (
              <span className="text-right">
                <span className={`block font-mono text-[0.8rem] font-semibold ${t.fog}`}>{fmtMoney(r.cost)}</span>
                <span className={`block font-mono text-[0.64rem] ${t.dim}`}>{fmtMoney(r.typical)} typ</span>
              </span>
            )}
          </motion.li>
        ))}
      </ul>

      <div className={`mt-3 space-y-1.5 border-t ${t.line} pt-3 text-[0.76rem] ${t.mist}`}>
        <ContextRow icon="sparkle" dark={dark}>
          <span className={ai.kind === "confirmed" ? "text-lime" : ai.kind === "note" ? "text-amber" : ""}>{aiLine(ai)}</span>
        </ContextRow>
        <ContextRow icon="bulb" dark={dark}>
          {ai.kind === "confirmed"
            ? (() => {
                const lit = shown.filter((i) => i.kind === "light").length;
                return lit ? `Confirmed: ${lit} light${lit > 1 ? "s" : ""} on in this view` : "Confirmed: no lights on in this view";
              })()
            : scene
            ? scene.outdoor
              ? "Looking outdoors: lights aren't judged in daylight"
              : scene.lights.length
              ? `${scene.lights.length} light fixture${scene.lights.length > 1 ? "s" : ""} look lit`
              : scene.dark
                ? "Room is dark: lights look off"
                : "No lit fixtures spotted"
            : "Reading the lighting…"}
        </ContextRow>
        {time && (
          <ContextRow icon="clock" dark={dark}>
            {time.label}
            {time.afterHours !== null && (
              <span className={time.afterHours ? "text-lime" : "text-amber"}>
                {" · "}
                {time.afterHours ? "after hours" : "open hours"}
              </span>
            )}
          </ContextRow>
        )}
        <ContextRow icon="pin" dark={dark}>
          {geo ? (
            <>
              {geo.place ?? "Location found"} · ${geo.ratePerKwh.toFixed(3)}/kWh
              {geo.utilityName ? ` · ${geo.utilityName}` : ""}
            </>
          ) : (
            <button onClick={onLocate} disabled={geoBusy} className="text-left underline decoration-dotted underline-offset-4 disabled:opacity-60">
              {geoBusy ? "Finding your utility…" : "Use my location for local electricity rates"}
            </button>
          )}
        </ContextRow>
      </div>

      {!dark && (
        <p className="mt-3 rounded-xl bg-surface2 px-3 py-2.5 text-[0.76rem] leading-relaxed text-mist">
          Boxes and prices appear at once from the detector in this browser. When the camera pauses on a view, the{" "}
          {ai.kind === "confirmed" || ai.kind === "confirming" ? PATH_WORD[ai.mode] : "cloud model"} reads it in the background and replaces the estimate - the same reading a photo gets.{" "}
          <span className="font-medium text-fog">Photo</span> saves this view to your results.{" "}
          <span className="font-medium text-fog">Video</span> records a walkthrough and audits the whole clip.
        </p>
      )}
    </div>
  );
}

function ContextRow({ icon, dark, children }: { icon: "bulb" | "clock" | "pin" | "person" | "sparkle"; dark?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} className={`mt-px h-4 w-4 shrink-0 ${dark ? "text-white/55" : "text-dim"}`} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function RoundButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-10 w-10 place-items-center rounded-full backdrop-blur-md transition-colors ${
        active ? "bg-[#ffd84d] text-black" : "bg-black/45 text-white"
      }`}
    >
      {children}
    </button>
  );
}

function fmtClock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

// ---- drawing --------------------------------------------------------------

function prepare(canvas: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx?.clearRect(0, 0, cw, ch);
  return { ctx, cw, ch };
}

function clear(canvas: HTMLCanvasElement) {
  prepare(canvas);
}

function bracket(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, L: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y);
  ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
  ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h);
  ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
  ctx.stroke();
}

function label(it: ViewItem): string {
  if (it.kind === "person") return "person · room in use";
  if (it.candidate && it.state !== "off") return `${it.label} · ${fmtWatts(it.watts)} · ~${fmtMoney(it.typicalCostPerYear)}/yr`;
  if (it.state === "off") return `${it.label} · off`;
  const state = it.why === "screen dark" ? " · dark" : it.state === "standby" ? " · standby" : it.why === "screen lit" ? " · lit" : "";
  // Typical use on the picture: the honest everyday figure. The panel adds the left-on one.
  return `${it.label}${state} · ${fmtWatts(it.watts)} · ${fmtMoney(it.typicalCostPerYear)}/yr typ`;
}

/**
 * One overlay frame: a box, corner brackets and a label per thing in view, each
 * coloured by what it costs - red for running, amber for a dark screen still on
 * standby, yellow dashes for a lit fixture, teal for a person.
 */
function drawOverlay(
  canvas: HTMLCanvasElement,
  sw: number,
  sh: number,
  items: readonly ViewItem[],
  now: number,
  mirrored: boolean,
  auditing = false,
  /** 0-1: how long the camera has been held still, toward the confirm step. */
  holdProgress = 0,
  /** Boxes only: no sweep, reticle or labels. */
  minimal = false,
) {
  const { ctx, cw, ch } = prepare(canvas);
  if (!ctx) return;
  const r = coverRect(sw, sh, cw, ch);
  const small = cw < 520;
  if (minimal) {
    drawBoxesOnly(ctx, r, items, mirrored);
    return;
  }

  // Slow sweep: reads as "scanning" without hiding anything. Faster and brighter
  // while the AI is reading the view.
  const sweepY = ((now / (auditing ? 1100 : 2600)) % 1) * ch;
  const g = ctx.createLinearGradient(0, sweepY - 60, 0, sweepY);
  g.addColorStop(0, "rgba(255,216,77,0)");
  g.addColorStop(1, `rgba(255,216,77,${auditing ? 0.22 : 0.09})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, sweepY - 60, cw, 60);

  // Centre reticle, with the hold-to-confirm progress drawn as a ring around it.
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1;
  const cx = cw / 2, cy = ch / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 9, cy);
  ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 9);
  ctx.stroke();
  if (holdProgress > 0 || auditing) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,216,77,0.35)";
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 2.5;
    const sweep = auditing ? ((now / 900) % 1) * Math.PI * 2 : holdProgress * Math.PI * 2;
    const start = auditing ? sweep : -Math.PI / 2;
    ctx.arc(cx, cy, 18, start, start + (auditing ? Math.PI * 0.6 : sweep));
    ctx.stroke();
  }

  // Label only the costliest few: forty chips bury the picture.
  const labelled = new Set(
    [...items]
      .filter((i) => i.kind !== "other")
      .sort((a, b) => (b.kind === "person" ? 1 : 0) - (a.kind === "person" ? 1 : 0) || b.costPerYear - a.costPerYear)
      .slice(0, small ? 5 : 9)
      .map((i) => i.key),
  );

  const placed = items
    .filter((i) => i.kind !== "other")
    .map((it) => {
      const [bx1, y1, bx2, y2] = it.box;
      const x1 = mirrored ? 1 - bx2 : bx1;
      const x2 = mirrored ? 1 - bx1 : bx2;
      return { it, x: r.x + x1 * r.w, y: r.y + y1 * r.h, w: (x2 - x1) * r.w, h: (y2 - y1) * r.h, color: itemColor(it) };
    });

  for (const p of placed) {
    const { it, x, y, w, h, color } = p;
    ctx.globalAlpha = 1;
    // Live detections and confirmed ones are drawn the same way: a box with a
    // price. A live one is an on-device estimate and says so in its label; the
    // confirm step quietly replaces it with the strong read when the view is held.
    if (it.kind === "light") {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      continue;
    }
    ctx.fillStyle = color + "18";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color + "70";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    bracket(ctx, x, y, w, h, Math.min(16, w * 0.3, h * 0.3));
    // Confidence: a thin bar along the bottom edge.
    ctx.fillStyle = color;
    ctx.fillRect(x, y + h - 2, w * it.score, 2);
  }

  ctx.font = `600 ${small ? 10 : 11.5}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = "middle";
  for (const p of placed) {
    if (!labelled.has(p.it.key)) continue;
    const text = label(p.it);
    const tw = ctx.measureText(text).width + 12;
    const th = small ? 18 : 20;
    let lx = Math.max(4, Math.min(p.x, cw - tw - 4));
    let ly = p.y - th - 3;
    if (ly < 4) ly = p.y + p.h + 3;
    if (ly + th > ch - 4) ly = p.y + 3;
    lx = Math.round(lx);
    ly = Math.round(ly);
    ctx.fillStyle = "rgba(5,7,10,0.78)";
    roundRect(ctx, lx, ly, tw, th, 6);
    ctx.fill();
    ctx.fillStyle = p.color;
    roundRect(ctx, lx, ly, 3, th, 1.5);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(text, lx + 8, ly + th / 2 + 0.5);
  }
}

/** The minimal overlay: one plain box per item, solid for confirmed and dashed for candidates. */
function drawBoxesOnly(ctx: CanvasRenderingContext2D, r: ReturnType<typeof coverRect>, items: readonly ViewItem[], mirrored: boolean) {
  for (const it of items) {
    if (it.kind === "other") continue;
    const [bx1, y1, bx2, y2] = it.box;
    const x1 = mirrored ? 1 - bx2 : bx1;
    const x2 = mirrored ? 1 - bx1 : bx2;
    const x = r.x + x1 * r.w, y = r.y + y1 * r.h, w = (x2 - x1) * r.w, h = (y2 - y1) * r.h;
    ctx.strokeStyle = itemColor(it);
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  ctx.setLineDash([]);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
