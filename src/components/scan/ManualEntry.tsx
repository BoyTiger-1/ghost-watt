"use client";

// Type it in: a room's devices without a camera. For anyone who can't take a
// picture, or who knows exactly what's there - "6 desktops, a projector, the
// mini fridge". Every device in the catalog is searchable; anything that isn't
// can still be added by name with the watts off its label. The result is an
// ordinary scan, so pricing, fixes, Ghosty, reports, teams and stickers all work.

import { useMemo, useState } from "react";
import { Drawer } from "./Drawer";
import { DEVICE_CATALOG } from "@/lib/devices";
import { ROOM_TYPES } from "@/lib/rooms";
import type { CategorizedObservation } from "@/lib/parse";
import type { DeviceCategory, DeviceState } from "@/lib/types";
import { DeviceGlyph } from "../DeviceGlyph";

interface Line {
  key: string;
  categoryId: string;
  label: string;
  count: number;
  state: DeviceState;
  watts?: number;
}

const SEARCHABLE = DEVICE_CATALOG.filter((c) => c.id !== "other_device");

/** Best matches for what's typed: a whole-name hit first, then names that start with it, then anywhere. */
export function searchCatalog(query: string, limit = 8): DeviceCategory[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { c: DeviceCategory; s: number }[] = [];
  for (const c of SEARCHABLE) {
    let s = 0;
    for (const name of [c.label.toLowerCase(), ...c.keywords]) {
      const v = name === q ? 100 : name.startsWith(q) ? 60 - name.length * 0.1 : name.includes(q) ? 30 - name.length * 0.1 : 0;
      if (v > s) s = v;
    }
    if (s > 0) scored.push({ c, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.c);
}

export function ManualEntry({
  open,
  onClose,
  defaultRoom,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  defaultRoom: string;
  onAdd: (room: string, roomType: string, observations: CategorizedObservation[]) => void;
}) {
  const [room, setRoom] = useState("");
  const [roomType, setRoomType] = useState("unknown");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customWatts, setCustomWatts] = useState("");
  const results = useMemo(() => searchCatalog(query), [query]);

  const addLine = (categoryId: string, label: string, watts?: number) => {
    setLines((prev) => {
      const same = prev.find((l) => l.categoryId === categoryId && l.label === label && categoryId !== "other_device");
      if (same) return prev.map((l) => (l === same ? { ...l, count: l.count + 1 } : l));
      return [...prev, { key: `${categoryId}-${prev.length}-${label}`, categoryId, label, count: 1, state: "on", ...(watts ? { watts } : {}) }];
    });
    setQuery("");
    setCustomWatts("");
  };

  const patch = (key: string, p: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const save = () => {
    if (!lines.length) return;
    const observations: CategorizedObservation[] = lines.map((l) => ({
      device: l.label,
      categoryId: l.categoryId,
      count: l.count,
      state: l.state,
      confidence: 1,
      ...(l.watts ? { userWatts: l.watts } : {}),
      evidence: "entered by hand",
    }));
    onAdd(room.trim() || defaultRoom, roomType, observations);
    setLines([]);
    setRoom("");
    setRoomType("unknown");
    onClose();
  };

  const typed = query.trim();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Type it in"
      sub="No camera needed. Add what's in the room and it's priced the same way a photo is."
      footer={
        <button
          type="button"
          onClick={save}
          disabled={!lines.length}
          className="w-full rounded-full bg-fog py-3 text-[0.95rem] font-medium text-ink transition-opacity hover:bg-fog/85 disabled:opacity-40"
        >
          {lines.length ? `Add ${lines.reduce((s, l) => s + l.count, 0)} device${lines.reduce((s, l) => s + l.count, 0) === 1 ? "" : "s"} to the scan` : "Add devices first"}
        </button>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[0.85rem] font-medium text-fog">Room</span>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder={defaultRoom}
              maxLength={40}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.92rem] text-fog outline-none placeholder:text-dim focus:border-cyan"
            />
          </label>
          <label className="block">
            <span className="text-[0.85rem] font-medium text-fog">Kind of room</span>
            <select
              value={roomType}
              onChange={(e) => setRoomType(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[0.92rem] text-fog outline-none focus:border-cyan"
            >
              {ROOM_TYPES.map((r) => (
                <option key={r.id} value={r.id === "other" ? "unknown" : r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <label className="block">
            <span className="text-[0.85rem] font-medium text-fog">Find a device</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  e.preventDefault();
                  addLine(results[0].id, results[0].label);
                }
              }}
              placeholder="Try “projector”, “air fryer”, “space heater”…"
              aria-label="Search devices"
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-fog outline-none placeholder:text-dim focus:border-cyan"
            />
          </label>
          {typed.length >= 2 && (
            <ul className="mt-2 overflow-hidden rounded-xl border border-line">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => addLine(c.id, c.label)}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-fog/[0.04]"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface2 text-mist">
                      <DeviceGlyph icon={c.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.9rem] text-fog">{c.label}</span>
                    <span className="shrink-0 text-[0.76rem] text-dim">~{c.wattsOn >= 1000 ? `${(c.wattsOn / 1000).toFixed(1)} kW` : `${c.wattsOn} W`}</span>
                  </button>
                </li>
              ))}
              <li className="border-t border-line bg-surface2/40 px-3.5 py-3">
                <p className="text-[0.82rem] text-mist">
                  {results.length ? "Not on the list?" : "No match."} Add <span className="font-medium text-fog">“{typed}”</span> as its own device:
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={customWatts}
                    onChange={(e) => setCustomWatts(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="Watts (on its label)"
                    aria-label="Watts"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[0.88rem] text-fog outline-none focus:border-cyan"
                  />
                  <button
                    type="button"
                    disabled={!(Number(customWatts) > 0)}
                    onClick={() => addLine("other_device", typed.charAt(0).toUpperCase() + typed.slice(1, 60), Number(customWatts))}
                    className="shrink-0 rounded-lg bg-fog px-3.5 py-2 text-[0.85rem] font-medium text-ink disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </li>
            </ul>
          )}
        </section>

        {lines.length > 0 && (
          <section>
            <h3 className="text-[0.85rem] font-medium text-fog">In this room</h3>
            <ul className="mt-2 space-y-2">
              {lines.map((l) => (
                <li key={l.key} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[0.92rem] font-medium text-fog">{l.label}</span>
                    <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="text-[0.78rem] text-dim hover:text-ember">
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-full border border-line">
                      <button type="button" aria-label="Fewer" onClick={() => patch(l.key, { count: Math.max(1, l.count - 1) })} className="px-3 py-1 text-fog">
                        −
                      </button>
                      <input
                        value={l.count}
                        onChange={(e) => patch(l.key, { count: Math.max(1, Math.min(500, Number(e.target.value.replace(/\D/g, "")) || 1)) })}
                        aria-label="How many"
                        inputMode="numeric"
                        className="w-10 bg-transparent text-center text-[0.9rem] tabular-nums text-fog outline-none"
                      />
                      <button type="button" aria-label="More" onClick={() => patch(l.key, { count: Math.min(500, l.count + 1) })} className="px-3 py-1 text-fog">
                        +
                      </button>
                    </div>
                    <div className="flex rounded-full bg-fog/[0.05] p-0.5" role="radiogroup" aria-label="State">
                      {(["on", "standby", "off"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={l.state === s}
                          onClick={() => patch(l.key, { state: s })}
                          className={`rounded-full px-2.5 py-1 text-[0.78rem] transition-colors ${l.state === s ? "bg-surface text-fog shadow-sm" : "text-dim"}`}
                        >
                          {s === "standby" ? "asleep" : s}
                        </button>
                      ))}
                    </div>
                    <input
                      value={l.watts ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/[^\d.]/g, ""));
                        patch(l.key, { watts: n > 0 ? n : undefined });
                      }}
                      inputMode="decimal"
                      placeholder="watts (optional)"
                      aria-label="Watts, if you know them"
                      className="w-32 rounded-full border border-line bg-transparent px-3 py-1 text-[0.8rem] text-fog outline-none focus:border-cyan"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-[0.78rem] leading-relaxed text-dim">
          &quot;Asleep&quot; means plugged in with a light or clock showing. Watts are optional: they&apos;re on the label or charger, and they beat
          the typical figure.
        </p>
      </div>
    </Drawer>
  );
}
