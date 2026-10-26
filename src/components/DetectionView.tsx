"use client";

// A photo with every device it was read for drawn on it.
//
// State, not device type, picks the colour: what a reader needs from the photo
// at a glance is which things are burning power, not which are monitors. The
// same boxes are burned into a PNG for the report and for saving.

import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { fmtMoney } from "@/lib/energy";
import { loadImage } from "@/lib/image";
import { STATE_COLOR, STATE_PLAIN, USAGE_COLOR, type BoxKind } from "./scan/plain";
import type { AnalysisMode, Box, DeviceState, Offender, Sighting } from "@/lib/types";

export interface DetectionPhoto {
  id: string;
  name: string;
  dataUrl: string;
  mode: AnalysisMode;
  engine: string;
  offenders: Offender[];
  sightings?: Sighting[];
}

/** One thing drawn on the photo: a costed device, or one seen switched off. */
interface Mark {
  id: string;
  label: string;
  state: DeviceState;
  count: number;
  /** Null for a sighting: off devices are not costed. */
  cost: number | null;
  /** Reported by the model but not backed by the detector: drawn dashed, not counted. */
  unverified?: boolean;
  /** Meant to run all night (a fridge, a router): shown as usage, with what it costs a year to run. */
  usage?: number;
}

/** Waste is red or amber by state; usage is always blue. */
const markColor = (m: Mark) => (m.usage !== undefined ? USAGE_COLOR : STATE_COLOR[m.state]);

export interface Placed {
  key: string;
  box: Box;
  mark: Mark;
  /** Index of this box within its mark, for the label and the stagger. */
  n: number;
}

/** Device row anchor, so a box click can scroll to its row. */
export const offenderAnchor = (id: string) => `offender-${id}`;

export function placeMarks(photo: DetectionPhoto): Placed[] {
  const out: Placed[] = [];
  for (const o of photo.offenders) {
    const mark: Mark = {
      id: o.id,
      label: o.label,
      state: o.state,
      count: o.count,
      cost: o.costPerYear,
      unverified: o.unverified,
      ...(o.needed ? { usage: o.annualCostPerYear ?? o.typicalCostPerYear ?? 0 } : {}),
    };
    (o.boxes ?? []).forEach((box, n) => out.push({ key: `${o.id}-${n}`, box, mark, n }));
  }
  for (const [i, s] of (photo.sightings ?? []).entries()) {
    const mark: Mark = { id: `sighting-${i}`, label: s.label, state: s.state, count: s.count, cost: null };
    s.boxes.forEach((box, n) => out.push({ key: `${mark.id}-${n}`, box, mark, n }));
  }
  // Big boxes first, so small ones drawn later sit on top and stay hoverable.
  return out.sort((a, b) => area(b.box) - area(a.box));
}

export function AnnotatedPhoto({
  photo,
  hovered,
  onHover,
  onPick,
  showLabels = true,
  hidden,
}: {
  photo: DetectionPhoto;
  hovered: string | null;
  onHover: (id: string | null) => void;
  /** A box was clicked: the device it belongs to. */
  onPick?: (offenderId: string) => void;
  showLabels?: boolean;
  hidden?: ReadonlySet<BoxKind>;
}) {
  const reduceMotion = useReducedMotion();
  const placed = useMemo(() => placeMarks(photo), [photo]);
  const visible = hidden ? placed.filter((p) => !hidden.has(p.mark.usage !== undefined ? "usage" : p.mark.state)) : placed;
  const cloud = photo.mode === "enhanced";

  return (
    <div className="relative flex justify-center bg-black">
      {/* The boxes share a frame exactly the size of the drawn image, so they line up even when a tall photo is letterboxed. */}
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.dataUrl} alt={`${photo.name}, with the devices found marked`} className="block h-auto max-h-[70vh] w-auto max-w-full select-none" draggable={false} />
        <div className="absolute inset-0">
          <BoxLayer photo={photo} visible={visible} hovered={hovered} onHover={onHover} onPick={onPick} showLabels={showLabels} reduceMotion={!!reduceMotion} />
        </div>
      </div>

      {!placed.length && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-10">
          <p className="text-[0.78rem] leading-relaxed text-white/80">
            {cloud
              ? "The AI counted the devices but didn't say exactly where they are, so nothing is outlined on this photo."
              : "Nothing in this photo could be outlined."}
          </p>
        </div>
      )}
    </div>
  );
}

