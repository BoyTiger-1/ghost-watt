// What the live view is allowed to suggest.
//
// The small on-device detector is a candidate finder, not a verdict. It is kept
// to the classes it is good at, every box is read against the pixels inside it
// so a sunlit window is not a screen, and overlapping suggestions for one object
// collapse to one. Anything that passes is still only a candidate until the
// strong path (the photo pipeline) confirms it.
//
// Pure functions, so every rule here has a test.

import { iou } from "./boxes";
import type { Stats } from "./scene";
import type { Box } from "./types";

/**
 * Classes the detector finds reliably enough to draw live. Screens and laptops
 * are what it is actually good at; the three appliances are kept only because
 * the classifier double-checks them (lib/verify.ts). Everything else COCO knows
 * - keyboards, remotes, clocks, phones - is left to the photo pipeline.
 */
export const LIVE_CLASSES = new Set(["tv", "laptop", "microwave", "refrigerator"]);

/** Per-class detector score needed to become a candidate. Screens are stricter than appliances. */
export const CANDIDATE_MIN_SCORE: Record<string, number> = {
  tv: 0.4,
  laptop: 0.4,
  microwave: 0.45,
  refrigerator: 0.5,
};
export const CANDIDATE_DEFAULT_SCORE = 0.35;

export function isLiveClass(cls: string, score: number): boolean {
  return LIVE_CLASSES.has(cls) && score >= (CANDIDATE_MIN_SCORE[cls] ?? CANDIDATE_DEFAULT_SCORE);
}

/** Fractional area of a box. */
export function boxArea(b: Box): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

/**
 * A box that fills most of the frame is a wall, a door or a window, not a
 * device - unless the camera is held right up to a screen, which is why screens
 * get a little more room than appliances.
 */
export function tooBig(cls: string, box: Box): boolean {
  const a = boxArea(box);
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  if (a > (cls === "tv" || cls === "laptop" ? 0.85 : 0.6)) return true;
  // A strip spanning the whole frame edge to edge is a ceiling, a counter or a wall.
  return (w > 0.96 && h < 0.3) || (h > 0.96 && w < 0.3);
}

/**
 * The pixels inside a "screen" box: a daylight window is bright and flat, a
 * lit screen is bright and textured or coloured, a sleeping screen is dark.
 * Flat and bright means window (or a white wall through a frame), so the box
 * is not a device.
 */
export function looksLikeWindow(inner: Stats, saturation?: number): boolean {
  if (inner.mean < 185) return false;
  if (saturation !== undefined && saturation > 0.22) return false;
  return inner.std < 18;
}

/** Share of the smaller box covered by the larger. */
export function containment(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const small = Math.min(boxArea(a), boxArea(b));
  return small > 0 ? (ix * iy) / small : 0;
}

export interface Candidate {
  cls: string;
  score: number;
  box: Box;
  id?: number;
}

/**
 * One suggestion per object. Two boxes that overlap heavily, or one that sits
 * inside another, are the same thing seen twice (the detector calling a monitor
 * both "tv" and "laptop" is the usual case); the surer one stays.
 */
export function dedupeCandidates<T extends Candidate>(cands: readonly T[], iouThr = 0.45, containThr = 0.75): T[] {
  const sorted = cands.slice().sort((a, b) => b.score - a.score);
  const kept: T[] = [];
  for (const c of sorted) {
    if (kept.some((k) => iou(k.box, c.box) > iouThr || containment(k.box, c.box) > containThr)) continue;
    kept.push(c);
  }
  return kept;
}
