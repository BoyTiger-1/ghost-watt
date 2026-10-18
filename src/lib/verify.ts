// A second opinion on what the detector says it sees.
//
// The object detector (EfficientDet on COCO) knows 80 classes and has to pick one
// of them for anything box-shaped: a tall white door becomes a "refrigerator", a
// bright ceiling panel a "tv", a wardrobe an "oven". And it has no class for a
// lamp at all. So a second, on-device model - an ImageNet classifier, which knows
// a thousand things including doors, wardrobes, lampshades and spotlights - looks
// at each detection's crop and at the middle of the frame, and its answers decide
// what is drawn:
//
//   - appliances the detector is prone to invent (fridge, oven, microwave...) are
//     shown only once the classifier agrees;
//   - screens and laptops are shown unless the classifier keeps disagreeing;
//   - anything the classifier calls a lamp is treated as a light, if it is lit;
//   - a lamp in the middle of the frame is found even when the pixel-based light
//     finder (lib/scene.ts) cannot see it as one - a lit shade, a ring fixture.
//
// Everything here is plain logic so it can be tested without a camera or a model.

import type { LightBlob } from "./scene";
import type { Box } from "./types";

/** One classifier answer: an ImageNet label and its probability. */
export interface Guess {
  label: string;
  score: number;
}

/** ImageNet labels that confirm each COCO class. */
export const CONFIRMS: Record<string, readonly string[]> = {
  refrigerator: ["refrigerator", "vending machine"],
  oven: ["stove", "microwave", "Dutch oven", "waffle iron"],
  microwave: ["microwave", "stove", "toaster"],
  toaster: ["toaster", "waffle iron", "microwave"],
  "hair drier": ["hand blower"],
  tv: ["television", "monitor", "screen", "desktop computer", "home theater", "entertainment center", "web site", "laptop", "notebook", "projector"],
  laptop: ["laptop", "notebook", "computer keyboard", "space bar", "desktop computer", "monitor", "screen", "web site", "typewriter keyboard"],
  "cell phone": ["cellular telephone", "iPod", "dial telephone", "remote control", "hand-held computer"],
};

/** ImageNet's light fixtures. It has no "ceiling light"; a downlight or troffer reads as a spotlight. */
export const LAMP_LABELS: readonly string[] = ["table lamp", "lampshade", "spotlight", "torch", "candle"];

/**
 * Classes the detector is quick to invent from furniture and doors. Drawn only
 * once the classifier agrees - or, without a classifier, at a high score.
 */
export const NEEDS_CONFIRM = new Set(["refrigerator", "oven", "microwave", "toaster", "hair drier"]);

/** Without a classifier, an unconfirmable appliance needs at least this detector score. */
export const UNVERIFIED_MIN_SCORE = 0.72;

/**
 * Minimum detector score per class. The detector runs at 0.3 so tracks can start
 * early, but a box at 0.3 is a guess; the appliances it confuses with doors and
 * cupboards need more. Vehicles stay low: they are never drawn, only used to stop
 * glare on them being read as lamps.
 */
export const MIN_SCORE: Record<string, number> = {
  tv: 0.45,
  laptop: 0.45,
  refrigerator: 0.55,
  oven: 0.55,
  microwave: 0.5,
  toaster: 0.55,
  "hair drier": 0.55,
  "cell phone": 0.45,
  clock: 0.45,
  keyboard: 0.45,
  mouse: 0.45,
  remote: 0.5,
  person: 0.45,
  car: 0.3,
  truck: 0.3,
  bus: 0.3,
  motorcycle: 0.3,
  train: 0.3,
  boat: 0.3,
};

export function passesScore(cls: string, score: number): boolean {
  return score >= (MIN_SCORE[cls] ?? 0.4);
}

/** Total probability the classifier puts on a lamp of some kind. */
export function lampScore(guesses: readonly Guess[]): number {
  return guesses.filter((g) => LAMP_LABELS.includes(g.label)).reduce((s, g) => s + g.score, 0);
}

export type Verdict = "confirm" | "reject" | "lamp" | "unsure";

/** What one classifier answer on a detection's crop says about the detection. */
export function judge(cls: string, guesses: readonly Guess[]): Verdict {
  const labels = CONFIRMS[cls];
  if (!labels || !guesses.length) return "unsure";
  const top = guesses[0].score;
  const confirm = Math.max(0, ...guesses.filter((g) => labels.includes(g.label)).map((g) => g.score));
  const lamp = lampScore(guesses);
  if (lamp >= 0.25 && lamp > confirm) return "lamp";
  // The appliances that doors and cupboards pass for need a real vote; a screen
  // only needs to be in the running.
  const need = NEEDS_CONFIRM.has(cls) ? Math.max(0.15, top * 0.5) : 0.06;
  if (confirm >= need) return "confirm";
  if (top >= 0.2) return "reject";
  return "unsure";
}

interface Votes {
  confirm: number;
  reject: number;
  lamp: number;
  /** When it was last classified, ms. */
  last: number;
}

export type TrackStatus = "show" | "hide" | "lamp";

/**
 * Classifier votes per tracked detection, and what they add up to.
 *
 * Votes accumulate over a track's life, so one odd crop (motion blur, half the
 * fridge out of frame) does not flip it.
 */
export class Verifier {
  private votes = new Map<number, Votes>();

  constructor(private readonly recheckMs = 900) {}

  record(id: number, verdict: Verdict, now: number) {
    const v = this.votes.get(id) ?? { confirm: 0, reject: 0, lamp: 0, last: 0 };
    if (verdict !== "unsure") v[verdict]++;
    v.last = now;
    this.votes.set(id, v);
  }

