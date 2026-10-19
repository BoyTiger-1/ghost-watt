"use client";

// What you added, with what was found drawn on it.
//
// Once there is something to look at, the drop zone has done its job, so this
// takes its place: the selected photo (boxes on every device) or video (the
// frames the AI read), a strip of everything added below it, and an "Add" tile
// at the end. In upload mode the whole viewer still accepts a drop or a paste.

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnnotatedPhoto, downloadAnnotated, type DetectionPhoto } from "../DetectionView";
import { fmtMoney } from "@/lib/energy";
import type { Capture } from "@/lib/capture";
import type { DeviceState, Offender } from "@/lib/types";
import { STATE_COLOR, STATE_PLAIN } from "./plain";
import { Icon } from "./icons";
import { accepted, usePastedFiles } from "./UploadMode";

export interface ViewerItem {
  capture: Capture;
  offenders: Offender[];
}

export function MediaViewer({
  items,
  selectedId,
  onSelect,
  hovered,
  onHover,
  onPick,
  onFiles,
  onClear,
  footer,
}: {
  items: ViewerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hovered: string | null;
  onHover: (id: string | null) => void;
  /** A device box was clicked. */
  onPick: (offenderId: string) => void;
  /** Present in upload mode: drop, paste and the Add tile feed it. */
  onFiles?: (files: File[]) => void;
  onClear: () => void;
  /** Shown at the foot of the panel: the selected picture's details. */
  footer?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [labels, setLabels] = useState(true);
  const [hidden, setHidden] = useState<Set<DeviceState>>(new Set());
  usePastedFiles(onFiles);

  const sel = items.find((i) => i.capture.id === selectedId) ?? items[0];
  if (!sel) return null;
  const c = sel.capture;
  const working = c.status === "working" || c.status === "pending";
  const photo: DetectionPhoto | null =
    c.kind === "photo" && c.dataUrl && c.result
      ? { id: c.id, name: c.name, dataUrl: c.dataUrl, mode: c.result.mode, engine: c.result.engine, offenders: sel.offenders, sightings: c.result.sightings }
      : null;
  const boxes = photo ? sel.offenders.flatMap((o) => (o.boxes ?? []).map(() => o.state)).concat((c.result?.sightings ?? []).flatMap((s) => s.boxes.map(() => s.state))) : [];

  const toggle = (s: DeviceState) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <section
      aria-label="Your photos and videos"
      className="panel relative overflow-hidden"
      onDragOver={
        onFiles
          ? (e) => {
              e.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={onFiles ? () => setOver(false) : undefined}
      onDrop={
        onFiles
          ? (e) => {
              e.preventDefault();
              setOver(false);
              const files = [...e.dataTransfer.files].filter(accepted);
              if (files.length) onFiles(files);
            }
          : undefined
      }
    >
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-[0.92rem] font-medium text-fog">{c.name}</div>
          <div className="text-[0.74rem] text-dim">
            {working ? (c.stage ?? "Waiting its turn") + "…" : c.status === "error" ? "Couldn't be read" : c.kind === "video" ? "Video · the frames the AI looked at" : "Tap a box to see that device"}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {photo && boxes.length > 0 && (
            <>
              <Chip on={labels} onClick={() => setLabels((v) => !v)}>
                Labels
              </Chip>
              <button
                onClick={() => downloadAnnotated(photo)}
                className="rounded-full border border-line px-2.5 py-1 text-[0.74rem] text-mist transition-colors hover:border-fog/40 hover:text-fog"
              >
                Save image
              </button>
            </>
          )}
        </div>
      </div>

      {/* the picture */}
      <div className="relative bg-black">
        {photo ? (
          <AnnotatedPhoto photo={photo} hovered={hovered} onHover={onHover} onPick={onPick} showLabels={labels} hidden={hidden} />
        ) : c.kind === "video" ? (
          <VideoFrames key={c.id} capture={c} />
        ) : c.dataUrl ? (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.dataUrl} alt={c.name} className={`block h-auto max-h-[70vh] w-auto max-w-full ${working ? "opacity-60" : ""}`} />
          </div>
        ) : (
          <div className="grid aspect-[4/3] place-items-center text-white/60">
            <Icon name="camera" className="h-8 w-8" />
          </div>
        )}

        {working && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-sodium scan-line" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10">
              <div className="flex items-center gap-2 text-[0.82rem] text-white">
                <span className="inline-block h-2 w-2 rounded-full bg-sodium pulse-dot" aria-hidden />
                {c.stage ?? "Waiting its turn"}…
              </div>
              {c.progress !== undefined && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
                  <motion.div className="h-full bg-sodium" animate={{ width: `${Math.round(c.progress * 100)}%` }} transition={{ ease: "easeOut", duration: 0.5 }} />
                </div>
              )}
            </div>
          </div>
        )}

        <AnimatePresence>
          {over && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60 text-[1rem] font-medium text-white"
            >
              Drop to add
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* what the colours mean, and a way to hide one */}
      {photo && boxes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3.5 py-2">
          {(Object.keys(STATE_COLOR) as DeviceState[]).map((s) => {
            const n = boxes.filter((b) => b === s).length;
            if (!n) return null;
            return (
              <Chip key={s} on={!hidden.has(s)} onClick={() => toggle(s)} color={STATE_COLOR[s]}>
                {STATE_PLAIN[s]} · {n}
              </Chip>
            );
          })}
        </div>
      )}

      {/* everything added */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {items.map(({ capture: x, offenders }) => {
            const active = x.id === sel.capture.id;
            const thumb = x.keyframes?.[0]?.annotated ?? x.dataUrl;
            const busy = x.status === "working" || x.status === "pending";
            const cost = offenders.reduce((s, o) => s + (o.unverified ? 0 : o.costPerYear), 0);
            return (
              <button
                key={x.id}
                onClick={() => onSelect(x.id)}
                aria-pressed={active}
                aria-label={`${x.name}${busy ? ", still reading" : x.status === "error" ? ", couldn't be read" : `, ${fmtMoney(cost)} a year wasted`}`}
                className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-surface2 ring-2 transition ${active ? "ring-fog" : "ring-transparent hover:ring-line2"}`}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-dim">
                    <Icon name={x.kind === "video" ? "video" : "camera"} className="h-5 w-5" />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-px text-center text-[0.62rem] font-medium text-white">
                  {busy ? "reading…" : x.status === "error" ? "error" : x.result ? fmtMoney(cost) + "/yr" : ""}
                </span>
                {x.kind === "video" && <Icon name="video" className="absolute left-1 top-1 h-3.5 w-3.5 text-white drop-shadow" />}
              </button>
            );
          })}
          {onFiles && (
            <button
              onClick={() => inputRef.current?.click()}
              className="grid h-16 w-20 shrink-0 place-items-center rounded-xl border-2 border-dashed border-line2 text-mist transition-colors hover:border-fog/40 hover:text-fog"
            >
              <span className="flex flex-col items-center gap-0.5 text-[0.72rem] font-medium">
                <Icon name="upload" className="h-4 w-4" />
                Add
              </span>
            </button>
          )}
        </div>
        <button onClick={onClear} className="shrink-0 rounded-full px-2.5 py-1.5 text-[0.74rem] text-dim hover:text-ember">
          Clear all
        </button>
      </div>

      {footer}

      {onFiles && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])].filter(accepted);
            if (files.length) onFiles(files);
            e.target.value = "";
          }}
        />
      )}
    </section>
  );
}

/** A video: the frames the AI read, one at a time, with the clip itself a tap away. */
function VideoFrames({ capture: c }: { capture: Capture }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frames = c.keyframes ?? [];
  const n = frames.length;
  const k = frames[Math.min(i, n - 1)];

  if (playing && c.videoUrl) {
    return (
      <div className="relative">
        <video src={c.videoUrl} controls autoPlay playsInline className="mx-auto block max-h-[70vh] w-full bg-black" />
        <button onClick={() => setPlaying(false)} className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[0.76rem] text-white">
          Back to frames
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex justify-center">
      {k ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={k.annotated ?? k.dataUrl} alt={`${c.name}, frame at ${k.t.toFixed(1)} seconds`} className="block h-auto max-h-[70vh] w-auto max-w-full" />
      ) : (
        <div className="grid aspect-video w-full place-items-center text-white/60">
          <Icon name="video" className="h-8 w-8" />
        </div>
      )}
      {n > 1 && (
        <>
          <button
            onClick={() => setI((v) => (v - 1 + n) % n)}
            aria-label="Previous frame"
            className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
          >
            <Icon name="chevron" className="h-4 w-4 rotate-90" />
          </button>
          <button
            onClick={() => setI((v) => (v + 1) % n)}
            aria-label="Next frame"
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
          >
            <Icon name="chevron" className="h-4 w-4 -rotate-90" />
          </button>
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-8 text-[0.76rem] text-white">
        <span>{n ? `Frame ${Math.min(i, n - 1) + 1} of ${n}` : "No frames yet"}</span>
        {c.videoUrl && (
          <button onClick={() => setPlaying(true)} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">
            <Icon name="play" className="h-3.5 w-3.5" />
            Play clip
          </button>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, color, children }: { on: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.74rem] transition-colors ${
        on ? "border-line2 text-fog" : "border-line text-dim line-through"
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: on ? color : "transparent", border: `1px solid ${color}` }} />}
      {children}
    </button>
  );
}
