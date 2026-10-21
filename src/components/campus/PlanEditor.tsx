"use client";

// Mark the rooms on a floor plan. Drag on empty space to draw a room, drag a
// room to move it, drag its corner to resize, click it to rename or delete.
// "Suggest rooms" asks the AI to find them first; nothing is kept that the
// person doesn't see.

import { useRef, useState } from "react";
import { campusId, type Floor, type PlanRoom } from "@/lib/campus";

type Drag =
  | { kind: "draw"; x0: number; y0: number; id: string }
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "resize"; id: string };

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function PlanEditor({
  floor,
  knownRooms,
  onChange,
}: {
  floor: Floor;
  /** Names of rooms already scanned, offered when naming. */
  knownRooms: string[];
  onChange: (rooms: PlanRoom[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  /** Put the cursor in the name box once a drag ends: the browser moves focus on mouse-up. */
  const focusName = () => setTimeout(() => nameBox.current?.focus(), 0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rooms = floor.rooms;

  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)] as const;
  };

  const set = (id: string, patch: Partial<PlanRoom>) => onChange(rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const suggest = async () => {
    if (!floor.plan) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/plan-rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: floor.plan.dataUrl }) });
      const json = (await res.json()) as { rooms?: PlanRoom[]; error?: string };
      if (!res.ok || !json.rooms) throw new Error(json.error ?? "The AI couldn't read this plan.");
      if (!json.rooms.length) setNote("No rooms found. Draw them by hand: drag across each room.");
      else {
        onChange([...rooms, ...json.rooms.map((r) => ({ ...r, id: campusId("s") }))]);
        setNote(`Added ${json.rooms.length} suggested rooms. Check each name and box; delete any that are wrong.`);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The AI couldn't read this plan.");
    } finally {
      setBusy(false);
    }
  };

  const sel = rooms.find((r) => r.id === selected) ?? null;

  if (!floor.plan) return null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={suggest}
          disabled={busy}
          className="rounded-full bg-fog px-3.5 py-1.5 text-[0.8rem] font-medium text-ink disabled:opacity-50"
        >
          {busy ? "Reading the plan…" : "Suggest rooms with AI"}
        </button>
        <span className="text-[0.76rem] text-dim">or drag across a room to draw it</span>
        {rooms.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="ml-auto text-[0.76rem] text-dim hover:text-ember">
            Clear all rooms
          </button>
        )}
      </div>
      {note && <p className="mb-2 text-[0.78rem] text-mist">{note}</p>}

      <div
        ref={box}
        className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-line bg-white"
        style={{ aspectRatio: String(floor.plan.aspect) }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.plan) return;
          const [x, y] = at(e);
          const id = campusId("r");
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDrag({ kind: "draw", x0: x, y0: y, id });
          onChange([...rooms, { id, name: "", x, y, w: 0, h: 0 }]);
          setSelected(id);
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const [x, y] = at(e);
          if (drag.kind === "draw") set(drag.id, { x: Math.min(drag.x0, x), y: Math.min(drag.y0, y), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) });
          else if (drag.kind === "move") {
            const r = rooms.find((q) => q.id === drag.id)!;
            set(drag.id, { x: clamp(x - drag.dx), y: clamp(y - drag.dy), w: Math.min(r.w, 1 - clamp(x - drag.dx)), h: Math.min(r.h, 1 - clamp(y - drag.dy)) });
          } else {
            const r = rooms.find((q) => q.id === drag.id)!;
            set(drag.id, { w: Math.max(0.01, x - r.x), h: Math.max(0.01, y - r.y) });
          }
        }}
        onPointerUp={() => {
          if (drag?.kind === "draw") {
            const r = rooms.find((q) => q.id === drag.id);
            // A click, not a drag: drop the empty room.
            if (r && (r.w < 0.01 || r.h < 0.01)) {
              onChange(rooms.filter((q) => q.id !== drag.id));
              setSelected(null);
            } else focusName();
          } else if (drag) focusName();
          setDrag(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={floor.plan.dataUrl} alt={`${floor.name} floor plan`} data-plan="1" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
        <div data-plan="1" className="absolute inset-0" />
        {rooms.map((r) => {
          const on = r.id === selected;
          return (
            <div
              key={r.id}
              className={`absolute rounded-[3px] border-2 ${on ? "border-ember bg-ember/20" : "border-cyan bg-cyan/15"} ${r.name ? "" : "border-dashed"}`}
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const [x, y] = at(e);
                box.current!.setPointerCapture(e.pointerId);
                setSelected(r.id);
                setDrag({ kind: "move", id: r.id, dx: x - r.x, dy: y - r.y });
              }}
            >
              <span className="pointer-events-none absolute left-1 top-0.5 max-w-full truncate rounded bg-white/85 px-1 text-[10px] font-semibold text-[#1c1b18]">
                {r.name || "name me"}
              </span>
              <span
                className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-full border-2 border-white bg-ember"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  box.current!.setPointerCapture(e.pointerId);
                  setSelected(r.id);
                  setDrag({ kind: "resize", id: r.id });
                }}
              />
            </div>
          );
        })}
      </div>

      {sel && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2.5">
          <span className="text-[0.8rem] text-mist">Room name</span>
          {/* Keyed by room, so a newly drawn room's name box takes focus every time. */}
          <input
            key={sel.id}
            ref={nameBox}
            autoFocus
            value={sel.name}
            onKeyDown={(e) => e.key === "Enter" && setSelected(null)}
            onChange={(e) => set(sel.id, { name: e.target.value.slice(0, 40) })}
            list="campus-known-rooms"
            placeholder="e.g. Room 214"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3 py-1 text-[0.86rem] text-fog outline-none focus:border-cyan"
          />
          <datalist id="campus-known-rooms">
            {knownRooms.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => {
              onChange(rooms.filter((r) => r.id !== sel.id));
              setSelected(null);
            }}
            className="rounded-full px-3 py-1 text-[0.8rem] text-dim hover:text-ember"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
