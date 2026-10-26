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
import { scoreObservation } from "./energy";
import type { CategorizedObservation } from "./parse";
import type { AuditSettings, Box, DeviceState, Offender } from "./types";

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
  /** Its idle cost: what it draws through the empty hours, in the state it is assumed to be in. */
  costPerYear: number;
  /** At typical use where it is. */
  typicalCostPerYear: number;
  /** Why it is meant to run all night (a fridge, a router), when it is: then none of it is idle. */
  needed?: string;
  /**
   * The scan report's own scoring of this one unit, when there is one. The split
   * into used and idle, the range and the caption all come from it, so a live tag
   * and a scanned photo of the same device show the same numbers.
   */
  priced?: Offender;
}

/**
 * Price one unit the way the scan report does, by running it through the same
 * scorer: same empty-hours rate, same time-of-use shaping, same heating and
 * cooling factor, same assumption about what it does overnight.
 */
export function priceUnit(
  obs: { categoryId: string | null; state: DeviceState | null; device: string; userWatts?: number; afterHours?: DeviceState; hoursPerYear?: number },
  settings: AuditSettings,
): Pick<LiveItem, "costPerYear" | "typicalCostPerYear" | "needed" | "priced"> {
  const priced = obs.categoryId && obs.state ? scoreObservation({ device: obs.device, count: 1, state: obs.state, categoryId: obs.categoryId, userWatts: obs.userWatts, afterHours: obs.afterHours, hoursPerYear: obs.hoursPerYear }, settings, "live", 0) : null;
  // Explicit keys, so re-pricing an item clears what the last pricing set.
  return { costPerYear: priced?.costPerYear ?? 0, typicalCostPerYear: priced?.typicalCostPerYear ?? 0, needed: priced?.needed, priced: priced ?? undefined };
}

/** Screens are what brightness can judge; everything else is assumed on. */
const SCREEN_CLASSES = new Set(["tv", "laptop"]);
/** Things whose own display glows, so a bright patch inside them is never a light. */
const GLOWING_CLASSES = new Set(["tv", "laptop", "cell phone"]);

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

/**
 * What a lit fixture is, from its shape and where it sits in the frame.
 *
 * Every compact light used to be called a lamp, so a ceiling of downlights read
 * as a row of lamps. A phone held at eye level sees the ceiling in the upper half
 * of the frame (a corridor's far fixtures converge toward the middle), and a desk
 * or floor lamp below it. Long and bright is a tube or troffer, wherever it is.
 */
export function lightKind(kind: LightBlob["kind"], box: Box): { categoryId: string; label: string } {
  if (kind === "panel") return { categoryId: "ceiling_light", label: "overhead light" };
  const cy = (box[1] + box[3]) / 2;
  return cy < 0.5 ? { categoryId: "downlight", label: "ceiling light" } : { categoryId: "x_desk_lamp", label: "lamp" };
}

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

  for (const [i, d] of dets.entries()) {
    const coco = COCO_MAP[d.cls];
    if (!coco) continue;
    // A trained detector's "lamp" is placed like any lit fixture: high in the frame it is on the ceiling.
    const c = d.cls === "lamp" ? { ...coco, ...lightKind("spot", d.box) } : coco;
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
      ...priceUnit({ categoryId: c.categoryId, state, device: c.label }, settings),
    });
  }

  // A bright patch inside a phone, screen or laptop is its display, not a light.
  const glowing = dets.filter((d) => GLOWING_CLASSES.has(d.cls)).map((d) => d.box);
  for (const [i, b] of lights.entries()) {
    const lx = (b.box[0] + b.box[2]) / 2;
    const ly = (b.box[1] + b.box[3]) / 2;
    if (glowing.some((g) => lx >= g[0] && lx <= g[2] && ly >= g[1] && ly <= g[3])) continue;
    const { categoryId, label } = lightKind(b.kind, b.box);
    const light = CATALOG_BY_ID[categoryId];
    const watts = light ? estimateUnitWatts(light, "on").mid : 0;
    items.push({
      key: `l${i}`,
      kind: "light",
      label,
      categoryId,
      box: b.box,
      score: b.confidence,
      state: "on",
      why: "fixture lit",
      watts,
      ...priceUnit({ categoryId, state: "on", device: label }, settings),
    });
  }
  return items;
}

/**
 * The full AI audit's observations as items to draw over the live picture: one
 * per located box. Devices it counted but could not box are left off the
 * picture; it is the same answer a photo gets, so the panel can trust it.
 */
export function observationsToItems(
  observations: readonly CategorizedObservation[],
  settings: AuditSettings,
  prefix = "ai",
): LiveItem[] {
  const items: LiveItem[] = [];
  observations.forEach((o, i) => {
    const cat = CATALOG_BY_ID[o.categoryId];
    if (!cat || !o.boxes?.length) return;
    const watts = o.userWatts ?? estimateUnitWatts(cat, o.state).mid;
    o.boxes.forEach((box, j) => {
      items.push({
        key: `${prefix}${i}-${j}`,
        kind: cat.group === "lighting" ? "light" : "device",
        label: o.device || cat.label,
        categoryId: o.categoryId,
        box,
        score: 0.9,
        state: o.state,
        why: o.evidence,
        watts,
        ...priceUnit({ categoryId: o.categoryId, state: o.state, device: o.device, userWatts: o.userWatts }, settings),
      });
    });
  });
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
