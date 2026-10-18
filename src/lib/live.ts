// Live camera mode: the parts that are not the camera.
//
// The live view runs a small object detector in the browser (MediaPipe's
// EfficientDet-Lite, trained on COCO) on every frame. It is fast enough for
// video and never sends a frame anywhere, but it only knows COCO's 80 everyday
// classes: it can see a screen, a laptop, a fridge or a microwave, but not a
// ceiling light, a projector or a copier, and it cannot tell on from standby.
// So the live view is the quick, private first look, and a capture goes through
// the full audit (lib/vision.ts) for the complete answer.
//
// Everything here is plain logic so it can be tested without a camera.

import { scoreObservation } from "./energy";
import type { AuditSettings } from "./types";

/** What a COCO class means to this app. */
export interface LiveClass {
  /** Catalog category it is costed as, or null for "draws power, not costed". */
  categoryId: string | null;
  label: string;
  kind: "device" | "person" | "other";
}

// Only the COCO classes worth drawing. Chairs, cups and bottles are left out
// entirely: a box on every chair in a classroom buries the four that matter.
export const COCO_MAP: Record<string, LiveClass> = {
  // COCO's "tv" is any screen, and in a school that is almost always a monitor.
  tv: { categoryId: "monitor", label: "screen", kind: "device" },
  laptop: { categoryId: "laptop", label: "laptop", kind: "device" },
  microwave: { categoryId: "microwave", label: "microwave", kind: "device" },
  refrigerator: { categoryId: "fridge", label: "fridge", kind: "device" },
  oven: { categoryId: null, label: "oven", kind: "device" },
  toaster: { categoryId: null, label: "toaster", kind: "device" },
  "cell phone": { categoryId: null, label: "phone", kind: "device" },
  "hair drier": { categoryId: null, label: "hair dryer", kind: "device" },
  clock: { categoryId: null, label: "clock", kind: "device" },
  keyboard: { categoryId: null, label: "keyboard", kind: "other" },
  mouse: { categoryId: null, label: "mouse", kind: "other" },
  remote: { categoryId: null, label: "remote", kind: "other" },
  // A person in frame means the room is in use, and phantom load is about
  // empty rooms - so people are shown, as the reason a reading may not count.
  person: { categoryId: null, label: "person", kind: "person" },
  // Never drawn. Tracked so a sunlit windscreen or chrome trim inside one is not
  // mistaken for a lamp.
  car: { categoryId: null, label: "car", kind: "other" },
  truck: { categoryId: null, label: "truck", kind: "other" },
  bus: { categoryId: null, label: "bus", kind: "other" },
  motorcycle: { categoryId: null, label: "motorcycle", kind: "other" },
  train: { categoryId: null, label: "train", kind: "other" },
  boat: { categoryId: null, label: "boat", kind: "other" },
};

/** Pixel box in source-image coordinates. */
export interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  cls: string;
  score: number;
  box: PxBox;
}

export interface Track {
  id: number;
  cls: string;
  score: number;
  box: PxBox;
  /** Frames this track has been matched in. */
  hits: number;
  /** Consecutive frames it has gone unmatched. */
  missed: number;
}

function iouPx(a: PxBox, b: PxBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * A minimal IoU tracker.
 *
 * A detector run per frame is jittery: boxes wobble a few pixels, labels blink
 * out for a frame and back. Drawn raw it looks broken. Matching each detection
 * to last frame's box of the same class, easing the box toward it, and holding a
 * lost track for a few frames is what makes it read as "the camera sees this".
 * It also gives stable ids, which is what lets the view count units rather
 * than re-count the same screen every frame.
 */
export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;

  constructor(
    private readonly opts = { minIou: 0.25, smoothing: 0.55, maxMissed: 8, minHits: 2 },
  ) {}

  update(dets: Detection[]): Track[] {
    const { minIou, smoothing, maxMissed } = this.opts;
    const unmatched = new Set(dets.map((_, i) => i));

    // Greedy: best overlaps first, so two adjacent screens do not swap ids.
    const pairs: { t: Track; i: number; iou: number }[] = [];
    for (const t of this.tracks) {
      dets.forEach((d, i) => {
        if (d.cls !== t.cls) return;
        const v = iouPx(t.box, d.box);
        if (v >= minIou) pairs.push({ t, i, iou: v });
      });
    }
    pairs.sort((a, b) => b.iou - a.iou);
    const matched = new Set<Track>();
    for (const p of pairs) {
      if (matched.has(p.t) || !unmatched.has(p.i)) continue;
      const d = dets[p.i];
      const k = smoothing;
      p.t.box = {
        x: p.t.box.x + (d.box.x - p.t.box.x) * k,
        y: p.t.box.y + (d.box.y - p.t.box.y) * k,
        w: p.t.box.w + (d.box.w - p.t.box.w) * k,
        h: p.t.box.h + (d.box.h - p.t.box.h) * k,
      };
      p.t.score = p.t.score * 0.6 + d.score * 0.4;
      p.t.hits++;
      p.t.missed = 0;
      matched.add(p.t);
      unmatched.delete(p.i);
    }

    for (const t of this.tracks) if (!matched.has(t)) t.missed++;
    this.tracks = this.tracks.filter((t) => t.missed <= maxMissed);

    for (const i of unmatched) {
      const d = dets[i];
      this.tracks.push({ id: this.nextId++, cls: d.cls, score: d.score, box: { ...d.box }, hits: 1, missed: 0 });
    }
    return this.visible();
  }

  /** Tracks seen often enough to be real, rather than a one-frame flicker. */
  visible(): Track[] {
    return this.tracks.filter((t) => t.hits >= this.opts.minHits);
  }

  reset() {
    this.tracks = [];
  }
}

