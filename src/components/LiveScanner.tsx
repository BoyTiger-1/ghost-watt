"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { ObjectDetector } from "@mediapipe/tasks-vision";
import { COCO_MAP, Tracker, containRect, tallyView, type LiveTally, type Track } from "@/lib/live";
import { fmtMoney } from "@/lib/energy";
import type { AuditSettings } from "@/lib/types";

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

const COLOR = {
  costed: "#ff6a5c",
  device: "#ffb24d",
  person: "#2fe6cf",
  other: "#7d8799",
};

type Source = "camera" | "file";

export function LiveScanner({
  settings,
  onCapture,
  onClose,
}: {
  settings: AuditSettings;
  onCapture: (dataUrl: string) => void;
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
  const [captures, setCaptures] = useState(0);
  const [flash, setFlash] = useState(0);

  // The frame loop reads these through refs so it never restarts on a re-render.
  useEffect(() => {
    settingsRef.current = settings;
    showAllRef.current = showAll;
  }, [settings, showAll]);

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

  // The frame loop. Detection and drawing run outside React; only the HUD
  // numbers go through state, a few times a second.
  useEffect(() => {
    if (phase !== "ready" || !source) return;
    let raf = 0;
    let lastTs = 0;
    let lastHud = 0;
    let fpsEma = 0;
    let lastFrame = performance.now();
    let detector: ObjectDetector | null = null;
    getDetector().then((d) => (detector = d.detector));

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

      draw(canvas, sw, sh, tracksRef.current, now, showAllRef.current);

      const dt = now - lastFrame;
      lastFrame = now;
      fpsEma = fpsEma ? fpsEma * 0.9 + (1000 / Math.max(dt, 1)) * 0.1 : 1000 / Math.max(dt, 1);
      if (now - lastHud > 250) {
        lastHud = now;
        setFps(Math.round(fpsEma));
        setTally(tallyView(tracksRef.current, settingsRef.current));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, source, mediaKind]);

  function capture() {
    const el = mediaKind === "video" ? videoRef.current : imgRef.current;
    if (!el) return;
    const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    if (!sw || !sh) return;
    // Same size and quality as an uploaded photo, so a capture is audited
    // exactly like one.
    const scale = Math.min(1, 768 / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * scale);
    c.height = Math.round(sh * scale);
    c.getContext("2d")?.drawImage(el, 0, 0, c.width, c.height);
    onCapture(c.toDataURL("image/jpeg", 0.72));
    setCaptures((n) => n + 1);
    setFlash((n) => n + 1);
  }

  const inView = Object.entries(tally.byCategory)
    .map(([id, n]) => `${n} ${LIVE_LABEL[id] ?? id}${n > 1 ? "s" : ""}`)
    .join(" · ");

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
          <div className="font-mono text-[0.68rem] leading-relaxed tracking-wider">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${source && phase === "ready" ? "bg-ember pulse-dot" : "bg-dim"}`} />
              <span className="font-bold uppercase text-fog">live</span>
              <span className="text-dim">·</span>
              <span className="text-cyan">on-device</span>
            </div>
            <div className="text-dim">
              {modelName || "loading model"}
              {delegate && ` · ${delegate}`}
              {phase === "ready" && source && ` · ${fps} fps`}
            </div>
            <div className="text-dim">frames never leave this device</div>
          </div>
          <button
            onClick={onClose}
            className="border border-line2 bg-black/50 px-3 py-1.5 font-mono text-[0.7rem] tracking-wider uppercase text-mist hover:border-cyan hover:text-cyan"
          >
            close
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
                      className="border border-line2 px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-wider hover:border-cyan hover:text-cyan"
                    >
                      try camera
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="border border-cyan px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-wider text-cyan"
                    >
                      use a file
                    </button>
                  </div>
                </>
              ) : (
                <p className="font-mono text-[0.72rem] tracking-wider text-mist">loading the on-device model…</p>
              )}
            </div>
          </div>
        )}

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
      </div>

      {/* bottom panel */}
      <div className="border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="mono-label">in view</div>
            <div className="truncate font-mono text-sm text-fog">
              {inView || (tally.devices ? `${tally.devices} powered item${tally.devices > 1 ? "s" : ""}` : "point at screens, laptops, fridges…")}
            </div>
            {tally.people > 0 && (
              <div className="font-mono text-[0.66rem] tracking-wider text-cyan">
                person in frame - this room is in use, so its load is not phantom yet
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold text-ember">
              {fmtMoney(tally.costPerYear)}
              <span className="text-sm text-dim">/yr</span>
            </div>
            <div className="mono-label" title="The live detector cannot see standby lights, so it prices everything in view as on. Capture for the full audit.">
              if left on every empty hour
            </div>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-3xl items-center justify-between gap-3">
          <div className="flex gap-2">
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
              all objects
            </SmallButton>
          </div>

          <button
            onClick={capture}
            disabled={!source}
            aria-label="Capture this view for the full audit"
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-fog transition-transform active:scale-90 disabled:opacity-40"
          >
            <span className="h-12 w-12 rounded-full bg-fog" />
          </button>

          <button
            onClick={onClose}
            className="min-w-[7.5rem] border border-cyan bg-cyan/10 px-3 py-2 font-mono text-[0.7rem] font-bold uppercase tracking-wider text-cyan"
          >
            {captures ? `done · ${captures}` : "done"}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl font-mono text-[0.62rem] leading-relaxed tracking-wide text-dim">
          The live view knows screens, laptops, fridges and microwaves. Capture a view to run the full AI audit,
          which also finds lights, projectors and copiers and judges what is on or in standby.
        </p>
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
      className={`border px-2.5 py-1.5 font-mono text-[0.66rem] uppercase tracking-wider transition-colors ${
        active ? "border-cyan text-cyan" : "border-line2 text-mist hover:text-fog"
      }`}
    >
      {children}
    </button>
  );
}

/** Draw tracked boxes, CV-HUD style, onto the overlay canvas. */
function draw(
  canvas: HTMLCanvasElement,
  sw: number,
  sh: number,
  tracks: Track[],
  now: number,
  showAll: boolean,
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

  // Sweep line across the picture: the "it is looking" cue.
  const sweepY = r.y + ((now / 2200) % 1) * r.h;
  const g = ctx.createLinearGradient(0, sweepY - 40, 0, sweepY);
  g.addColorStop(0, "rgba(47,230,207,0)");
  g.addColorStop(1, "rgba(47,230,207,0.18)");
  ctx.fillStyle = g;
  ctx.fillRect(r.x, sweepY - 40, r.w, 40);
  ctx.fillStyle = "rgba(47,230,207,0.55)";
  ctx.fillRect(r.x, sweepY, r.w, 1);

  ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "middle";

  for (const t of tracks) {
    const c = COCO_MAP[t.cls];
    if (!c) continue;
    if (c.kind === "other" && !showAll) continue;
    const color =
      c.kind === "person" ? COLOR.person : c.kind === "other" ? COLOR.other : c.categoryId ? COLOR.costed : COLOR.device;

    const x = r.x + t.box.x * r.scale;
    const y = r.y + t.box.y * r.scale;
    const w = t.box.w * r.scale;
    const h = t.box.h * r.scale;
    // Fade a track out while it is being held after losing its detection.
    ctx.globalAlpha = t.missed ? Math.max(0.25, 1 - t.missed / 8) : 1;

    ctx.fillStyle = color + "1a";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color + "66";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    const L = Math.min(16, w * 0.3, h * 0.3);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y);
    ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
    ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h);
    ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
    ctx.stroke();

    const text = `${c.label} ${Math.round(t.score * 100)}%  #${t.id}`;
    const tw = ctx.measureText(text).width + 10;
    const th = 17;
    const ty = y - th - 2 < r.y ? y + 2 : y - th - 2;
    ctx.fillStyle = color;
    ctx.fillRect(x, ty, tw, th);
    ctx.fillStyle = "#05070a";
    ctx.fillText(text, x + 5, ty + th / 2 + 0.5);
  }
  ctx.globalAlpha = 1;
}
