// The whole school in 3D: the real building outline, its floor plans, and every
// scanned room coloured by what it wastes after hours.
//
// Three sources meet here:
//   - the outline: the building's footprint from OpenStreetMap, in lon/lat, with
//     its number of floors when mapped (lib/../api/footprint);
//   - the floor plans: a photo of each floor's plan, with rooms drawn on it as
//     rectangles in the plan's own 0-1 coordinates;
//   - the scans: each room's latest saved audit, matched to a plan room by name.
//
// Everything is laid out on a flat local grid in metres (x east, y north), and
// a floor plan is fitted onto the outline by a rotation, scale and offset the
// person can adjust until the two line up. No floor plan: rooms are laid out in
// a grid inside the outline. No outline: the plan's own rectangle becomes one.

import type { Offender } from "./types";
import type { SavedAudit } from "./storage";

export interface Footprint {
  /** Closed ring of [lon, lat]. */
  outline: [number, number][];
  levels: number | null;
  name: string | null;
  osmId: string;
  kind: string | null;
}

/** A room drawn on a plan, in the plan image's 0-1 coordinates (x right, y down). */
export interface PlanRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How a floor plan sits on the outline. */
export interface PlanFit {
  /** Extra rotation, degrees, on top of the outline's own main axis. */
  rotation: number;
  /** 1 = the plan exactly fills the outline's bounding box. */
  scale: number;
  /** Offset, metres east and north. */
  dx: number;
  dy: number;
}

export interface Floor {
  id: string;
  /** 0 = ground floor. */
  level: number;
  name: string;
  /** A downscaled photo of the plan. */
  plan?: { dataUrl: string; aspect: number };
  rooms: PlanRoom[];
  fit: PlanFit;
}

export interface Campus {
  footprint?: Footprint;
  floors: Floor[];
  /** Storey height, metres. */
  floorHeight: number;
  /** The school this was found as, by name search. */
  school?: { name: string; place: string; osmId: string };
}

let seq = 0;
/** A short id that is unique within this session and across reloads. */
export function campusId(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export const DEFAULT_FIT: PlanFit = { rotation: 0, scale: 1, dx: 0, dy: 0 };

export function emptyCampus(): Campus {
  return { floors: [], floorHeight: 3.6 };
}

// ---- geometry -------------------------------------------------------------------

export type Pt = [number, number];

/** Lon/lat ring to metres around its own centre (equirectangular; fine at building scale). */
export function projectOutline(outline: [number, number][]): { points: Pt[]; origin: [number, number] } {
  const ring = outline.length > 1 && outline[0][0] === outline.at(-1)![0] && outline[0][1] === outline.at(-1)![1] ? outline.slice(0, -1) : outline;
  const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return { points: ring.map(([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky]), origin: [lon0, lat0] };
}

export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function pointInPolygon([x, y]: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The direction of the outline's longest wall, radians: the building's main axis. */
export function mainAxis(pts: Pt[]): number {
  let best = 0;
  let angle = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > best) {
      best = len;
      angle = Math.atan2(y2 - y1, x2 - x1);
    }
  }
  // Fold into (-90°, 90°] so "main axis" never flips the plan upside down.
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle <= -Math.PI / 2) angle += Math.PI;
  return angle;
}

