"use client";

// The on-device object detector: MediaPipe's EfficientDet-Lite, trained on COCO.
// One instance per running mode for the page's lifetime - the model is a few MB
// and takes a second to warm up, and the browser caches the file between them.

import type { ObjectDetector } from "@mediapipe/tasks-vision";
import { COCO_MAP } from "./live";
import type { FracDetection } from "./ondevice";

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

/** Detect objects in a still image or canvas, as fractional boxes. */
export async function detectStill(el: HTMLCanvasElement | HTMLImageElement): Promise<FracDetection[]> {
  const { detector } = await getDetector("IMAGE");
  const w = el instanceof HTMLImageElement ? el.naturalWidth : el.width;
  const h = el instanceof HTMLImageElement ? el.naturalHeight : el.height;
  if (!w || !h) return [];
  const res = detector.detect(el);
  return toPixelDetections(res.detections as Raw[]).map((d) => ({
    cls: d.cls,
    score: d.score,
    box: [d.box.x / w, d.box.y / h, (d.box.x + d.box.w) / w, (d.box.y + d.box.h) / h],
  }));
}
