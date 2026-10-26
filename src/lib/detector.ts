"use client";

// The on-device object detector: MediaPipe's EfficientDet-Lite, trained on COCO.
// One instance per running mode for the page's lifetime - the model is a few MB
// and takes a second to warm up, and the browser caches the file between them.

import type { ImageClassifier, ObjectDetector } from "@mediapipe/tasks-vision";
import { COCO_MAP } from "./live";
import { mergeDetections, tileGrid, type FracDetection } from "./ondevice";
import { CONFIRMS, NEEDS_CONFIRM, UNVERIFIED_MIN_SCORE, judge, passesScore, type Guess } from "./verify";
import type { Box } from "./types";

// Served by this app from the installed package (scripts/copy-runtimes.mjs), so
// the WASM runtime always matches the JS that drives it, works where a CDN is
// blocked, and can be cached for use with no signal.
const WASM_ROOT = "/runtimes/mediapipe";
const MODELS = "https://storage.googleapis.com/mediapipe-models/object_detector";
// Lite0 (320 px, 7 MB) on either delegate. Lite2 (448 px, 12 MB) and YOLOv8n
// (ONNX Runtime Web, 13 MB) were measured against it on 40 labelled Open Images
// photos of screens, laptops and appliances (README, "Choosing the live detector"):
// neither found more at the same precision, and both were ~3x slower on CPU.
// A detector fine-tuned on lights and the other devices that matter here
// (scripts/train-detector.py) can replace it without a code change: set
// NEXT_PUBLIC_DETECTOR_MODEL_URL to the .tflite file, e.g. one in /public.
const CUSTOM = process.env.NEXT_PUBLIC_DETECTOR_MODEL_URL?.trim();
const MODEL = CUSTOM
  ? { name: "Ghost Watt detector", url: CUSTOM }
  : { name: "EfficientDet-Lite0", url: `${MODELS}/efficientdet_lite0/float16/1/efficientdet_lite0.tflite` };

export interface LoadedDetector {
  detector: ObjectDetector;
  delegate: "GPU" | "CPU";
  model: string;
}

const cache: Partial<Record<"VIDEO" | "IMAGE", Promise<LoadedDetector>>> = {};

export function getDetector(mode: "VIDEO" | "IMAGE"): Promise<LoadedDetector> {
  if (!cache[mode]) {
    cache[mode] = (async () => {
      const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      const make = (delegate: "GPU" | "CPU", url: string) =>
        ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: url, delegate },
          runningMode: mode,
          scoreThreshold: 0.3,
          maxResults: 40,
        });
      // A forced delegate, for measuring one against the other on a given device
      // (Settings → Display shows the active one; the bench page sets this).
      let forced: "GPU" | "CPU" | null = null;
      try {
        const v = localStorage.getItem("gw-delegate");
        forced = v === "CPU" || v === "GPU" ? v : null;
      } catch {
        // Storage blocked: pick as usual.
      }
      if (forced === "CPU") return { detector: await make("CPU", MODEL.url), delegate: "CPU" as const, model: MODEL.name };
      try {
        const gpu = await make("GPU", MODEL.url);
        // Some machines expose WebGL only through a software renderer, where the
        // GPU delegate is many times slower than plain CPU (measured here: 0.9 s
        // against 0.12 s a pass). One warm-up pass tells; a slow one switches to
        // CPU and remembers the choice for next time.
        if (mode === "IMAGE" && (await warmupMs(gpu)) > 600) {
          gpu.close();
          try {
            localStorage.setItem("gw-delegate", "CPU");
          } catch {
            // Not remembered; still switched for this session.
          }
          return { detector: await make("CPU", MODEL.url), delegate: "CPU" as const, model: MODEL.name };
        }
        return { detector: gpu, delegate: "GPU" as const, model: MODEL.name };
      } catch {
        // No WebGL2 (older phones, some locked-down school laptops): CPU still
        // manages several frames a second with the small model.
        return { detector: await make("CPU", MODEL.url), delegate: "CPU" as const, model: MODEL.name };
      }
    })().catch((err) => {
      delete cache[mode];
      throw err;
    });
  }
  return cache[mode]!;
}

/** Time one detector pass on a small blank canvas, after a first pass that pays the one-off setup. */
async function warmupMs(det: ObjectDetector): Promise<number> {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 320;
  c.getContext("2d")?.fillRect(0, 0, 320, 320);
  det.detect(c);
  const t0 = performance.now();
  det.detect(c);
  return performance.now() - t0;
}

type Raw = { categories: { categoryName?: string; score?: number }[]; boundingBox?: { originX: number; originY: number; width: number; height: number } };

/** MediaPipe detections, in source pixels, as the classes this app draws. */
export function toPixelDetections(raw: Raw[]) {
  return raw
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
    .filter((d) => COCO_MAP[d.cls] && passesScore(d.cls, d.score));
}

// ---- the second opinion ------------------------------------------------------
//
// An ImageNet classifier (EfficientNet-Lite0, int8: 5 MB, a few ms a crop on a
// phone CPU) that checks the detector's boxes and recognises lamps. See lib/verify.ts.

const CLASSIFIER_URL =
  "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite";

let classifierCache: Promise<ImageClassifier> | null = null;

export function getClassifier(): Promise<ImageClassifier> {
  if (!classifierCache) {
    classifierCache = (async () => {
      const { FilesetResolver, ImageClassifier } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      // CPU: an int8 model gains nothing on the GPU, and the detector already has it.
      return ImageClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: CLASSIFIER_URL, delegate: "CPU" },
        runningMode: "IMAGE",
        maxResults: 5,
      });
    })().catch((err) => {
      classifierCache = null;
      throw err;
    });
  }
  return classifierCache;
}

