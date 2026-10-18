// The on-device audit: what the detector and the pixels alone can say.
//
// This is what draws on the live camera, and it is the answer of last resort
// when no vision model is reachable: unlike the room-profile preset it replaces,
// it is a reading of *this* photo - fewer device types than a full model knows,
// but every one of them actually seen.

import { CATALOG_BY_ID } from "./devices";
import { COCO_MAP } from "./live";
import { estimateUnitWatts } from "./estimate";
import { classifyScreen, regionSaturation, regionStats, ringStats, type LightBlob } from "./scene";
import { iou } from "./boxes";
import type { CategorizedObservation } from "./parse";
import type { AuditSettings, Box, DeviceState } from "./types";

/** A detection in fractional coordinates. */
export interface FracDetection {
  cls: string;
  score: number;
  box: Box;
  /** Stable id from the tracker, when there is one. */
  id?: number;
}

export interface LiveItem {
  key: string;
  kind: "device" | "light" | "person" | "other";
  label: string;
  categoryId: string | null;
  box: Box;
  score: number;
  state: DeviceState | null;
  /** Why the state was judged so, e.g. "screen lit". */
  why?: string;
  watts: number;
  costPerYear: number;
}

/** Screens are what brightness can judge; everything else is assumed on. */
const SCREEN_CLASSES = new Set(["tv", "laptop"]);

/**
 * The glass inside a detector box. COCO boxes take in the bezel, the stand and,
 * for a laptop, the keyboard - all of which are pale on a typical office unit and
 * make a black, sleeping screen read as "bright enough to be on".
 */
export function panelOf(cls: string, b: Box): Box {
  const w = b[2] - b[0];
  const h = b[3] - b[1];
  return cls === "laptop"
    ? [b[0] + w * 0.14, b[1] + h * 0.08, b[2] - w * 0.14, b[1] + h * 0.48]
    : [b[0] + w * 0.16, b[1] + h * 0.12, b[2] - w * 0.16, b[1] + h * 0.66];
}

/** Lit fixtures: a compact one is a downlight or pendant, a long one a tube or troffer bank. */
const LIGHT_CATEGORY = { spot: "downlight", panel: "ceiling_light" } as const;
const LIGHT_LABEL = { spot: "lamp", panel: "light panel" } as const;

/** A small copy of the frame: greyscale always, colour when the caller has it. */
export interface FramePixels {
  data: Uint8Array;
  w: number;
  h: number;
  rgba?: ArrayLike<number>;
}

/**
 * One frame's worth of things to draw, each with a state, a wattage and a cost.
 *
 * `luma` is a small copy of the same frame (any size); screens are judged on
 * it. Without it, every screen is priced as on - the worst case.
 */
export function readItems(
  dets: readonly FracDetection[],
  lights: readonly LightBlob[],
  settings: AuditSettings,
  luma?: FramePixels,
): LiveItem[] {
  const items: LiveItem[] = [];
  const hours = settings.unoccupiedHoursPerYear;
  const cost = (w: number) => (w / 1000) * hours * settings.ratePerKwh;

  for (const [i, d] of dets.entries()) {
    const c = COCO_MAP[d.cls];
    if (!c) continue;
    let state: DeviceState | null = null;
    let why: string | undefined;
    let watts = 0;
    if (c.kind === "device") {
      state = "on";
      if (SCREEN_CLASSES.has(d.cls) && luma) {
        const panel = panelOf(d.cls, d.box);
        const read = classifyScreen(
          regionStats(luma.data, luma.w, luma.h, panel),
          ringStats(luma.data, luma.w, luma.h, d.box),
          luma.rgba ? regionSaturation(luma.rgba, luma.w, luma.h, panel) : undefined,
        );
        state = read.state;
        why = read.why;
      }
      const cat = c.categoryId ? CATALOG_BY_ID[c.categoryId] : undefined;
      if (cat) watts = estimateUnitWatts(cat, state).mid;
    }
    items.push({
      key: d.id !== undefined ? `t${d.id}` : `d${i}`,
      kind: c.kind,
      label: c.label,
      categoryId: c.categoryId,
      box: d.box,
      score: d.score,
      state,
      why,
      watts,
      costPerYear: cost(watts),
    });
  }

  for (const [i, b] of lights.entries()) {
    const categoryId = LIGHT_CATEGORY[b.kind];
    const light = CATALOG_BY_ID[categoryId];
    const watts = light ? estimateUnitWatts(light, "on").mid : 0;
    items.push({
      key: `l${i}`,
      kind: "light",
      label: LIGHT_LABEL[b.kind],
      categoryId,
      box: b.box,
      score: b.confidence,
      state: "on",
      why: "fixture lit",
      watts,
      costPerYear: cost(watts),
    });
  }
  return items;
}

/** The items as catalog observations: one line per category and state, with boxes. */
export function itemsToObservations(items: readonly LiveItem[]): CategorizedObservation[] {
  const lines = new Map<string, CategorizedObservation>();
  for (const it of items) {
    if (!it.categoryId || !it.state) continue;
    const key = `${it.categoryId}:${it.state}`;
    const cur = lines.get(key);
    if (cur) {
      cur.count++;
      cur.boxes!.push(it.box);
    } else {
      lines.set(key, {
        device: it.label,
        count: 1,
        state: it.state,
        categoryId: it.categoryId,
        boxes: [it.box],
        ...(it.why ? { evidence: `on-device: ${it.why}` } : {}),
      });
    }
  }
  return [...lines.values()];
}

/** People in frame: the room is in use, so its load is not phantom yet. */
export function peopleIn(items: readonly LiveItem[]): number {
  return items.filter((i) => i.kind === "person").length;
}

/** Share of the smaller box covered by the larger: 1 when one sits inside the other. */
function containment(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const small = Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
  return small > 0 ? (ix * iy) / small : 0;
}

/** Screens and laptops are often both reported for one monitor; they compete as one. */
const SAME_THING: Record<string, string> = { tv: "screen", laptop: "screen" };

/**
 * Detections from the whole photo and from zoomed tiles of it, as one list.
 *
 * Tiling is what finds the far row of monitors: the detector sees at 320-448
 * pixels, so a monitor 40 pixels wide in a 1280-pixel photo is a few pixels to
 * it, and a quarter-size tile doubles that. The cost is duplicates - the same
 * monitor whole in one tile, cut in half at the edge of another - so overlapping
 * boxes of the same kind keep only the best, and a fragment inside a bigger box
 * of the same kind is dropped.
 */
export function mergeDetections(lists: readonly (readonly FracDetection[])[]): FracDetection[] {
  const all = lists.flat().slice().sort((a, b) => b.score - a.score);
  const kept: FracDetection[] = [];
  for (const d of all) {
    const group = SAME_THING[d.cls] ?? d.cls;
    const dup = kept.some((k) => (SAME_THING[k.cls] ?? k.cls) === group && (iou(k.box, d.box) > 0.45 || containment(k.box, d.box) > 0.75));
    if (!dup) kept.push(d);
  }
  return kept;
}

/** Overlapping crops covering a frame: the whole of it, then a 2 x 2 grid with 25% overlap. */
export function tileGrid(): Box[] {
  const s = 0.58;
  const at = [0, 1 - s];
  return [[0, 0, 1, 1], ...at.flatMap((y) => at.map((x) => [x, y, x + s, y + s] as Box))] as Box[];
}
