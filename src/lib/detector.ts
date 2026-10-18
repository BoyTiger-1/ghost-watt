"use client";

// The on-device object detector: MediaPipe's EfficientDet-Lite, trained on COCO.
// One instance per running mode for the page's lifetime - the model is a few MB
// and takes a second to warm up, and the browser caches the file between them.

import type { ObjectDetector } from "@mediapipe/tasks-vision";
import { COCO_MAP } from "./live";
import { mergeDetections, tileGrid, type FracDetection } from "./ondevice";

// Pinned to the installed package version: the WASM runtime and the JS that
// drives it must match exactly, or the detector fails to start with an opaque
// error.
const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODELS = "https://storage.googleapis.com/mediapipe-models/object_detector";
// Lite2 sees at 448px and finds the far rows of a classroom that Lite0 (320px)
// misses, but it is 12 MB and only keeps up on a GPU. Without one, Lite0.
const GPU_MODEL = { name: "EfficientDet-Lite2", url: `${MODELS}/efficientdet_lite2/float16/1/efficientdet_lite2.tflite` };
const CPU_MODEL = { name: "EfficientDet-Lite0", url: `${MODELS}/efficientdet_lite0/float16/1/efficientdet_lite0.tflite` };

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
      try {
        return { detector: await make("GPU", GPU_MODEL.url), delegate: "GPU" as const, model: GPU_MODEL.name };
      } catch {
        // No WebGL2 (older phones, some locked-down school laptops): CPU still
        // manages several frames a second with the small model.
        return { detector: await make("CPU", CPU_MODEL.url), delegate: "CPU" as const, model: CPU_MODEL.name };
      }
    })().catch((err) => {
      delete cache[mode];
      throw err;
    });
  }
  return cache[mode]!;
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
    .filter((d) => COCO_MAP[d.cls]);
}

/**
 * Detect objects in a still image, as fractional boxes: the whole frame, then
 * zoomed overlapping tiles of it, merged. Five passes instead of one, which a
 * photo can afford and live video cannot - and what finds the far monitors.
 */
export async function detectStill(el: HTMLCanvasElement | HTMLImageElement): Promise<FracDetection[]> {
  const { detector } = await getDetector("IMAGE");
  const W = el instanceof HTMLImageElement ? el.naturalWidth : el.width;
  const H = el instanceof HTMLImageElement ? el.naturalHeight : el.height;
  if (!W || !H) return [];
  const lists: FracDetection[][] = [];
  const crop = document.createElement("canvas");
  const ctx = crop.getContext("2d");
  for (const [tx1, ty1, tx2, ty2] of tileGrid()) {
    const sx = tx1 * W, sy = ty1 * H, sw = (tx2 - tx1) * W, sh = (ty2 - ty1) * H;
    let src: HTMLCanvasElement | HTMLImageElement = el;
    if (tx2 - tx1 < 1 && ctx) {
      crop.width = Math.round(sw);
      crop.height = Math.round(sh);
      ctx.drawImage(el, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
      src = crop;
    }
    const cw = src === el ? W : crop.width;
    const ch = src === el ? H : crop.height;
    const res = detector.detect(src);
    lists.push(
      toPixelDetections(res.detections as Raw[])
        // A box clipped by a tile edge is a fragment; the whole frame or a neighbour has it whole.
        // Only interior tile edges cut objects; the photo's own border does not.
        .filter(
          (d) =>
            src === el ||
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
