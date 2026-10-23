// Wattage tags on the live camera: the plain logic behind them.
//
// Each thing in view carries a tag with its draw in watts, the number people
// actually want to see. The tags ease toward a new reading instead of jumping,
// the meter adds up what is drawing in view right now, and a tap on a tag
// opens it to correct what it is or whether it is on. A correction sticks to
// that one tracked object for as long as the camera keeps it.

import { CATALOG_BY_ID } from "./devices";
import { estimateUnitWatts } from "./estimate";
import { typicalUse } from "./usage";
import type { LiveItem } from "./ondevice";
import type { AuditSettings, Box, DeviceState } from "./types";

/** What a person said a tagged thing really is. */
export interface TagFix {
  categoryId: string;
  state: DeviceState;
  /** Their name for it, when they picked one from the catalog. */
  label?: string;
}

/** The same item, re-priced as another device or another state. */
export function relabel(item: LiveItem, fix: TagFix, settings: AuditSettings): LiveItem {
  const cat = CATALOG_BY_ID[fix.categoryId];
  if (!cat) return item;
  const hours = settings.unoccupiedHoursPerYear;
  const occupied = settings.occupiedHoursPerYear ?? Math.max(0, 8760 - hours);
  const watts = estimateUnitWatts(cat, fix.state).mid;
  const typical =
    fix.state === "off" ? 0 : typicalUse(cat, estimateUnitWatts(cat, "on").mid, settings.usageContext ?? "school", occupied).kwhPerYear * settings.ratePerKwh;
  return {
    ...item,
    kind: cat.group === "lighting" ? "light" : "device",
    label: fix.label ?? cat.label.toLowerCase(),
    categoryId: cat.id,
    state: fix.state,
    why: "set by you",
    score: 1,
    watts,
    costPerYear: (watts / 1000) * hours * settings.ratePerKwh,
    typicalCostPerYear: typical,
  };
}

/** Every item with its correction applied. */
export function applyFixes(items: readonly LiveItem[], fixes: ReadonlyMap<string, TagFix>, settings: AuditSettings): LiveItem[] {
  if (!fixes.size) return items as LiveItem[];
  return items.map((it) => {
    const f = fixes.get(it.key);
    return f ? relabel(it, f, settings) : it;
  });
}

/** The published low-high range for one unit in its state, W. */
export function wattBand(item: Pick<LiveItem, "categoryId" | "state">): { low: number; mid: number; high: number } | null {
  const cat = item.categoryId ? CATALOG_BY_ID[item.categoryId] : undefined;
  if (!cat || !item.state) return null;
  const u = estimateUnitWatts(cat, item.state);
  return { low: u.low, mid: u.mid, high: u.high };
}

/** Whether an item is drawing power that counts: a device or light that is not off. */
export const drawing = (it: Pick<LiveItem, "kind" | "state">) => (it.kind === "device" || it.kind === "light") && it.state !== "off";

/** Watts drawing in view right now. */
export function wattsInView(items: readonly LiveItem[]): number {
  return items.reduce((s, it) => s + (drawing(it) ? it.watts : 0), 0);
}

/**
 * Ease each shown number toward its reading. A new tag counts up from zero,
 * which reads as the meter finding it; one gone from view is forgotten.
 * About a third of a second to settle, whatever the frame rate.
 */
export function easeAll(shown: Map<string, number>, targets: ReadonlyMap<string, number>, dtMs: number): Map<string, number> {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / 110);
  for (const key of [...shown.keys()]) if (!targets.has(key)) shown.delete(key);
  for (const [key, target] of targets) {
    const cur = shown.get(key) ?? 0;
    const next = cur + (target - cur) * k;
    shown.set(key, Math.abs(target - next) < 0.5 ? target : next);
  }
  return shown;
}

/** A drawn tag or box, in canvas pixels. */
export interface HitRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Which tag a tap landed on. Tags are checked before boxes, and the last drawn
 * (on top) first; among boxes the smallest wins, so a monitor on a desk inside
 * a bigger box is still reachable. A finger is not a cursor: a few pixels of
 * slack around each tag.
 */
export function hitTest(tags: readonly HitRect[], boxes: readonly HitRect[], x: number, y: number, slack = 6): string | null {
  for (let i = tags.length - 1; i >= 0; i--) {
    const r = tags[i];
    if (x >= r.x - slack && x <= r.x + r.w + slack && y >= r.y - slack && y <= r.y + r.h + slack) return r.key;
  }
  let best: HitRect | null = null;
  for (const r of boxes) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && (!best || r.w * r.h < best.w * best.h)) best = r;
  }
  return best?.key ?? null;
}

/** Where a tag goes: above its box, else below, else inside the top; always on screen. */
export function placeTag(box: { x: number; y: number; w: number; h: number }, tw: number, th: number, cw: number, ch: number): { x: number; y: number } {
  let x = Math.max(4, Math.min(box.x, cw - tw - 4));
  let y = box.y - th - 6;
  if (y < 56) y = box.y + box.h + 6;
  if (y + th > ch - 4) y = Math.max(4, box.y + 4);
  x = Math.round(x);
  y = Math.round(y);
  return { x, y };
}

/** Two tags that would overlap: the later one is nudged down until it does not. */
export function unstack(rects: { x: number; y: number; w: number; h: number }[], ch: number): void {
  for (let i = 1; i < rects.length; i++) {
    for (let tries = 0; tries < 6; tries++) {
      const r = rects[i];
      const hit = rects.slice(0, i).find((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
      if (!hit) break;
      const below = hit.y + hit.h + 3;
      if (below + r.h > ch - 4) break;
      r.y = below;
    }
  }
}

/** A box in 0-1 coordinates, mirrored or not, in canvas pixels. */
export function boxToPx(box: Box, rect: { x: number; y: number; w: number; h: number }, mirrored: boolean) {
  const x1 = mirrored ? 1 - box[2] : box[0];
  const x2 = mirrored ? 1 - box[0] : box[2];
  return { x: rect.x + x1 * rect.w, y: rect.y + box[1] * rect.h, w: (x2 - x1) * rect.w, h: (box[3] - box[1]) * rect.h };
}