  status(id: number, cls: string, score: number, classifierReady: boolean): TrackStatus {
    if (!CONFIRMS[cls]) return "show";
    const v = this.votes.get(id);
    if (v && v.lamp >= 2 && v.lamp > v.confirm) return "lamp";
    if (NEEDS_CONFIRM.has(cls)) {
      if (!classifierReady) return score >= UNVERIFIED_MIN_SCORE ? "show" : "hide";
      return v && v.confirm >= 1 && v.confirm >= v.reject ? "show" : "hide";
    }
    // Screens: shown from the start, hidden once the classifier keeps saying otherwise.
    return v && v.reject >= 2 && v.reject > v.confirm * 2 ? "hide" : "show";
  }

  /**
   * The track most in need of a look: never-checked appliances first, then
   * never-checked screens, then whichever was checked longest ago.
   */
  due<T extends { id: number; cls: string }>(tracks: readonly T[], now: number): T | null {
    let best: T | null = null;
    let bestRank = -Infinity;
    for (const t of tracks) {
      if (!CONFIRMS[t.cls]) continue;
      const v = this.votes.get(t.id);
      const age = v ? now - v.last : Infinity;
      if (age < this.recheckMs) continue;
      // Settled tracks are checked less often.
      if (v && v.confirm + v.reject + v.lamp >= 4 && age < this.recheckMs * 3) continue;
      const rank = (v ? 0 : 1e9) + (NEEDS_CONFIRM.has(t.cls) ? 1e6 : 0) + Math.min(age, 1e5);
      if (rank > bestRank) {
        bestRank = rank;
        best = t;
      }
    }
    return best;
  }

  /** Forget tracks the tracker has dropped. */
  prune(liveIds: Iterable<number>) {
    const keep = new Set(liveIds);
    for (const id of this.votes.keys()) if (!keep.has(id)) this.votes.delete(id);
  }

  reset() {
    this.votes.clear();
  }
}

/**
 * The lit part of a region: the bounds of its near-white pixels, trimmed of
 * stray glints, or null when too little of it is lit to be a light that is on.
 * A lamp the classifier recognises but that is switched off draws nothing.
 */
export function litRegion(luma: Uint8Array, w: number, h: number, box: readonly number[], min = 228): Box | null {
  const x1 = Math.max(0, Math.floor(box[0] * w));
  const y1 = Math.max(0, Math.floor(box[1] * h));
  const x2 = Math.min(w, Math.ceil(box[2] * w));
  const y2 = Math.min(h, Math.ceil(box[3] * h));
  const xs: number[] = [];
  const ys: number[] = [];
  let total = 0;
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      total++;
      if (luma[y * w + x] >= min) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (!total || xs.length < Math.max(4, total * 0.01)) return null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
  // A little margin: the glow around the lit core is part of the fixture.
  const mx = Math.max(1, (q(xs, 0.97) - q(xs, 0.03)) * 0.1);
  const my = Math.max(1, (q(ys, 0.97) - q(ys, 0.03)) * 0.1);
  return [
    Math.max(0, (q(xs, 0.03) - mx) / w),
    Math.max(0, (q(ys, 0.03) - my) / h),
    Math.min(1, (q(xs, 0.97) + 1 + mx) / w),
    Math.min(1, (q(ys, 0.97) + 1 + my) / h),
  ];
}

/** The middle of the frame, where whatever the camera is pointed at sits. */
export const CENTER_ROI: Box = [0.18, 0.12, 0.82, 0.88];

/**
 * A lamp the camera is pointed at, from the classifier's reads of the middle of
 * the frame. Two lamp reads in a row to appear; it holds through one miss, so it
 * does not blink while the camera wobbles.
 */
export class CenterLamp {
  private streak = 0;
  private misses = 0;
  private score = 0;

  update(lamp: number) {
    if (lamp >= 0.3) {
      this.streak++;
      this.misses = 0;
      this.score = this.score ? this.score * 0.5 + lamp * 0.5 : lamp;
    } else if (++this.misses >= 2) {
      this.streak = 0;
      this.score = 0;
    }
  }

  /** The classifier's confidence it is looking at a lamp, or 0 when it is not. */
  get confidence(): number {
    return this.streak >= 2 ? this.score : 0;
  }

  reset() {
    this.streak = 0;
    this.misses = 0;
    this.score = 0;
  }
}

/**
 * The pixel finder's lights plus lamps the classifier found, each cut down to its
 * lit part. A lamp that is not lit, or that a found light already covers, is left out.
 */
export function withLamps(
  lights: readonly LightBlob[],
  /** `min`: how bright counts as lit; higher for a loose box, where a pale wall could pass. */
  lamps: readonly { box: readonly number[]; confidence: number; min?: number }[],
  px: { data: Uint8Array; w: number; h: number },
): LightBlob[] {
  const out = [...lights];
  for (const lamp of lamps) {
    const lit = litRegion(px.data, px.w, px.h, lamp.box, lamp.min);
    if (!lit) continue;
    const covered = out.some((l) => {
      const cx = (l.box[0] + l.box[2]) / 2;
      const cy = (l.box[1] + l.box[3]) / 2;
      return cx >= lit[0] && cx <= lit[2] && cy >= lit[1] && cy <= lit[3];
    });
    if (covered) continue;
    const bw = lit[2] - lit[0];
    const bh = lit[3] - lit[1];
    const long = Math.max(bw * px.w, bh * px.h) / Math.max(1, Math.min(bw * px.w, bh * px.h)) >= 2.6;
    out.push({
      box: lit,
      area: bw * bh,
      peak: 255,
      kind: long ? "panel" : "spot",
      confidence: Math.max(0.5, Math.min(0.95, lamp.confidence)),
    });
  }
  return out;
}
