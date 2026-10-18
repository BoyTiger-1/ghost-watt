"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ObjectDetector } from "@mediapipe/tasks-vision";
import {
  COCO_MAP,
  COOLDOWN_MIN_MS,
  SIG_H,
  SIG_W,
  STEADY_MS,
  STILL_DIFF,
  Tracker,
  containRect,
  frameSignature,
  nearestView,
  nextCooldown,
  shouldAutoAudit,
  sigDiff,
  tallyView,
  type LiveTally,
  type Track,
} from "@/lib/live";
import { analysisSquare } from "@/lib/image";
import { fmtMoney } from "@/lib/energy";
import type { AnalysisResult, AuditSettings, Box, DeviceState } from "@/lib/types";

// Pinned to the installed package version: the WASM runtime and the JS that
// drives it must match exactly, or the detector fails to start with an opaque
// error.
const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODELS = "https://storage.googleapis.com/mediapipe-models/object_detector";
// Lite2 sees at 448px and finds the far rows of a classroom that Lite0 (320px)
// misses, but it is 12 MB and only keeps up on a GPU. Without one, Lite0.
const GPU_MODEL = { name: "EfficientDet-Lite2", url: `${MODELS}/efficientdet_lite2/float16/1/efficientdet_lite2.tflite` };
const CPU_MODEL = { name: "EfficientDet-Lite0", url: `${MODELS}/efficientdet_lite0/float16/1/efficientdet_lite0.tflite` };

let detectorPromise: Promise<{ detector: ObjectDetector; delegate: string; model: string }> | null = null;

/** One detector for the page's lifetime: it is a few MB and a second to warm up. */
function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      const make = (delegate: "GPU" | "CPU", url: string) =>
        ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: url, delegate },
          runningMode: "VIDEO",
          scoreThreshold: 0.3,
          maxResults: 40,
        });
      try {
        return { detector: await make("GPU", GPU_MODEL.url), delegate: "GPU", model: GPU_MODEL.name };
      } catch {
        // No WebGL2 (older phones, some locked-down school laptops): CPU still
        // manages several frames a second with the small model.
        return { detector: await make("CPU", CPU_MODEL.url), delegate: "CPU", model: CPU_MODEL.name };
      }
    })().catch((err) => {
      detectorPromise = null;
      throw err;
    });
  }
  return detectorPromise;
}

/** Short names for the tally line: the catalog's labels are written for reports. */
const LIVE_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(COCO_MAP)
    .filter((c) => c.categoryId)
    .map((c) => [c.categoryId!, c.label]),
);

