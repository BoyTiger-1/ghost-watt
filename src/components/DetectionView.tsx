"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { fmtMoney } from "@/lib/energy";
import { loadImage } from "@/lib/image";
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

// State, not device type, picks the colour: what a facilities manager needs from
// the photo at a glance is which things are burning power, not which are monitors.
const STATE_COLOR: Record<DeviceState, string> = {
  on: "#ff6a5c",
  standby: "#ffb24d",
  off: "#7d8799",
};

const STATE_WORD: Record<DeviceState, string> = {
  on: "on",
  standby: "standby",
  off: "off",
};

/** One thing drawn on the photo: a costed offender, or a device seen switched off. */
interface Mark {
  id: string;
  label: string;
  state: DeviceState;
  count: number;
  /** Null for a sighting: off devices are not costed. */
  cost: number | null;
}

interface Placed {
  key: string;
  box: Box;
  mark: Mark;
  /** Index of this box within its mark, for the label and the stagger. */
  n: number;
}

/** Offender card anchor, shared with OffenderCard so a box click can scroll to it. */
export const offenderAnchor = (id: string) => `offender-${id}`;

export function DetectionView({
  photos,
  hovered,
  onHover,
}: {
  photos: DetectionPhoto[];
  hovered: string | null;
  onHover: (id: string | null) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [hidden, setHidden] = useState<Set<DeviceState>>(new Set());
  const reduceMotion = useReducedMotion();

  const photo = photos.find((p) => p.id === activeId) ?? photos[0];

  const placed = useMemo<Placed[]>(() => {
    if (!photo) return [];
    const out: Placed[] = [];
    for (const o of photo.offenders) {
      const mark: Mark = { id: o.id, label: o.label, state: o.state, count: o.count, cost: o.costPerYear };
      (o.boxes ?? []).forEach((box, n) => out.push({ key: `${o.id}-${n}`, box, mark, n }));
    }
    for (const [i, s] of (photo.sightings ?? []).entries()) {
      const mark: Mark = { id: `sighting-${i}`, label: s.label, state: s.state, count: s.count, cost: null };
      s.boxes.forEach((box, n) => out.push({ key: `${mark.id}-${n}`, box, mark, n }));
    }
    // Big boxes first, so small ones drawn later sit on top and stay hoverable.
    return out.sort((a, b) => area(b.box) - area(a.box));
  }, [photo]);

  if (!photo) return null;

  const visible = placed.filter((p) => !hidden.has(p.mark.state));
  const located = placed.length;
  const counted =
    photo.offenders.reduce((s, o) => s + o.count, 0) +
    (photo.sightings ?? []).reduce((s, o) => s + o.count, 0);
  const isLive = photo.mode === "live";

  function toggleState(s: DeviceState) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function jumpTo(id: string) {
    if (id.startsWith("sighting-")) return;
    document
      .getElementById(offenderAnchor(id))
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel ticked overflow-hidden"
      aria-label="Where each device was seen"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="mono-label text-cyan">detections</span>
          <span className="truncate font-mono text-[0.68rem] text-dim">
            {photo.name} · {photo.engine}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ToggleChip on={showLabels} onClick={() => setShowLabels((v) => !v)}>
            labels
          </ToggleChip>
          <button
            onClick={() => downloadAnnotated(photo, visible, showLabels)}
            disabled={!located}
            className="border border-line px-2.5 py-1 text-[0.75rem] text-mist transition-colors enabled:hover:border-cyan enabled:hover:text-cyan disabled:opacity-40"
          >
            save png
          </button>
        </div>
      </div>

      {photos.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-line px-4 py-2.5">
          {photos.map((p) => {
            const n =
              p.offenders.reduce((s, o) => s + (o.boxes?.length ?? 0), 0) +
              (p.sightings ?? []).reduce((s, o) => s + o.boxes.length, 0);
            const active = p.id === photo.id;
            return (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-2 border px-1.5 py-1 transition-colors ${
                  active ? "border-cyan" : "border-line hover:border-line2"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" className="h-7 w-10 object-cover" />
                <span className={`font-mono text-[0.66rem] ${active ? "text-fog" : "text-dim"}`}>
                  {p.name} · {n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.dataUrl}
          alt={`${photo.name}, with detected devices marked`}
          className="block h-auto w-full select-none"
          draggable={false}
        />

        {/* Faint grid while boxes draw in: reads as "measured", not decorated. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#2fe6cf 1px, transparent 1px), linear-gradient(90deg, #2fe6cf 1px, transparent 1px)",
            backgroundSize: "10% 10%",
          }}
        />

        <AnimatePresence>
          {visible.map((p, i) => {
            const color = STATE_COLOR[p.mark.state];
            const isHot = hovered === p.mark.id;
            const dimmed = hovered !== null && !isHot;
            const [x1, y1, x2, y2] = p.box;
            const labelBelow = y1 < 0.07;
            // Boxes near the right edge hang their label leftwards, so it stays on the photo.
            const labelRight = x1 > 0.55;
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
                onClick={() => jumpTo(p.mark.id)}
                aria-label={`${p.mark.label}, ${STATE_WORD[p.mark.state]}, ${costWords(p.mark)}`}
                className="absolute cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan"
                style={{
                  left: `${x1 * 100}%`,
                  top: `${y1 * 100}%`,
                  width: `${(x2 - x1) * 100}%`,
                  height: `${(y2 - y1) * 100}%`,
                  background: isHot ? `${color}22` : "transparent",
                  boxShadow: `inset 0 0 0 1px ${color}${isHot ? "ff" : "66"}`,
                  zIndex: isHot ? 20 : 10,
                }}
              >
                <Corners color={color} thick={isHot} />
                {showLabels && (p.n === 0 || isHot) && (
                  <span
                    className={`pointer-events-none absolute ${labelRight ? "right-[-1px]" : "left-[-1px]"} whitespace-nowrap px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-black sm:text-[0.66rem] ${
                      labelBelow ? "top-full mt-px" : "bottom-full mb-px"
                    }`}
                    style={{ background: color }}
                  >
                    {p.mark.label.toLowerCase()}
                    {p.n === 0 ? ` · ${tag(p.mark)}` : ""}
                  </span>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>

        {!located && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-10">
            <p className="font-mono text-[0.7rem] leading-relaxed text-mist">
              {isLive
                ? "This engine counted the devices but did not say where they are, so nothing is marked. A hosted model (Groq, Claude, OpenAI) reports locations."
                : "No live reading for this photo - the counts are a room-profile estimate, so there is nothing to mark on it."}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(STATE_COLOR) as DeviceState[]).map((s) => {
            const n = placed.filter((p) => p.mark.state === s).length;
            if (!n) return null;
            return (
              <ToggleChip key={s} on={!hidden.has(s)} onClick={() => toggleState(s)} color={STATE_COLOR[s]}>
                {STATE_WORD[s]} · {n}
              </ToggleChip>
            );
          })}
        </div>
        {located > 0 && (
          <span
            className="font-mono text-[0.66rem] text-dim"
            title="The model marks the units it can see clearly. Costs always use the full count."
          >
            {located} of {counted} units located · costs use the full count
          </span>
        )}
      </div>
    </motion.section>
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

function ToggleChip({
  on,
  onClick,
  color,
  children,
}: {
  on: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-1.5 border px-2.5 py-1 text-[0.75rem] transition-colors ${
        on ? "border-line2 text-fog" : "border-line text-dim line-through"
      }`}
    >
      {color && <span className="h-2 w-2" style={{ background: on ? color : "transparent", border: `1px solid ${color}` }} />}
      {children}
    </button>
  );
}

function tag(m: Mark) {
  return m.cost === null ? `off ×${m.count}` : `${fmtMoney(m.cost)}/yr`;
}

function costWords(m: Mark) {
  return m.cost === null
    ? `${m.count} seen switched off, costing nothing`
    : `${fmtMoney(m.cost)} a year for all ${m.count}`;
}

function area(b: Box) {
  return (b[2] - b[0]) * (b[3] - b[1]);
}

/**
 * Burn the boxes into a PNG, so the evidence survives outside the app - in an
 * email to facilities, a slide for the school board, a work order.
 */
async function downloadAnnotated(photo: DetectionPhoto, placed: Placed[], labels: boolean) {
  const img = await loadImage(photo.dataUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(img, 0, 0);

  const lw = Math.max(2, Math.round(W / 400));
  const font = Math.max(11, Math.round(W / 70));
  ctx.font = `bold ${font}px ui-monospace, monospace`;
  ctx.textBaseline = "top";

  for (const p of placed) {
    const color = STATE_COLOR[p.mark.state];
    const x = p.box[0] * W;
    const y = p.box[1] * H;
    const w = (p.box[2] - p.box[0]) * W;
    const h = (p.box[3] - p.box[1]) * H;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
    if (labels && p.n === 0) {
      const text = `${p.mark.label.toLowerCase()} · ${tag(p.mark)}`;
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
  const total = photo.offenders.reduce((s, o) => s + o.costPerYear, 0);
  const stamp = `GhostWatt · ${photo.name} · ${fmtMoney(total)}/yr phantom load · ${photo.engine}`;
  const sh = font + 12;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, H - sh, W, sh);
  ctx.fillStyle = "#2fe6cf";
  ctx.fillText(stamp, 8, H - sh + 6);

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `ghostwatt-${photo.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  a.click();
}