/** The boxes, positioned in fractions of the image. */
function BoxLayer({
  photo,
  visible,
  hovered,
  onHover,
  onPick,
  showLabels,
  reduceMotion,
}: {
  photo: DetectionPhoto;
  visible: Placed[];
  hovered: string | null;
  onHover: (id: string | null) => void;
  onPick?: (offenderId: string) => void;
  showLabels: boolean;
  reduceMotion: boolean;
}) {
  return (
    <>
        <AnimatePresence>
          {visible.map((p, i) => {
            const color = markColor(p.mark);
            const isHot = hovered === p.mark.id;
            const dimmed = hovered !== null && !isHot;
            const [x1, y1, x2, y2] = p.box;
            const labelBelow = y1 < 0.07;
            // Boxes near the right edge hang their label leftwards, so it stays on the photo.
            const labelRight = x1 > 0.55;
            const sighting = p.mark.id.startsWith("sighting-");
            return (
              <motion.button
                key={`${photo.id}-${p.key}`}
                type="button"
                initial={reduceMotion ? false : { opacity: 0, scale: 1.25 }}
                animate={{ opacity: dimmed ? 0.22 : 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.35,
                  delay: reduceMotion ? 0 : Math.min(i * 0.05, 1.2),
                  opacity: { duration: 0.2, delay: hovered === null && !reduceMotion ? Math.min(i * 0.05, 1.2) : 0 },
                }}
                onMouseEnter={() => onHover(p.mark.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(p.mark.id)}
                onBlur={() => onHover(null)}
                onClick={() => !sighting && onPick?.(p.mark.id)}
                aria-label={`${p.mark.label}, ${p.mark.usage !== undefined ? "in use" : STATE_PLAIN[p.mark.state].toLowerCase()}, ${costWords(p.mark)}`}
                className="absolute cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-white"
                style={{
                  left: `${x1 * 100}%`,
                  top: `${y1 * 100}%`,
                  width: `${(x2 - x1) * 100}%`,
                  height: `${(y2 - y1) * 100}%`,
                  background: isHot ? `${color}22` : "transparent",
                  boxShadow: p.mark.unverified ? "none" : `inset 0 0 0 1px ${color}${isHot ? "ff" : "66"}`,
                  outline: p.mark.unverified ? `1.5px dashed ${color}` : undefined,
                  outlineOffset: p.mark.unverified ? "-1px" : undefined,
                  opacity: p.mark.unverified && !isHot ? 0.75 : undefined,
                  zIndex: isHot ? 20 : 10,
                }}
              >
                <Corners color={color} thick={isHot} />
                {showLabels && (p.n === 0 || isHot) && (
                  <span
                    className={`pointer-events-none absolute ${labelRight ? "right-[-1px]" : "left-[-1px]"} whitespace-nowrap rounded-[3px] px-1.5 py-0.5 text-[0.62rem] font-semibold text-black sm:text-[0.7rem] ${
                      labelBelow ? "top-full mt-px" : "bottom-full mb-px"
                    }`}
                    style={{ background: color }}
                  >
                    {p.mark.label}
                    {p.n === 0 ? ` · ${tag(p.mark)}` : ""}
                  </span>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
    </>
  );
}

function Corners({ color, thick }: { color: string; thick: boolean }) {
  const w = thick ? 3 : 2;
  const len = "min(14px, 35%)";
  const base = { position: "absolute" as const, width: len, height: len, borderColor: color };
  return (
    <>
      <span style={{ ...base, left: -1, top: -1, borderLeftWidth: w, borderTopWidth: w }} />
      <span style={{ ...base, right: -1, top: -1, borderRightWidth: w, borderTopWidth: w }} />
      <span style={{ ...base, left: -1, bottom: -1, borderLeftWidth: w, borderBottomWidth: w }} />
      <span style={{ ...base, right: -1, bottom: -1, borderRightWidth: w, borderBottomWidth: w }} />
    </>
  );
}

function tag(m: Mark) {
  if (m.unverified) return "not sure";
  if (m.usage !== undefined) return `${fmtMoney(m.usage)}/yr usage`;
  return m.cost === null ? "off" : m.cost > 0 ? `${fmtMoney(m.cost)}/yr idle` : "no idle cost";
}

function costWords(m: Mark) {
  if (m.unverified) return `${m.count} the AI wasn't sure about, not counted`;
  if (m.usage !== undefined) return `${fmtMoney(m.usage)} a year to run, meant to stay on, so usage, not idle`;
  return m.cost === null ? `${m.count} seen switched off, costing nothing` : `${fmtMoney(m.cost)} a year idle for all ${m.count}`;
}

function area(b: Box) {
  return (b[2] - b[0]) * (b[3] - b[1]);
}

/**
 * The photo with its boxes burned in, as a PNG data URL: for the report, an
 * email to facilities, a slide for the school board.
 */
export async function annotatedDataUrl(photo: DetectionPhoto, labels = true): Promise<string | null> {
  const img = await loadImage(photo.dataUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);

  const lw = Math.max(2, Math.round(W / 400));
  const font = Math.max(11, Math.round(W / 70));
  ctx.font = `bold ${font}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "top";

  for (const p of placeMarks(photo)) {
    const color = markColor(p.mark);
    const x = p.box[0] * W;
    const y = p.box[1] * H;
    const w = (p.box[2] - p.box[0]) * W;
    const h = (p.box[3] - p.box[1]) * H;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
    if (labels && p.n === 0) {
      const text = `${p.mark.label} · ${tag(p.mark)}`;
      const tw = ctx.measureText(text).width + 8;
      const th = font + 6;
      const ty = y - th < 0 ? y + h : y - th;
      ctx.fillStyle = color;
      ctx.fillRect(x - lw / 2, ty, tw, th);
      ctx.fillStyle = "#000";
      ctx.fillText(text, x + 4 - lw / 2, ty + 3);
    }
  }

  // Footer stamp: what this is and where the numbers came from.
  const total = photo.offenders.reduce((s, o) => s + (o.unverified ? 0 : o.costPerYear), 0);
  const stamp = `Ghost Watt · ${photo.name} · ${fmtMoney(total)} a year idle while empty`;
  const sh = font + 12;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, H - sh, W, sh);
  ctx.fillStyle = "#ffc35a";
  ctx.fillText(stamp, 8, H - sh + 6);

  return canvas.toDataURL("image/png");
}

export async function downloadAnnotated(photo: DetectionPhoto) {
  const url = await annotatedDataUrl(photo);
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = `ghostwatt-${photo.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  a.click();
}
