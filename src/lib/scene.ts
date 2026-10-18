// Reading the picture itself, on the device, without a model.
//
// The object detector is trained on COCO, which has screens and laptops but no
// ceiling lights, and which cannot tell a lit screen from a dark one. Those are
// the two questions a phantom-load audit lives on, and both are mostly about
// brightness - which plain arithmetic on the pixels answers well:
//
//   - Is this screen on? A lit panel is brighter than the wall around it and
//     has texture (text, windows, a login page). A sleeping one is a flat dark
//     rectangle, darker than its surroundings.
//   - Are the lights on? A switched-on fixture is a small, near-white blob,
//     usually in the top half of the frame. A window is a big one.
//
// Everything here takes plain arrays so it can be tested without a camera.

import type { DeviceState } from "./types";

/** Greyscale luma from RGBA pixels (BT.601). */
export function toLuma(rgba: ArrayLike<number>, w: number, h: number): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0;
  }
  return out;
}

export interface Stats {
  mean: number;
  std: number;
}

/** Mean and spread of luma inside a fractional box [x1, y1, x2, y2]. */
export function regionStats(luma: Uint8Array, w: number, h: number, box: readonly number[]): Stats {
  const x1 = Math.max(0, Math.floor(box[0] * w));
  const y1 = Math.max(0, Math.floor(box[1] * h));
  const x2 = Math.min(w, Math.ceil(box[2] * w));
  const y2 = Math.min(h, Math.ceil(box[3] * h));
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const v = luma[y * w + x];
      sum += v;
      sq += v * v;
      n++;
    }
  }
  if (!n) return { mean: 0, std: 0 };
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

/** The band around a box, `pad` box-widths out, minus the box itself. */
export function ringStats(luma: Uint8Array, w: number, h: number, box: readonly number[], pad = 0.35): Stats {
  const bw = box[2] - box[0];
  const bh = box[3] - box[1];
  const outer = [box[0] - bw * pad, box[1] - bh * pad, box[2] + bw * pad, box[3] + bh * pad].map((v) =>
    Math.min(1, Math.max(0, v)),
  );
  const o = regionStats(luma, w, h, outer);
  const i = regionStats(luma, w, h, box);
  const ao = (outer[2] - outer[0]) * (outer[3] - outer[1]);
  const ai = bw * bh;
  const ar = ao - ai;
  if (ar <= 1e-6) return o;
  // Ring mean from the two means and areas; spread is not needed for the ring.
  return { mean: (o.mean * ao - i.mean * ai) / ar, std: o.std };
}

export interface ScreenRead {
  state: DeviceState;
  /** 0-1: how clear-cut the reading is. */
  confidence: number;
  why: string;
}

/**
 * Lit, or dark? From the screen's own brightness and texture against its frame.
 *
 * Dark is read as standby rather than off: a monitor with a black screen is
 * almost always asleep and still drawing a watt or two, and a cost that is a
 * little high is a better failure than one that is quietly zero.
 */
export function classifyScreen(inner: Stats, ring: Stats): ScreenRead {
  const lift = inner.mean - ring.mean;
  if ((lift > 18 && inner.mean > 70) || (inner.mean > 150 && inner.std > 22)) {
    return { state: "on", confidence: Math.min(1, 0.55 + lift / 120 + inner.std / 200), why: "screen lit" };
  }
  if (inner.mean < 55 && inner.std < 20 && lift < 6) {
    return { state: "standby", confidence: Math.min(1, 0.5 + (60 - inner.mean) / 120), why: "screen dark" };
  }
  return { state: "on", confidence: 0.35, why: "screen unclear" };
}

export interface LightBlob {
  /** Fractional box. */
  box: [number, number, number, number];
  /** Share of the frame it covers. */
  area: number;
  peak: number;
}

/**
 * Small near-white blobs: switched-on light fixtures, as best pixels can say.
 *
 * Thresholds are relative as well as absolute, so a phone that exposes for a
 * bright room (and turns the fixtures into the only white) and one that exposes
 * for a dim one both work. Large blobs are windows or a white wall in daylight
 * and are dropped; so are blobs low in the frame, which are lamps and screens.
 */
export function findLightSources(luma: Uint8Array, w: number, h: number, maxBlobs = 12): LightBlob[] {
  const n = w * h;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += luma[i];
  const mean = sum / n;
  const threshold = Math.max(236, Math.min(250, mean + 120));

  const seen = new Uint8Array(n);
  const blobs: LightBlob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || luma[start] < threshold) continue;
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0, peak = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p / w) | 0;
      count++;
      if (luma[p] > peak) peak = luma[p];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && !seen[q] && luma[q] >= threshold) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    const area = count / n;
    const cy = (minY + maxY + 1) / 2 / h;
    // Specks are noise or reflections; big patches are windows.
    if (area < 0.0006 || area > 0.06 || cy > 0.6) continue;
    blobs.push({ box: [minX / w, minY / h, (maxX + 1) / w, (maxY + 1) / h], area, peak });
  }
  return blobs.sort((a, b) => b.area - a.area).slice(0, maxBlobs);
}

export interface SceneRead {
  /** Mean luma, 0-255. */
  brightness: number;
  lights: LightBlob[];
  /** "on" when fixtures are visibly lit. */
  lighting: "on" | "off" | "unclear";
  dark: boolean;
}

export function readScene(luma: Uint8Array, w: number, h: number): SceneRead {
  let sum = 0;
  for (let i = 0; i < luma.length; i++) sum += luma[i];
  const brightness = sum / luma.length;
  const lights = findLightSources(luma, w, h);
  const lighting = lights.length >= 1 ? "on" : brightness < 60 ? "off" : "unclear";
  return { brightness, lights, lighting, dark: brightness < 60 };
}

/** Variance of the Laplacian: high for a sharp frame, low for a blurred one. */
export function sharpness(luma: Uint8Array, w: number, h: number): number {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w];
      sum += v;
      sq += v * v;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sq / n - mean * mean;
}