const rot = ([x, y]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** The outline's bounding box in its own main-axis frame: centre (world), size, angle. */
export function orientedBox(pts: Pt[]): { cx: number; cy: number; w: number; h: number; angle: number } {
  const angle = mainAxis(pts);
  const local = pts.map((p) => rot(p, -angle));
  const xs = local.map((p) => p[0]);
  const ys = local.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [cx, cy] = rot([(minX + maxX) / 2, (minY + maxY) / 2], angle);
  return { cx, cy, w: maxX - minX, h: maxY - minY, angle };
}

/**
 * Map a point on a floor plan (0-1, y down) to the outline's metre grid.
 * The plan is scaled to fit inside the outline's box (keeping its aspect),
 * then the person's own rotation, scale and offset are applied.
 */
export function planToWorld(u: number, v: number, aspect: number, box: ReturnType<typeof orientedBox>, fit: PlanFit): Pt {
  // Base size: the plan, contained in the box.
  let w = box.w;
  let h = box.w / aspect;
  if (h > box.h) {
    h = box.h;
    w = box.h * aspect;
  }
  const local: Pt = [(u - 0.5) * w * fit.scale, -(v - 0.5) * h * fit.scale];
  const [x, y] = rot(local, box.angle + (fit.rotation * Math.PI) / 180);
  return [x + box.cx + fit.dx, y + box.cy + fit.dy];
}

/** Four corners of a plan room in the metre grid. */
export function roomCorners(r: PlanRoom, aspect: number, box: ReturnType<typeof orientedBox>, fit: PlanFit): Pt[] {
  return [
    planToWorld(r.x, r.y, aspect, box, fit),
    planToWorld(r.x + r.w, r.y, aspect, box, fit),
    planToWorld(r.x + r.w, r.y + r.h, aspect, box, fit),
    planToWorld(r.x, r.y + r.h, aspect, box, fit),
  ];
}

/** Rooms with no plan, laid out in a tidy grid that fills the box. */
export function gridRooms(names: string[]): PlanRoom[] {
  const n = Math.max(1, names.length);
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  const rows = Math.ceil(n / cols);
  const pad = 0.02;
  return names.map((name, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return { id: `g${i}`, name, x: c / cols + pad / 2, y: r / rows + pad / 2, w: 1 / cols - pad, h: 1 / rows - pad };
  });
}

// ---- waste per room ----------------------------------------------------------------

export interface RoomWaste {
  name: string;
  /** After-hours waste, dollars a year. */
  waste: number;
  /** The same, by device group, for the layer toggles. */
  byGroup: Record<string, number>;
  devices: { label: string; count: number; cost: number; group: string }[];
  at: string;
}

/** Room names as people write them: "Room 214", "rm 214", "214" all match. */
export function roomKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(room|rm|classroom|class)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Each room's latest scan in a building, keyed by roomKey. */
export function roomWaste(audits: SavedAudit[], buildingId: string): Map<string, RoomWaste> {
  const latest = new Map<string, SavedAudit>();
  for (const a of audits) {
    if (a.buildingId !== buildingId || !a.areas[0]) continue;
    const k = roomKey(a.areas[0]);
    const prev = latest.get(k);
    if (!prev || prev.at < a.at) latest.set(k, a);
  }
  const out = new Map<string, RoomWaste>();
  for (const [k, a] of latest) {
    const counted = a.offenders.filter((o: Offender) => !o.unverified && o.costPerYear > 0);
    const byGroup: Record<string, number> = {};
    for (const o of counted) byGroup[o.group ?? "specialty"] = (byGroup[o.group ?? "specialty"] ?? 0) + o.costPerYear;
    out.set(k, {
      name: a.areas[0],
      waste: counted.reduce((s, o) => s + o.costPerYear, 0),
      byGroup,
      devices: [...counted]
        .sort((x, y) => y.costPerYear - x.costPerYear)
        .map((o) => ({ label: o.label, count: o.count, cost: o.costPerYear, group: o.group ?? "specialty" })),
      at: a.at,
    });
  }
  return out;
}

/**
 * Blue for little waste, through teal and yellow, to red for the worst room.
 * Every step is saturated: a path straight from blue to amber passes through
 * grey, and a grey room reads as "not scanned".
 */
const STOPS: [number, [number, number, number]][] = [
  [0, [59, 91, 170]],
  [0.25, [38, 160, 178]],
  [0.5, [238, 196, 66]],
  [0.75, [240, 122, 50]],
  [1, [217, 52, 31]],
];

export function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (x <= t1) {
      const f = (x - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * f));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return "rgb(217, 52, 31)";
}