/** Grow a fractional box by `pad` of its size each side, clamped to the frame. */
export function padBox(b: readonly number[], pad = 0.08): Box {
  const w = b[2] - b[0];
  const h = b[3] - b[1];
  return [
    Math.max(0, b[0] - w * pad),
    Math.max(0, b[1] - h * pad),
    Math.min(1, b[2] + w * pad),
    Math.min(1, b[3] + h * pad),
  ];
}

/** The classifier's top answers for a fractional region of an image or video frame. */
export function classifyRegion(
  classifier: ImageClassifier,
  el: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  box: readonly number[],
): Guess[] {
  const [left, top, right, bottom] = box;
  if (right - left < 0.01 || bottom - top < 0.01) return [];
  const res = classifier.classify(el, { regionOfInterest: { left, top, right, bottom } });
  return (res.classifications[0]?.categories ?? []).map((c) => ({ label: c.categoryName, score: c.score }));
}

/**
 * Still-image detections with the classifier's say: invented appliances dropped,
 * lamps the detector mislabelled handed back as lamp boxes.
 */
export async function verifyStill(
  el: HTMLCanvasElement | HTMLImageElement,
  dets: FracDetection[],
): Promise<{ dets: FracDetection[]; lamps: Box[] }> {
  const classifier = await getClassifier().catch(() => null);
  const kept: FracDetection[] = [];
  const lamps: Box[] = [];
  for (const d of dets) {
    if (!CONFIRMS[d.cls]) {
      kept.push(d);
      continue;
    }
    if (!classifier) {
      if (!NEEDS_CONFIRM.has(d.cls) || d.score >= UNVERIFIED_MIN_SCORE) kept.push(d);
      continue;
    }
    let verdict;
    try {
      verdict = judge(d.cls, classifyRegion(classifier, el, padBox(d.box)));
    } catch {
      verdict = "unsure" as const;
    }
    if (verdict === "lamp") lamps.push(d.box);
    else if (verdict === "confirm") kept.push(d);
    // A screen survives one doubtful read; a confident detection survives a disagreeing one.
    else if (!NEEDS_CONFIRM.has(d.cls) && (verdict === "unsure" || d.score >= 0.7)) kept.push(d);
  }
  return { dets: kept, lamps };
}

/**
 * Detect objects in a still image, as fractional boxes: the whole frame, then
 * zoomed overlapping tiles of it, merged. Five passes instead of one, which a
 * photo can afford and live video cannot - and what finds the far monitors.
 */
/**
 * The detector's own input is 320 px, so feeding it a 4000 px photo only pays
 * for the resize. Each pass gets a canvas no larger than this on its long side,
 * which is still above the model's input and keeps a tile of a phone photo
 * sharp. Measured on this build machine's CPU: 4.6 s a photo at full size, under
 * 1.5 s at this cap, with the same boxes.
 */
const PASS_MAX = 640;

export async function detectStill(el: HTMLCanvasElement | HTMLImageElement): Promise<FracDetection[]> {
  const { detector } = await getDetector("IMAGE");
  const W = el instanceof HTMLImageElement ? el.naturalWidth : el.width;
  const H = el instanceof HTMLImageElement ? el.naturalHeight : el.height;
  if (!W || !H) return [];
  const lists: FracDetection[][] = [];
  const crop = document.createElement("canvas");
  const ctx = crop.getContext("2d");
  // A small picture has nothing a zoomed tile would find that the whole frame does not.
  const tiles = Math.max(W, H) < 700 ? tileGrid().slice(0, 1) : tileGrid();
  for (const [tx1, ty1, tx2, ty2] of tiles) {
    const sx = tx1 * W, sy = ty1 * H, sw = (tx2 - tx1) * W, sh = (ty2 - ty1) * H;
    if (!ctx) break;
    const scale = Math.min(1, PASS_MAX / Math.max(sw, sh));
    crop.width = Math.max(1, Math.round(sw * scale));
    crop.height = Math.max(1, Math.round(sh * scale));
    ctx.drawImage(el, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    const src: HTMLCanvasElement = crop;
    const cw = crop.width;
    const ch = crop.height;
    const res = detector.detect(src);
    lists.push(
      toPixelDetections(res.detections as Raw[])
        // A box clipped by a tile edge is a fragment; the whole frame or a neighbour has it whole.
        // Only interior tile edges cut objects; the photo's own border does not.
        .filter(
          (d) =>
            tx2 - tx1 >= 1 ||
            ((tx1 === 0 || d.box.x > 2) &&
              (ty1 === 0 || d.box.y > 2) &&
              (tx2 >= 1 || d.box.x + d.box.w < cw - 2) &&
              (ty2 >= 1 || d.box.y + d.box.h < ch - 2)),
        )
        .map((d) => ({
          cls: d.cls,
          score: d.score,
          box: [
            tx1 + (d.box.x / cw) * (tx2 - tx1),
            ty1 + (d.box.y / ch) * (ty2 - ty1),
            tx1 + ((d.box.x + d.box.w) / cw) * (tx2 - tx1),
            ty1 + ((d.box.y + d.box.h) / ch) * (ty2 - ty1),
          ] as [number, number, number, number],
        })),
    );
  }
  return mergeDetections(lists);
}
