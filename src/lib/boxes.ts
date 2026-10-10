// Turning a vision model's box coordinates into boxes that land on the photo.
//
// Every rule in this file exists because a real model response needed it. The
// first live test against a lab photo produced boxes that were all shifted, then
// a tail of invented ones marching off along a row, then [0,0,0,0] padding. What
// survives here is what it took to draw only what the model actually saw.

import type { Box } from "./types";

/**
 * The part of the analysed image that is actually photo.
 *
 * The client sends the model a 1000 x 1000 square with the photo in its top-left
 * corner and grey padding filling the rest. That is not cosmetic. Vision models
 * disagree about what a coordinate means - pixels, 0-1000 per axis, or 0-1000
 * along the longest side with the aspect ratio kept - and asking for one
 * convention by name does not reliably get it. On a 1000-pixel square all three
 * are the same number, so whichever a model uses, the box lands in the right
 * place. The frame says how much of that square is photo, in the square's units,
 * so boxes can be mapped back onto the photo alone.
 */
export interface Frame {
  w: number;
  h: number;
}

export const SQUARE = 1000;
export const FULL_FRAME: Frame = { w: SQUARE, h: SQUARE };

/** Hard ceiling per device type, after cleaning. The prompt asks for fewer. */
export const MAX_BOXES_PER_DEVICE = 10;

/** Accept a frame from an untrusted request body, or fall back to the full square. */
export function sanitizeFrame(raw: unknown): Frame {
  const r = (raw ?? {}) as Partial<Frame>;
  const w = Number(r.w);
  const h = Number(r.h);
  const ok = (n: number) => Number.isFinite(n) && n >= 50 && n <= SQUARE;
  return ok(w) && ok(h) ? { w, h } : FULL_FRAME;
}

type Quad = [number, number, number, number];

function toNum(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** One box in any of the shapes models actually emit, as [x1,y1,x2,y2]. */
function readOneBox(raw: unknown): Quad | null {
  if (Array.isArray(raw)) {
    if (raw.length !== 4) return null;
    const nums = raw.map(toNum);
    return nums.every((n) => n !== null) ? (nums as Quad) : null;
  }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const nested = r.bbox_2d ?? r.bbox ?? r.box;
    if (nested) return readOneBox(nested);
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const n = toNum(r[k]);
        if (n !== null) return n;
      }
      return null;
    };
    const x1 = pick("x1", "xmin", "left", "x");
    const y1 = pick("y1", "ymin", "top", "y");
    let x2 = pick("x2", "xmax", "right");
    let y2 = pick("y2", "ymax", "bottom");
    const w = pick("w", "width");
    const h = pick("h", "height");
    if (x1 !== null && x2 === null && w !== null) x2 = x1 + w;
    if (y1 !== null && y2 === null && h !== null) y2 = y1 + h;
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return [x1, y1, x2, y2];
  }
  return null;
}

/** A single box, or a list of them, under whichever key the model chose. */
export function readBoxList(rec: Record<string, unknown>): Quad[] {
  const raw = rec.boxes ?? rec.bboxes ?? rec.bbox_2d ?? rec.bbox ?? rec.box ?? rec.locations;
  if (raw == null) return [];
  const isList = Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object";
  if (!isList) {
    const one = readOneBox(raw);
    return one ? [one] : [];
  }
  return (raw as unknown[]).map(readOneBox).filter((b): b is Quad => b !== null);
}

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Cut a list off where the model stopped looking and started extrapolating.
 *
 * Asked for more boxes than it can see, a vision model does not stop. It keeps
 * going along the row it was on, emitting boxes at a steadily shrinking stride
 * until it reaches the edge of the frame. Measured on a real lab photo, the tail
 * moved in strides of 13, 13, 12, 10, 10, 10, 10 units - far more regular than a
 * real row, where perspective, gaps and occlusion make spacing jump about. Four
 * consecutive steps whose stride barely changes is the signature, and everything
 * after the box that run starts from is dropped.
 */
export function trimExtrapolation(boxes: Box[], tol = 4, run = 4): Box[] {
  if (boxes.length < run + 2) return boxes;
  let steady = 0;
  for (let i = 2; i < boxes.length; i++) {
    const dx1 = boxes[i - 1][0] - boxes[i - 2][0];
    const dy1 = boxes[i - 1][1] - boxes[i - 2][1];
    const dx2 = boxes[i][0] - boxes[i - 1][0];
    const dy2 = boxes[i][1] - boxes[i - 1][1];
    const moving = Math.abs(dx2) + Math.abs(dy2) > 0;
    const same = Math.abs(dx2 - dx1) <= tol && Math.abs(dy2 - dy1) <= tol;
    steady = moving && same ? steady + 1 : 0;
    // `run` steady steps ending at i began at box i - run - 1. That first box
    // was still a sighting; the ones after it are the pattern.
    if (steady >= run) return boxes.slice(0, i - run);
  }
  return boxes;
}

/**
 * Whatever box data a model returned, as clean photo-fraction boxes.
 *
 * Handles placeholder padding, swapped corners, 0-1 fractions instead of
 * 0-1000, coordinates spilling into the grey padding, duplicate boxes on one
 * object, and fabricated tails - each of which turned up in a real response.
 */
export function cleanBoxes(rec: Record<string, unknown>, frame: Frame = FULL_FRAME): Box[] {
  const raw = readBoxList(rec);
  if (!raw.length) return [];

  // A model answering in 0-1 fractions is answering in the square's terms too.
  const max = Math.max(...raw.flat().map(Math.abs));
  const scale = max <= 1.5 ? SQUARE : 1;

  const square: Box[] = [];
  for (const b of raw) {
    let [x1, y1, x2, y2] = b.map((v) => v * scale);
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    // Degenerate, including the all-zero placeholders some models pad with.
    if (x2 - x1 < 4 || y2 - y1 < 4) continue;
    square.push([x1, y1, x2, y2]);
  }

  const out: Box[] = [];
  for (const [x1, y1, x2, y2] of trimExtrapolation(square)) {
    const area = (x2 - x1) * (y2 - y1);
    const cx1 = Math.max(0, x1);
    const cy1 = Math.max(0, y1);
    const cx2 = Math.min(frame.w, x2);
    const cy2 = Math.min(frame.h, y2);
    if (cx2 <= cx1 || cy2 <= cy1) continue;
    // Mostly in the padding means the model boxed nothing.
    if (((cx2 - cx1) * (cy2 - cy1)) / area < 0.5) continue;
    const box: Box = [cx1 / frame.w, cy1 / frame.h, cx2 / frame.w, cy2 / frame.h];
    if (out.some((o) => iou(o, box) > 0.7)) continue;
    out.push(box);
    if (out.length >= MAX_BOXES_PER_DEVICE) break;
  }
  return out;
}