/** "Laptop / Chromebook (charging)" is right for a report and too long for a box. */
function shortLabel(label: string): string {
  return label.split(/\s[/(]/)[0].toLowerCase();
}

const COLOR = {
  costed: "#ff6a5c",
  device: "#ffb24d",
  person: "#2fe6cf",
  other: "#7d8799",
};

const STATE_COLOR: Record<DeviceState, string> = { on: "#ff6a5c", standby: "#ffb24d", off: "#7d8799" };

type Source = "camera" | "file";

/** A view the full audit has answered for, keyed by what it looked like. */
interface AuditedView {
  id: number;
  sig: Float32Array;
  /** Null when the audit found nothing: kept so the same empty view is not re-sent. */
  result: AnalysisResult | null;
}

/** What one box on screen says, flattened from offenders and sightings. */
interface AiMark {
  box: Box;
  /** Only the first unit of each device type is labelled: forty chips bury the picture. */
  text: string | null;
  color: string;
  quiet?: boolean;
}

function marksFor(result: AnalysisResult): AiMark[] {
  const marks: AiMark[] = [];
  for (const o of result.offenders) {
    o.boxes?.forEach((box, i) =>
      marks.push({
        box,
        text: i === 0 ? `${o.count} ${shortLabel(o.label)} · ${o.state} · ${fmtMoney(o.costPerYear)}/yr` : null,
        color: STATE_COLOR[o.state],
      }),
    );
  }
  for (const s of result.sightings ?? []) {
    s.boxes.forEach((box, i) =>
      marks.push({ box, text: i === 0 ? `${s.count} ${shortLabel(s.label)} · off` : null, color: STATE_COLOR.off, quiet: true }),
    );
  }
  return marks;
}

type AiStatus =
  | { kind: "off" }
  | { kind: "moving" }
  | { kind: "auditing" }
  | { kind: "showing"; view: number }
  | { kind: "empty"; view: number }
  | { kind: "busy"; seconds: number }
  | { kind: "waiting"; seconds: number };

export function LiveScanner({
  settings,
  nextName,
  onAudit,
  onClose,
}: {
  settings: AuditSettings;
  /** The area name for the next audited view, e.g. "Live 03". */
  nextName: () => string;
  /** An audited view, already analysed, for the results list. */
  onAudit: (name: string, dataUrl: string, result: AnalysisResult) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const trackerRef = useRef(new Tracker());
  const tracksRef = useRef<Track[]>([]);
  const settingsRef = useRef(settings);
  const showAllRef = useRef(false);
  const autoRef = useRef(true);
  const forceRef = useRef(false);

  // Auto-audit state. All of it is read by the frame loop, so it lives in refs.
  const viewsRef = useRef<AuditedView[]>([]);
  const inFlightRef = useRef(false);
  const lastDoneRef = useRef(0);
  const cooldownRef = useRef(COOLDOWN_MIN_MS);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [mediaKind, setMediaKind] = useState<"video" | "image">("video");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [delegate, setDelegate] = useState("");
  const [modelName, setModelName] = useState("");
  const [fps, setFps] = useState(0);
  const [tally, setTally] = useState<LiveTally>({ byCategory: {}, devices: 0, people: 0, costPerYear: 0 });
  const [showAll, setShowAll] = useState(false);
  const [auto, setAuto] = useState(true);
  const [status, setStatus] = useState<AiStatus>({ kind: "moving" });
  const [active, setActive] = useState<AuditedView | null>(null);
  const [session, setSession] = useState({ views: 0, cost: 0 });

  // The frame loop reads these through refs so it never restarts on a re-render.
  useEffect(() => {
    settingsRef.current = settings;
    showAllRef.current = showAll;
    autoRef.current = auto;
  }, [settings, showAll, auto]);

  /** Bumped on every source change, so a slow camera start cannot override a file picked meanwhile. */
  const genRef = useRef(0);

  const stopMedia = useCallback(() => {
    genRef.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    trackerRef.current.reset();
  }, []);

  const startCamera = useCallback(
    async (face: "environment" | "user") => {
      stopMedia();
      const gen = genRef.current;
      let stream: MediaStream;
      try {
        // Browsers only expose the camera on https or localhost. Opening the dev
        // server from a phone at http://192.168.x.x hits exactly this.
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("", "SecurityError");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: face }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        if (gen !== genRef.current) return;
        const name = err instanceof Error ? err.name : "";
        setError(
          name === "SecurityError"
            ? "This browser only allows the camera over HTTPS. Open the deployed site, or use a video or photo file instead."
            : name === "NotAllowedError"
              ? "Camera permission was denied. Allow it in the browser's site settings, or use a video or photo file."
              : name === "NotFoundError"
                ? "No camera found on this device. Use a video or photo file instead."
                : "The camera could not start. Another app may be using it.",
        );
        setSource(null);
        return;
      }
      if (gen !== genRef.current) {
        // Closed, flipped or switched to a file while the permission prompt was up.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const v = videoRef.current!;
      v.removeAttribute("src");
      v.srcObject = stream;
      setError(null);
      setMediaKind("video");
      setSource("camera");
      await v.play().catch(() => {});
    },
    [stopMedia],
  );

  function openFile(file: File | undefined) {
    if (!file) return;
    stopMedia();
    setError(null);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    if (file.type.startsWith("video/")) {
      const v = videoRef.current!;
      v.srcObject = null;
      v.src = url;
      v.loop = true;
      v.muted = true;
      v.play().catch(() => {});
      setMediaKind("video");
    } else {
      imgRef.current!.src = url;
      setMediaKind("image");
    }
    setSource("file");
  }

  // Load the model and open the camera together, so neither waits on the other.
  useEffect(() => {
    let cancelled = false;
    getDetector()
      .then(({ delegate, model }) => {
        if (cancelled) return;
        setDelegate(delegate);
        setModelName(model);
        setPhase("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setPhase("error");
        setError("The on-device model could not load. Check the connection and try again - the photo audit still works.");
      });
    startCamera("environment");
    return () => {
      cancelled = true;
      stopMedia();
      abortRef.current?.abort();
    };
  }, [startCamera, stopMedia]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under a fullscreen camera.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  /** The current frame as an upload-sized JPEG, the same as a photo would be. */
  const grabFrame = useCallback((): string | null => {
    const el = mediaKind === "video" ? videoRef.current : imgRef.current;
    if (!el) return null;
    const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    if (!sw || !sh) return null;
    const scale = Math.min(1, 768 / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * scale);
    c.height = Math.round(sh * scale);
    c.getContext("2d")?.drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.72);
  }, [mediaKind]);

  /** Send the current view through the full audit. */
  const runAudit = useCallback(
    async (sig: Float32Array) => {
      const dataUrl = grabFrame();
      if (!dataUrl) return;
      inFlightRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      const name = nextName();
      let ok = false;
      try {
        const square = await analysisSquare(dataUrl);
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: square.dataUrl,
            frame: square.frame,
            roomType: "unknown",
            source: name,
            settings: settingsRef.current,
          }),
          signal: controller.signal,
        });
        if (res.ok) {
          const result = (await res.json()) as AnalysisResult;
          if (result.mode === "live" || result.fallbackReason === "nothing-found") {
            ok = true;
            const found = result.mode === "live" ? result : null;
            viewsRef.current = [...viewsRef.current, { id: viewsRef.current.length + 1, sig, result: found }];
            if (found) {
              onAudit(name, dataUrl, found);
              const cost = found.offenders.reduce((s, o) => s + o.costPerYear, 0);
              setSession((p) => ({ views: p.views + 1, cost: p.cost + cost }));
            }
          }
          // Any other fallback is a room-profile guess, not this view: never shown
          // over the camera as if it were a reading. Back off and try again.
        }
      } catch {
        if (controller.signal.aborted) return;
      } finally {
        inFlightRef.current = false;
        lastDoneRef.current = performance.now();
        cooldownRef.current = nextCooldown(cooldownRef.current, ok);
        busyRef.current = !ok;
      }
    },
    [grabFrame, nextName, onAudit],
  );

  // The frame loop. Detection and drawing run outside React; only the HUD
  // numbers go through state, a few times a second.
  useEffect(() => {
    if (phase !== "ready" || !source) return;
    let raf = 0;
    let lastTs = 0;
    let lastHud = 0;
    let lastSample = 0;
    let fpsEma = 0;
    let lastFrame = performance.now();
    let prevSig: Float32Array | null = null;
    let steadySince = 0;
    let match: AuditedView | null = null;
    let detector: ObjectDetector | null = null;
    getDetector().then((d) => (detector = d.detector));

    const sigCanvas = document.createElement("canvas");
    sigCanvas.width = SIG_W;
    sigCanvas.height = SIG_H;
    const sigCtx = sigCanvas.getContext("2d", { willReadFrequently: true });

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = mediaKind === "video" ? videoRef.current : imgRef.current;
      const canvas = canvasRef.current;
      if (!el || !canvas || !detector) return;
      const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
      const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
      if (!sw || !sh) return;

      const now = performance.now();
      // MediaPipe requires strictly increasing timestamps in VIDEO mode.
      const ts = Math.max(now, lastTs + 1);
      lastTs = ts;
      try {
        const res = detector.detectForVideo(el, ts);
        const dets = res.detections
          .map((d) => ({
            cls: d.categories[0]?.categoryName ?? "",
            score: d.categories[0]?.score ?? 0,
            box: {
              x: d.boundingBox?.originX ?? 0,
              y: d.boundingBox?.originY ?? 0,
              w: d.boundingBox?.width ?? 0,
              h: d.boundingBox?.height ?? 0,
            },
          }))
          .filter((d) => COCO_MAP[d.cls]);
        tracksRef.current = trackerRef.current.update(dets);
      } catch {
        return;
      }

      // Ten times a second: is the camera still, which audited view is this,
      // and is it time to audit a new one?
      if (sigCtx && now - lastSample > 100) {
        lastSample = now;
        sigCtx.drawImage(el, 0, 0, SIG_W, SIG_H);
        const sig = frameSignature(sigCtx.getImageData(0, 0, SIG_W, SIG_H).data);
        const still = prevSig ? sigDiff(prevSig, sig) < STILL_DIFF : false;
        prevSig = sig;
        steadySince = still ? steadySince || now : 0;
        match = nearestView(sig, viewsRef.current)?.view ?? null;
        const steadyMs = steadySince ? now - steadySince : 0;
        const force = forceRef.current && !inFlightRef.current;
        if (
          force ||
          shouldAutoAudit({
            enabled: autoRef.current,
            inFlight: inFlightRef.current,
            steadyMs,
            alreadyAudited: !!match,
            sinceLastMs: now - lastDoneRef.current,
            cooldownMs: cooldownRef.current,
          })
        ) {
          forceRef.current = false;
          runAudit(sig);
        }
      }

      draw(canvas, sw, sh, {
        tracks: tracksRef.current,
        marks: match?.result ? marksFor(match.result) : null,
        auditing: inFlightRef.current,
        now,
        showAll: showAllRef.current,
      });

      const dt = now - lastFrame;
      lastFrame = now;
      fpsEma = fpsEma ? fpsEma * 0.9 + (1000 / Math.max(dt, 1)) * 0.1 : 1000 / Math.max(dt, 1);
      if (now - lastHud > 250) {
        lastHud = now;
        setFps(Math.round(fpsEma));
        setTally(tallyView(tracksRef.current, settingsRef.current));
        setActive(match);
        const wait = Math.max(0, cooldownRef.current - (now - lastDoneRef.current));
        setStatus(
          inFlightRef.current
            ? { kind: "auditing" }
            : match
              ? match.result
                ? { kind: "showing", view: match.id }
                : { kind: "empty", view: match.id }
              : !autoRef.current
                ? { kind: "off" }
                : busyRef.current && wait > 0
                  ? { kind: "busy", seconds: Math.ceil(wait / 1000) }
                  : wait > 0 && steadySince && now - steadySince >= STEADY_MS
                    ? { kind: "waiting", seconds: Math.ceil(wait / 1000) }
                    : { kind: "moving" },
        );
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, source, mediaKind, runAudit]);

  const activeResult = active?.result ?? null;
  const viewCost = activeResult ? activeResult.offenders.reduce((s, o) => s + o.costPerYear, 0) : 0;
  const inView = activeResult
    ? activeResult.offenders.map((o) => `${o.count} ${shortLabel(o.label)} ${o.state}`).join(" · ") ||
      "everything here is switched off"
    : Object.entries(tally.byCategory)
        .map(([id, n]) => `${n} ${LIVE_LABEL[id] ?? id}${n > 1 ? "s" : ""}`)
        .join(" · ");

  const statusText: Record<AiStatus["kind"], string> = {
    off: "auto-audit off · tap the shutter to audit this view",
    moving: "hold the camera still on a view to audit it",
    auditing: "AI auditing this view…",
    showing: `AI audit · view ${status.kind === "showing" ? status.view : ""} · move on to the next view`,
    empty: `view ${status.kind === "empty" ? status.view : ""} audited · no powered devices found`,
    busy: `AI busy · trying again in ${status.kind === "busy" ? status.seconds : 0}s`,
    waiting: `next audit in ${status.kind === "waiting" ? status.seconds : 0}s`,
  };

  // Portalled to <body>: the scanner section is its own stacking context, so
  // from inside it no z-index can rise above the fixed site header.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-fog" role="dialog" aria-modal="true" aria-label="Live scan">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-contain ${mediaKind === "video" ? "" : "hidden"} ${
            source === "camera" && facing === "user" ? "-scale-x-100" : ""
          }`}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt=""
          className={`absolute inset-0 h-full w-full object-contain ${mediaKind === "image" ? "" : "hidden"}`}
        />
        <canvas
          ref={canvasRef}
          className={`pointer-events-none absolute inset-0 h-full w-full ${
            source === "camera" && facing === "user" ? "-scale-x-100" : ""
          }`}
        />

        {/* top HUD */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-8 pt-4">
          <div className="bg-black/60 px-2 py-1 font-mono text-[0.68rem] leading-relaxed">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${source && phase === "ready" ? "bg-ember pulse-dot" : "bg-dim"}`} />
              <span className="font-bold uppercase text-fog">live audit</span>
            </div>
            <div className="text-dim">
              <span className="text-cyan">tracking</span> {modelName || "loading model"}
              {delegate && ` · ${delegate}`}
              {phase === "ready" && source && ` · ${fps} fps`} · on-device
            </div>
            <div className="text-dim">
              <span className="text-cyan">auditing</span> one still frame per view, sent to the AI
            </div>
          </div>
          <button
            onClick={onClose}
            className="border border-line2 bg-black/50 px-3 py-1.5 text-[0.78rem] text-mist hover:border-fog/40 hover:text-fog rounded-full"
          >
            Close
          </button>
        </div>

        {(phase === "loading" || error) && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="max-w-sm border border-line2 bg-black/80 p-5 text-center">
              {error ? (
                <>
                  <p className="text-sm leading-relaxed text-mist">{error}</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={() => startCamera(facing)}
                      className="border border-line2 px-3 py-1.5 text-[0.78rem] hover:border-fog/40 hover:text-fog rounded-full"
                    >
                      try camera
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="border border-cyan px-3 py-1.5 text-[0.78rem] text-cyan"
                    >
                      use a file
                    </button>
                  </div>
                </>
              ) : (
                <p className="font-mono text-[0.72rem] text-mist">loading the on-device model…</p>
              )}
            </div>
          </div>
        )}

        {source && !error && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <div
              role="status"
              className={`border bg-black/75 px-3 py-1.5 font-mono text-[0.68rem] ${
                status.kind === "auditing"
                  ? "border-cyan text-cyan"
                  : status.kind === "busy"
                    ? "border-amber/60 text-amber"
                    : "border-line2 text-mist"
              }`}
            >
              {statusText[status.kind]}
            </div>
          </div>
        )}
      </div>

      {/* bottom panel */}
      <div className="border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="mono-label">{activeResult ? `view ${active!.id} · AI audit` : "in view · on-device"}</div>
            <div className="truncate font-mono text-sm text-fog">
              {inView ||
                (tally.devices ? `${tally.devices} powered item${tally.devices > 1 ? "s" : ""}` : "point at screens, lights, laptops…")}
            </div>
            {tally.people > 0 && (
              <div className="font-mono text-[0.66rem] text-cyan">
                person in frame - this room is in use, so its load is not phantom yet
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold text-ember">
              {fmtMoney(activeResult ? viewCost : tally.costPerYear)}
              <span className="text-sm text-dim">/yr</span>
            </div>
            <div
              className="mono-label"
              title={
                activeResult
                  ? "From the full audit of this view: judged on or standby, costed for every empty hour."
                  : "A rough figure from the on-device tracker, which cannot see standby lights and prices everything in view as on."
              }
            >
              {activeResult ? "this view" : "rough · before the audit"}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-3xl items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <SmallButton onClick={() => setAuto((v) => !v)} active={auto}>
              auto
            </SmallButton>
            <SmallButton onClick={() => fileRef.current?.click()}>file</SmallButton>
            <SmallButton
              onClick={() => {
                const next = facing === "environment" ? "user" : "environment";
                setFacing(next);
                startCamera(next);
              }}
            >
              flip
            </SmallButton>
            <SmallButton onClick={() => setShowAll((v) => !v)} active={showAll}>
              all
            </SmallButton>
          </div>

          <button
            onClick={() => (forceRef.current = true)}
            disabled={!source || status.kind === "auditing"}
            aria-label="Audit this view now"
            title="Audit this view now"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-fog transition-transform active:scale-90 disabled:opacity-40"
          >
            <span className={`h-10 w-10 rounded-full ${status.kind === "auditing" ? "bg-cyan pulse-dot" : "bg-fog"}`} />
          </button>

          <button
            onClick={onClose}
            className="min-w-[7.5rem] px-3 py-2 text-right text-[0.7rem] rounded-full bg-fog text-ink font-medium hover:bg-fog/85"
          >
            {session.views ? (
              <>
                done · {session.views} view{session.views > 1 ? "s" : ""}
                <span className="block text-[0.62rem] font-normal normal-case text-mist">
                  {fmtMoney(session.cost)}/yr found
                </span>
              </>
            ) : (
              "done"
            )}
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          openFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>,
    document.body,
  );
}

function SmallButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`border px-2.5 py-1.5 text-[0.75rem] transition-colors ${
        active ? "border-cyan text-cyan" : "border-line2 text-mist hover:text-fog"
      }`}
    >
      {children}
    </button>
  );
}

function bracket(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, L: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y);
  ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
  ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h);
  ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
  ctx.stroke();
}

function chip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bounds: { x: number; y: number; w: number },
  color: string,
) {
  const tw = ctx.measureText(text).width + 10;
  const th = 17;
  const ty = y - th - 2 < bounds.y ? y + 2 : y - th - 2;
  // Keep the chip on the picture: a box at the right edge would push it off.
  x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.w - tw));
  ctx.fillStyle = color;
  ctx.fillRect(x, ty, tw, th);
  ctx.fillStyle = "#05070a";
  ctx.fillText(text, x + 5, ty + th / 2 + 0.5);
}

/**
 * Draw one overlay frame.
 *
 * Once a view has an audit, its boxes replace the tracker's device boxes: the
 * audit has judged on and standby and seen lights the tracker cannot, so showing
 * both would put two answers on one screen. People stay, since they are why a
 * room might not count.
 */
function draw(
  canvas: HTMLCanvasElement,
  sw: number,
  sh: number,
  o: { tracks: Track[]; marks: AiMark[] | null; auditing: boolean; now: number; showAll: boolean },
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const r = containRect(sw, sh, cw, ch);

  // Sweep line: faster and brighter while the AI is looking at this view.
  const period = o.auditing ? 900 : 2200;
  const alpha = o.auditing ? 0.32 : 0.16;
  const sweepY = r.y + ((o.now / period) % 1) * r.h;
  const g = ctx.createLinearGradient(0, sweepY - 48, 0, sweepY);
  g.addColorStop(0, "rgba(47,230,207,0)");
  g.addColorStop(1, `rgba(47,230,207,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, sweepY - 48, r.w, 48);
  ctx.fillStyle = "rgba(47,230,207,0.6)";
  ctx.fillRect(r.x, sweepY, r.w, 1);

  if (o.auditing) {
    ctx.strokeStyle = "#2fe6cf";
    ctx.lineWidth = 3;
    bracket(ctx, r.x + 12, r.y + 12, r.w - 24, r.h - 24, 28);
  }

  ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "middle";

  for (const t of o.tracks) {
    const c = COCO_MAP[t.cls];
    if (!c) continue;
    if (c.kind === "other" && !o.showAll) continue;
    if (o.marks && c.kind !== "person") continue;
    const color =
      c.kind === "person" ? COLOR.person : c.kind === "other" ? COLOR.other : c.categoryId ? COLOR.costed : COLOR.device;

    const x = r.x + t.box.x * r.scale;
    const y = r.y + t.box.y * r.scale;
    const w = t.box.w * r.scale;
    const h = t.box.h * r.scale;
    // Fade a track out while it is being held after losing its detection.
    ctx.globalAlpha = t.missed ? Math.max(0.25, 1 - t.missed / 8) : 1;
    ctx.fillStyle = color + "14";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color + "55";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    bracket(ctx, x, y, w, h, Math.min(14, w * 0.3, h * 0.3));
    chip(ctx, `${c.label} ${Math.round(t.score * 100)}%`, x, y, r, color);
  }
  ctx.globalAlpha = 1;

  // Boxes first, then every label on top, so no box line crosses a label.
  const marks = (o.marks ?? []).map((m) => {
    const [x1, y1, x2, y2] = m.box;
    return { m, x: r.x + x1 * r.w, y: r.y + y1 * r.h, w: (x2 - x1) * r.w, h: (y2 - y1) * r.h };
  });
  for (const { m, x, y, w, h } of marks) {
    ctx.globalAlpha = m.quiet ? 0.6 : 1;
    ctx.fillStyle = m.color + (m.quiet ? "10" : "22");
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.lineWidth = m.quiet ? 1.5 : 3;
    bracket(ctx, x, y, w, h, Math.min(16, w * 0.3, h * 0.3));
  }
  ctx.globalAlpha = 1;
  for (const { m, x, y } of marks) if (m.text) chip(ctx, m.text, x, y, r, m.color);
}
