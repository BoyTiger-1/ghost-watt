// The on-device audit: what the detector and the pixels alone can say.
//
// This is what draws on the live camera, and it is the answer of last resort
// when no vision model is reachable: unlike the room-profile preset it replaces,
// it is a reading of *this* photo - fewer device types than a full model knows,
// but every one of them actually seen.

import { CATALOG_BY_ID } from "./devices";
import { COCO_MAP } from "./live";
import { estimateUnitWatts } from "./estimate";
import { classifyScreen, regionStats, ringStats, type LightBlob } from "./scene";
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

/** A lit fixture seen as one light; costed as a ceiling light. */
const LIGHT_CATEGORY = "ceiling_light";

/**
 * One frame's worth of things to draw, each with a state, a wattage and a cost.
 *
 * `luma` is a small greyscale copy of the same frame (any size); screens are
 * judged on it. Without it, every screen is priced as on - the worst case.
 */
export function readItems(
  dets: readonly FracDetection[],
  lights: readonly LightBlob[],
  settings: AuditSettings,
  luma?: { data: Uint8Array; w: number; h: number },
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
        const read = classifyScreen(
          regionStats(luma.data, luma.w, luma.h, panelOf(d.cls, d.box)),
          ringStats(luma.data, luma.w, luma.h, d.box),
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

  const light = CATALOG_BY_ID[LIGHT_CATEGORY];
  for (const [i, b] of lights.entries()) {
    const watts = light ? estimateUnitWatts(light, "on").mid : 0;
    items.push({
      key: `l${i}`,
      kind: "light",
      label: "light",
      categoryId: LIGHT_CATEGORY,
      box: b.box,
      score: Math.min(0.9, 0.5 + b.area * 20),
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
