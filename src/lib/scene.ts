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
export function classifyScreen(inner: Stats, ring: Stats, saturation?: number): ScreenRead {
  const lift = inner.mean - ring.mean;
  // A desktop wallpaper or an open app is colourful; a sleeping panel is grey-black.
  if (saturation !== undefined && saturation > 0.28 && inner.mean > 55) {
    return { state: "on", confidence: Math.min(1, 0.6 + saturation / 2), why: "screen lit" };
  }
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
  /** "spot": a downlight, bulb or pendant. "panel": a tube or troffer, long and bright. */
  kind: "spot" | "panel";
  /** 0-1: how sure the pixels are that this is an emitter rather than a bright surface. */
  confidence: number;
}

export interface LightOptions {
  /** RGBA pixels of the same frame, for colour checks. Without them, colour is not judged. */
  rgba?: ArrayLike<number>;
  maxBlobs?: number;
}

interface Core {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  count: number;
  sum: number;
  peak: number;
  sat: number;
  blue: number;
  surface: number;
  contrast: number;
}

/**
 * Switched-on light fixtures, as best pixels can say - and, as importantly, what
 * is *not* one.
 *
 * A first version thresholded the whole frame on one brightness level. It missed
 * most fixtures in a bright room (the threshold rose with the room) and called
 * daylight windows and a backlit keyboard "lights". This one asks what a lit
 * fixture actually looks like:
 *
 *   - brighter than its own neighbourhood, not just bright: local contrast
 *     against a box-blurred copy of the frame, so a downlight in a bright room
 *     and a lamp in a dark one both stand out;
 *   - near-white: a fixture is white or warm white; a keyboard's RGB backlight,
 *     a status LED and a screen are saturated, and are rejected;
 *   - not part of a large bright surface: a window, the sky, a sunlit wall or a
 *     whiteboard is a big region of bright pixels with no emitter clearly
 *     brighter inside it; blue-tinted bright regions are sky;
 *   - small and above the desk line: tall bright shapes are glass and doors,
 *     anything in the bottom third is a desk, a floor reflection or a screen.
 *
 * Neighbouring cores are merged, so a perforated globe or a fixture seen through
 * ceiling slats counts once.
 */