export interface LiveTally {
  /** Costable devices in view, per catalog category. */
  byCategory: Record<string, number>;
  devices: number;
  people: number;
  /** Annual cost if everything in view stays on through every empty hour. */
  costPerYear: number;
}

/**
 * What the current view would cost a year, if every device in it is left on.
 *
 * Deliberately the worst case: the detector cannot see standby lights, so it
 * prices everything as on. The full audit on a capture is what judges state.
 */
export function tallyView(tracks: Track[], settings: AuditSettings): LiveTally {
  const byCategory: Record<string, number> = {};
  let devices = 0;
  let people = 0;
  for (const t of tracks) {
    const c = COCO_MAP[t.cls];
    if (!c) continue;
    if (c.kind === "person") people++;
    if (c.kind !== "device") continue;
    devices++;
    if (c.categoryId) byCategory[c.categoryId] = (byCategory[c.categoryId] ?? 0) + 1;
  }
  let costPerYear = 0;
  Object.entries(byCategory).forEach(([categoryId, count], i) => {
    const o = scoreObservation({ device: categoryId, count, state: "on", categoryId }, settings, "live", i);
    if (o) costPerYear += o.costPerYear;
  });
  return { byCategory, devices, people, costPerYear };
}

/** Where a source of size (sw, sh) lands inside a box (cw, ch) with object-fit: contain. */
export function containRect(sw: number, sh: number, cw: number, ch: number) {
  const s = Math.min(cw / sw, ch / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, scale: s };
}

// ---------------------------------------------------------------------------
// Auto-audit: deciding when to send the camera view to the full AI audit.
//
// The full audit is a hosted vision model and a free tier allows a few calls a
// minute, not thirty a second. So the live view audits a view once, when the
// camera has settled on it, and keeps showing that answer for as long as the
// camera stays there. Both questions - "is the camera still?" and "have we
// audited this view already?" - are answered with a tiny greyscale thumbnail
// of each frame.

export const SIG_W = 32;
export const SIG_H = 24;

/** Mean frame-to-frame change below which the camera counts as held still. */
export const STILL_DIFF = 7;
/** Below this, two thumbnails show the same view: reuse that view's audit. */
export const SAME_VIEW_DIFF = 16;
/** How long the camera must be still before a view is worth auditing. */
export const STEADY_MS = 700;

/**
 * A SIG_W x SIG_H greyscale thumbnail from RGBA pixels, with the mean removed.
 *
 * Removing the mean means a phone's auto-exposure brightening the whole frame
 * does not read as "the camera moved to a new view".
 */
export function frameSignature(rgba: ArrayLike<number>): Float32Array {
  const n = SIG_W * SIG_H;
  const sig = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const g = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    sig[i] = g;
    sum += g;
  }
  const mean = sum / n;
  for (let i = 0; i < n; i++) sig[i] -= mean;
  return sig;
}

/** Mean absolute difference between two signatures, 0..255. */
export function sigDiff(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

/** The audited view closest to this signature, if it is close enough to be the same view. */
export function nearestView<T extends { sig: Float32Array }>(
  sig: Float32Array,
  views: readonly T[],
): { view: T; diff: number } | null {
  let best: { view: T; diff: number } | null = null;
  for (const view of views) {
    const diff = sigDiff(sig, view.sig);
    if (!best || diff < best.diff) best = { view, diff };
  }
  return best && best.diff < SAME_VIEW_DIFF ? best : null;
}

export interface AuditGate {
  /** The auto-audit switch. */
  enabled: boolean;
  /** A request is already out. */
  inFlight: boolean;
  /** How long the camera has been still, ms. */
  steadyMs: number;
  /** This view already has an audit. */
  alreadyAudited: boolean;
  /** Time since the last request finished, ms. */
  sinceLastMs: number;
  /** Current back-off, ms. Grows when the AI is busy, resets when it answers. */
  cooldownMs: number;
}

export function shouldAutoAudit(g: AuditGate): boolean {
  return (
    g.enabled &&
    !g.inFlight &&
    !g.alreadyAudited &&
    g.steadyMs >= STEADY_MS &&
    g.sinceLastMs >= g.cooldownMs
  );
}

export const COOLDOWN_MIN_MS = 2500;
export const COOLDOWN_MAX_MS = 30000;

/** Back off on a busy or failed answer; return to the floor on a good one. */
export function nextCooldown(current: number, ok: boolean): number {
  return ok ? COOLDOWN_MIN_MS : Math.min(COOLDOWN_MAX_MS, Math.max(COOLDOWN_MIN_MS, current) * 2);
}
