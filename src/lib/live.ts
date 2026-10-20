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
import { NEEDS_CONFIRM } from "./verify";
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
  oven: { categoryId: "x_wall_oven", label: "oven", kind: "device" },
  // Emitted only by a detector fine-tuned with scripts/train-detector.py.
  lamp: { categoryId: "downlight", label: "lamp", kind: "device" },
  "light bulb": { categoryId: "downlight", label: "light", kind: "device" },
  chandelier: { categoryId: "downlight", label: "chandelier", kind: "device" },
  "ceiling light": { categoryId: "ceiling_light", label: "ceiling light", kind: "device" },
  "ceiling fan": { categoryId: "exhaust_fan", label: "ceiling fan", kind: "device" },
  printer: { categoryId: "printer", label: "printer", kind: "device" },
  projector: { categoryId: "projector", label: "projector", kind: "device" },
  toaster: { categoryId: "x_toaster", label: "toaster", kind: "device" },
  "cell phone": { categoryId: "x_smartphone", label: "phone", kind: "device" },
  "hair drier": { categoryId: "x_hair_dryer", label: "hair dryer", kind: "device" },
  clock: { categoryId: "x_clock", label: "clock", kind: "device" },
  keyboard: { categoryId: null, label: "keyboard", kind: "other" },
  mouse: { categoryId: null, label: "mouse", kind: "other" },
  remote: { categoryId: null, label: "remote", kind: "other" },
  // People are deliberately not tracked: their boxes covered the lights and
  // screens that the audit is about, and nobody needs to be followed around.
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
  /** Whether it was matched in each of the last few frames, newest last. */
  seen: boolean[];
  /** Score-weighted votes per class; `cls` is the leader. */
  votes?: Record<string, number>;
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

  /**
   * `window` / `needed`: a track is shown only once it was matched in `needed`
   * of the last `window` frames (3 of 5 by default). A detector blinking a box
   * on for one frame never reaches the screen; a real object that drops out for
   * a frame or two stays.
   */
  constructor(
    private readonly opts = { minIou: 0.25, smoothing: 0.55, maxMissed: 8, window: 5, needed: 3 },
  ) {}

  update(dets: Detection[]): Track[] {
    const { minIou, maxMissed } = this.opts;
    const unmatched = new Set(dets.map((_, i) => i));
    const matched = new Set<Track>();

    // Greedy: best overlaps first, so two adjacent screens do not swap ids.
    const pass = (sameClass: boolean, min: number) => {
      const pairs: { t: Track; i: number; iou: number }[] = [];
      for (const t of this.tracks) {
        if (matched.has(t)) continue;
        for (const i of unmatched) {
          const d = dets[i];
          if (sameClass ? d.cls !== t.cls : !relabelable(t.cls, d.cls)) continue;
          const v = iouPx(t.box, d.box);
          if (v >= min) pairs.push({ t, i, iou: v });
        }
      }
      pairs.sort((a, b) => b.iou - a.iou);
      for (const p of pairs) {
        if (matched.has(p.t) || !unmatched.has(p.i)) continue;
        this.absorb(p.t, dets[p.i]);
        matched.add(p.t);
        unmatched.delete(p.i);
      }
    };
    pass(true, minIou);
    // The detector often changes its mind about one object from frame to frame -
    // fridge, oven, tv, fridge. The same box under another label is the same
    // thing, so it keeps its id (and its classifier votes) and the label is voted.
    pass(false, Math.max(minIou, 0.5));

    for (const t of this.tracks) {
      if (!matched.has(t)) {
        t.missed++;
        t.seen.push(false);
        if (t.seen.length > this.opts.window) t.seen.shift();
      }
    }
    this.tracks = this.tracks.filter((t) => t.missed <= maxMissed);

    for (const i of unmatched) {
      const d = dets[i];
      this.tracks.push({
        id: this.nextId++,
        cls: d.cls,
        score: d.score,
        box: { ...d.box },
        hits: 1,
        missed: 0,
        seen: [true],
        votes: { [d.cls]: d.score },
      });
    }
    return this.visible();
  }

  private absorb(t: Track, d: Detection) {
    const k = this.opts.smoothing;
    t.box = {
      x: t.box.x + (d.box.x - t.box.x) * k,
      y: t.box.y + (d.box.y - t.box.y) * k,
      w: t.box.w + (d.box.w - t.box.w) * k,
      h: t.box.h + (d.box.h - t.box.h) * k,
    };
    const votes = (t.votes ??= { [t.cls]: t.score });
    for (const c in votes) votes[c] *= 0.85;
    votes[d.cls] = (votes[d.cls] ?? 0) + d.score;
    const leader = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    if (leader !== t.cls) t.cls = leader;
    t.score = d.cls === t.cls ? t.score * 0.6 + d.score * 0.4 : t.score * 0.9;
    t.hits++;
    t.missed = 0;
    t.seen.push(true);
    if (t.seen.length > this.opts.window) t.seen.shift();
  }

  /** Tracks seen in enough of the last few frames to be real, rather than a flicker. */
  visible(): Track[] {
    const { needed } = this.opts;
    return this.tracks.filter((t) => {
      const recent = t.seen.filter(Boolean).length;
      // Appliances the detector invents from doors and cupboards need the full window.
      return recent >= (NEEDS_CONFIRM.has(t.cls) ? Math.max(needed, 4) : needed);
    });
  }

  /** Ids of every track still held, shown or not. */
  ids(): number[] {
    return this.tracks.map((t) => t.id);
  }

  reset() {
    this.tracks = [];
  }
}

/** Powered things can be relabelled into one another; a person or a car is never a fridge. */
function relabelable(a: string, b: string): boolean {
  return COCO_MAP[a]?.kind === "device" && COCO_MAP[b]?.kind === "device";
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
export const STEADY_MS = 500;

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

export const COOLDOWN_MIN_MS = 1500;
export const COOLDOWN_MAX_MS = 30000;

/** Back off on a busy or failed answer; return to the floor on a good one. */
export function nextCooldown(current: number, ok: boolean): number {
  return ok ? COOLDOWN_MIN_MS : Math.min(COOLDOWN_MAX_MS, Math.max(COOLDOWN_MIN_MS, current) * 2);
}