export function findLightSources(luma: Uint8Array, w: number, h: number, opts: LightOptions = {}): LightBlob[] {
  const n = w * h;
  const rgba = opts.rgba;
  const maxBlobs = opts.maxBlobs ?? 40;

  // Integral image, for the local mean around every pixel in O(1).
  const W1 = w + 1;
  const integral = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += luma[y * w + x];
      integral[(y + 1) * W1 + x + 1] = integral[y * W1 + x + 1] + row;
    }
  }
  const r = Math.max(2, Math.round(Math.min(w, h) * 0.06));
  const localMean = (x: number, y: number) => {
    const x1 = Math.max(0, x - r);
    const y1 = Math.max(0, y - r);
    const x2 = Math.min(w, x + r + 1);
    const y2 = Math.min(h, y + r + 1);
    const s = integral[y2 * W1 + x2] - integral[y1 * W1 + x2] - integral[y2 * W1 + x1] + integral[y1 * W1 + x1];
    return s / ((x2 - x1) * (y2 - y1));
  };

  /** Sum of luma over a pixel rectangle [x1, x2) x [y1, y2), clamped to the frame. */
  const boxSum = (x1: number, y1: number, x2: number, y2: number) => {
    x1 = Math.max(0, x1);
    y1 = Math.max(0, y1);
    x2 = Math.min(w, x2);
    y2 = Math.min(h, y2);
    if (x2 <= x1 || y2 <= y1) return { sum: 0, n: 0 };
    return {
      sum: integral[y2 * W1 + x2] - integral[y1 * W1 + x2] - integral[y2 * W1 + x1] + integral[y1 * W1 + x1],
      n: (x2 - x1) * (y2 - y1),
    };
  };
  const near = Math.max(1, Math.round(w * 0.004));
  const far = Math.max(3, Math.round(w * 0.02));

  const stack: number[] = [];
  const neighbours = (p: number) => {
    const x = p % w;
    return [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
  };

  // Bright surfaces: every region at or above SURFACE, with its size and mean.
  const SURFACE = 200;
  const surfaceLabel = new Int32Array(n).fill(-1);
  const surfaceArea: number[] = [];
  const surfaceSum: number[] = [];
  /** Sum of (blue - red) over each surface: sky is bright and blue. */
  const surfaceBlue: number[] = [];
  for (let start = 0; start < n; start++) {
    if (surfaceLabel[start] !== -1 || luma[start] < SURFACE) continue;
    const label = surfaceArea.length;
    let count = 0;
    let sum = 0;
    let blue = 0;
    surfaceLabel[start] = label;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      count++;
      sum += luma[p];
      if (rgba) blue += rgba[p * 4 + 2] - rgba[p * 4];
      for (const q of neighbours(p)) {
        if (q >= 0 && q < n && surfaceLabel[q] === -1 && luma[q] >= SURFACE) {
          surfaceLabel[q] = label;
          stack.push(q);
        }
      }
    }
    surfaceArea.push(count);
    surfaceSum.push(sum);
    surfaceBlue.push(blue);
  }

  // Candidate emitter pixels: clearly brighter than their surroundings. Being blown
  // out is not enough - in a bright, HDR-processed photo every white wall is 245.
  const cand = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = luma[i];
      const lift = v - localMean(x, y);
      if ((v >= 205 && lift >= 30) || (v >= 248 && lift >= 16)) cand[i] = 1;
    }
  }

  const cores: Core[] = [];
  const seen = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (!cand[start] || seen[start]) continue;
    const c: Core = { x1: w, y1: h, x2: 0, y2: 0, count: 0, sum: 0, peak: 0, sat: 0, blue: 0, surface: surfaceLabel[start], contrast: 0 };
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p / w) | 0;
      const v = luma[p];
      c.count++;
      c.sum += v;
      if (v > c.peak) c.peak = v;
      if (x < c.x1) c.x1 = x;
      if (x > c.x2) c.x2 = x;
      if (y < c.y1) c.y1 = y;
      if (y > c.y2) c.y2 = y;
      if (rgba) {
        const R = rgba[p * 4];
        const G = rgba[p * 4 + 1];
        const B = rgba[p * 4 + 2];
        const mx = Math.max(R, G, B);
        c.sat += mx > 0 ? (mx - Math.min(R, G, B)) / mx : 0;
        c.blue += B - R;
      }
      for (const q of neighbours(p)) {
        if (q >= 0 && q < n && cand[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    cores.push(c);
  }

  const minPx = Math.max(4, n * 0.00008);
  const kept: Core[] = [];
  for (const c of cores) {
    if (c.count < minPx) continue; // specks: LEDs, glints, noise
    const bh = c.y2 - c.y1 + 1;
    const area = c.count / n;
    const cy = (c.y1 + c.y2 + 1) / 2 / h;
    if (area > 0.035 || cy > 0.6 || bh / h > 0.2) continue; // windows, doors, desks, floor reflections
    // A solid bright rectangle below ceiling height is a window pane or a glass door.
    // Ceiling panels sit high in the frame and are foreshortened into trapezoids.
    const fill = c.count / ((c.x2 - c.x1 + 1) * bh);
    if (fill > 0.82 && area > 0.004 && cy > 0.3) continue;
    const mean = c.sum / c.count;
    if (rgba) {
      if (c.sat / c.count > 0.3) continue; // coloured: RGB backlight, status LED, screen
      if (c.blue / c.count > 22) continue; // blue-white: sky
    }
    // Inside a big bright surface, a light has to outshine it.
    let contrast = mean - localMean(Math.round((c.x1 + c.x2) / 2), Math.round((c.y1 + c.y2) / 2));
    if (c.surface >= 0 && surfaceArea[c.surface] > n * 0.06) {
      const rest = surfaceArea[c.surface] - c.count;
      const restMean = rest > 0 ? (surfaceSum[c.surface] - c.sum) / rest : mean;
      contrast = Math.min(contrast, mean - restMean);
      if (contrast < 16) continue;
      // A white cloud in a blue sky outshines its surroundings too; the blue gives it away.
      if (rgba && rest > 0 && (surfaceBlue[c.surface] - c.blue) / rest > 15) continue;
    }
    // An emitter, not a bright surface. A lit fixture has a clipped core and its
    // light bleeds into the surroundings - brightness falls off smoothly. A white
    // grille, wall panel or laptop lid against dark wood is just as bright, but its
    // edge is hard: the pixels just outside it are as dark as those further out.
    const core = boxSum(c.x1, c.y1, c.x2 + 1, c.y2 + 1);
    const ring = (p: number) => {
      const o = boxSum(c.x1 - p, c.y1 - p, c.x2 + 1 + p, c.y2 + 1 + p);
      return o.n > core.n ? (o.sum - core.sum) / (o.n - core.n) : 0;
    };
    const boxMean = core.sum / core.n;
    const rFar = ring(far);
    const bleed = boxMean - rFar > 1 ? (ring(near) - rFar) / (boxMean - rFar) : 0;
    let clipped = 0;
    let sq = 0;
    for (let y = c.y1; y <= c.y2; y++) {
      for (let x = c.x1; x <= c.x2; x++) {
        const v = luma[y * w + x];
        if (v >= 250) clipped++;
        sq += v * v;
      }
    }
    const clip = clipped / core.n;
    const std = Math.sqrt(Math.max(0, sq / core.n - boxMean * boxMean));
    // A fixture fills its own box with light; a thin streak or a reflection in glass does not.
    if (boxMean < 170) continue;
    // Perfectly flat and not quite clipped: a wall panel catching the light, not a lamp.
    if (std < 6 && clip < 0.2) continue;
    // A far downlight is a few clipped pixels with no room to show a glow; anything
    // bigger that is clipped edge to edge with no bleed is a white surface.
    const farSpot = c.count / n < 0.0008 && clip >= 0.3 && boxMean >= 235;
    const glows = c.peak >= 248 && (bleed >= 0.2 || farSpot);
    if (!glows) continue;
    kept.push({ ...c, contrast });
  }

  // Merge cores that belong to one fixture: a perforated globe, a slatted ceiling.
  const gap = Math.max(1, Math.round(w * 0.012));
  const merged: Core[] = [];
  for (const c of kept.sort((a, b) => b.count - a.count)) {
    // Only into a fixture-sized whole: unbounded merging chains texture across a wall.
    const m = merged.find(
      (o) =>
        c.x1 <= o.x2 + gap &&
        c.x2 >= o.x1 - gap &&
        c.y1 <= o.y2 + gap &&
        c.y2 >= o.y1 - gap &&
        Math.max(o.x2, c.x2) - Math.min(o.x1, c.x1) < w * 0.09 &&
        Math.max(o.y2, c.y2) - Math.min(o.y1, c.y1) < h * 0.12,
    );
    if (m) {
      m.x1 = Math.min(m.x1, c.x1);
      m.y1 = Math.min(m.y1, c.y1);
      m.x2 = Math.max(m.x2, c.x2);
      m.y2 = Math.max(m.y2, c.y2);
      m.count += c.count;
      m.sum += c.sum;
      m.peak = Math.max(m.peak, c.peak);
      m.contrast = Math.max(m.contrast, c.contrast);
    } else merged.push({ ...c });
  }

  return merged
    .map((c) => {
      const bw = c.x2 - c.x1 + 1;
      const bh = c.y2 - c.y1 + 1;
      const area = c.count / n;
      const long = Math.max(bw, bh) / Math.min(bw, bh) >= 2.6 && area >= 0.0015;
      const confidence = Math.max(0.3, Math.min(0.95, 0.45 + c.contrast / 160 + (c.peak >= 250 ? 0.12 : 0)));
      const blob: LightBlob = {
        box: [c.x1 / w, c.y1 / h, (c.x2 + 1) / w, (c.y2 + 1) / h],
        area,
        peak: c.peak,
        kind: long ? "panel" : "spot",
        confidence,
      };
      return blob;
    })
    .sort((a, b) => b.confidence - a.confidence || b.area - a.area)
    .slice(0, maxBlobs);
}

/**
 * Lights that stay lit. On live video a fixture is there frame after frame; a
 * blinking LED, a glint off a moving screen or a flicker of reflection is not.
 * A light is shown once it has been seen in 3 of the last 4 reads, and dropped
 * after 3 reads without it.
 */
export class LightTracker {
  private tracks: { blob: LightBlob; history: boolean[] }[] = [];

  update(blobs: readonly LightBlob[]): LightBlob[] {
    const used = new Set<number>();
    for (const t of this.tracks) {
      let best = -1;
      let bestD = Infinity;
      const reach = Math.max(0.03, (t.blob.box[2] - t.blob.box[0] + t.blob.box[3] - t.blob.box[1]) * 0.6);
      blobs.forEach((b, i) => {
        if (used.has(i)) return;
        const d = centreDistance(t.blob.box, b.box);
        if (d < reach && d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) {
        used.add(best);
        const b = blobs[best];
        // Ease the box, so a steady light does not jitter.
        const box = t.blob.box.map((v, k) => v + (b.box[k] - v) * 0.5) as LightBlob["box"];
        t.blob = { ...b, box };
        t.history.push(true);
      } else t.history.push(false);
      if (t.history.length > 4) t.history.shift();
    }
    blobs.forEach((b, i) => {
      if (!used.has(i)) this.tracks.push({ blob: b, history: [true] });
    });
    this.tracks = this.tracks.filter((t) => t.history.slice(-3).some(Boolean));
    return this.tracks.filter((t) => t.history.filter(Boolean).length >= 3).map((t) => t.blob);
  }

  reset() {
    this.tracks = [];
  }
}

function centreDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2, (a[1] + a[3]) / 2 - (b[1] + b[3]) / 2);
}

export interface SceneRead {
  /** Mean luma, 0-255. */
  brightness: number;
  lights: LightBlob[];
  /** "on" when fixtures are visibly lit. */
  lighting: "on" | "off" | "unclear";
  dark: boolean;
}

export function readScene(luma: Uint8Array, w: number, h: number, rgba?: ArrayLike<number>): SceneRead {
  let sum = 0;
  for (let i = 0; i < luma.length; i++) sum += luma[i];
  const brightness = sum / luma.length;
  const lights = findLightSources(luma, w, h, { rgba });
  const lighting = lights.length >= 1 ? "on" : brightness < 60 ? "off" : "unclear";
  return { brightness, lights, lighting, dark: brightness < 60 };
}

/** Mean saturation (0-1) of the RGBA pixels inside a fractional box. */
export function regionSaturation(rgba: ArrayLike<number>, w: number, h: number, box: readonly number[]): number {
  const x1 = Math.max(0, Math.floor(box[0] * w));
  const y1 = Math.max(0, Math.floor(box[1] * h));
  const x2 = Math.min(w, Math.ceil(box[2] * w));
  const y2 = Math.min(h, Math.ceil(box[3] * h));
  let s = 0;
  let n = 0;
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const p = (y * w + x) * 4;
      const mx = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
      s += mx > 0 ? (mx - Math.min(rgba[p], rgba[p + 1], rgba[p + 2])) / mx : 0;
      n++;
    }
  }
  return n ? s / n : 0;
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
