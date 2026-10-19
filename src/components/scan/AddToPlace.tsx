"use client";

// Add to place: the one step that saves a scan.
//
// Nothing is kept in My places until you say where it belongs. Pick a place
// (or make one), name each room, and they're saved there, where they join the
// place's to-do list and totals. Saving again moves or renames a room rather
// than duplicating it.

import { useState } from "react";
import { fmtMoney } from "@/lib/energy";
import type { Building } from "@/lib/storage";
import { Drawer } from "./Drawer";

export interface AddItem {
  captureId: string;
  name: string;
  thumb?: string;
  wastePerYear: number;
  /** Where it's already saved, if it is. */
  savedIn?: { buildingId: string; room: string };
}

const KINDS = [
  { id: "home", label: "Home" },
  { id: "k12", label: "School" },
  { id: "office", label: "Office" },
] as const;

export function AddToPlace({
  open,
  onClose,
  buildings,
  activeId,
  roomCounts,
  items,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  buildings: Building[];
  activeId: string;
  /** Rooms already saved in each place. */
  roomCounts: Record<string, number>;
  items: AddItem[];
  onAdd: (target: { buildingId: string } | { newPlace: { name: string; typeId: string } }, rooms: { captureId: string; room: string }[]) => void;
}) {
  const [target, setTarget] = useState<string>(activeId);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<string>("home");
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});

  const chosen = items.filter((i) => !skip.has(i.captureId));
  const isNew = target === "new";
  const targetName = isNew ? newName.trim() || "your new place" : (buildings.find((b) => b.id === target)?.name ?? "this place");
  const ready = chosen.length > 0 && (!isNew || newName.trim().length > 0);

  const submit = () => {
    if (!ready) return;
    onAdd(
      isNew ? { newPlace: { name: newName.trim(), typeId: newKind } } : { buildingId: target },
      chosen.map((i) => ({ captureId: i.captureId, room: (names[i.captureId] ?? i.savedIn?.room ?? i.name).trim() || i.name })),
    );
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add to a place"
      sub="Save these rooms to My places, where you'll see which room wastes the most, tick off fixes, and check they worked."
      footer={
        <button
          onClick={submit}
          disabled={!ready}
          className="w-full rounded-full bg-fog px-5 py-3 text-[0.95rem] font-medium text-ink transition-colors hover:bg-fog/85 disabled:opacity-40"
        >
          {chosen.length ? `Add ${chosen.length} room${chosen.length === 1 ? "" : "s"} to ${targetName}` : "Pick at least one room"}
        </button>
      }
    >
      <div className="space-y-7">
        <section>
          <h3 className="text-[0.92rem] font-medium text-fog">1. Which place?</h3>
          <div className="mt-2.5 space-y-2" role="radiogroup">
            {buildings.map((b) => (
              <Choice key={b.id} on={target === b.id} onClick={() => setTarget(b.id)}>
                <span className="min-w-0 flex-1 truncate text-[0.95rem] text-fog">{b.name}</span>
                <span className="text-[0.76rem] text-dim">
                  {roomCounts[b.id] ?? 0} room{(roomCounts[b.id] ?? 0) === 1 ? "" : "s"}
                </span>
              </Choice>
            ))}
            <Choice on={isNew} onClick={() => setTarget("new")}>
              <span className="text-[0.95rem] text-cyan">+ A new place</span>
            </Choice>
            {isNew && (
              <div className="space-y-2.5 rounded-2xl border border-line px-4 py-3.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name it, e.g. Our house"
                  maxLength={60}
                  className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-fog outline-none placeholder:text-dim/60 focus:border-cyan"
                />
                <div className="flex gap-1.5">
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setNewKind(k.id)}
                      aria-pressed={newKind === k.id}
                      className={`flex-1 rounded-full px-3 py-1.5 text-[0.84rem] transition-colors ${newKind === k.id ? "bg-fog text-ink" : "bg-fog/[0.05] text-mist hover:text-fog"}`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-[0.92rem] font-medium text-fog">2. Name each room</h3>
          <p className="mt-0.5 text-[0.8rem] text-dim">Use the same name when you scan a room again, and you&apos;ll see a before and after.</p>
          <ul className="mt-2.5 space-y-2">
            {items.map((i) => {
              const on = !skip.has(i.captureId);
              const saved = i.savedIn && buildings.find((b) => b.id === i.savedIn!.buildingId);
              return (
                <li key={i.captureId} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${on ? "border-line2" : "border-line opacity-55"}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setSkip((prev) => {
                        const next = new Set(prev);
                        if (next.has(i.captureId)) next.delete(i.captureId);
                        else next.add(i.captureId);
                        return next;
                      })
                    }
                    aria-label={`Include ${i.name}`}
                    className="h-4 w-4 shrink-0 accent-[var(--color-fog)]"
                  />
                  {i.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.thumb} alt="" className="h-11 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="h-11 w-12 shrink-0 rounded-lg bg-surface2" />
                  )}
                  <span className="min-w-0 flex-1">
                    <input
                      value={names[i.captureId] ?? i.savedIn?.room ?? i.name}
                      onChange={(e) => setNames((n) => ({ ...n, [i.captureId]: e.target.value }))}
                      aria-label="Room name"
                      maxLength={60}
                      className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[0.92rem] text-fog outline-none hover:border-line focus:border-cyan"
                    />
                    <span className="block px-1.5 text-[0.74rem] text-dim">
                      {fmtMoney(i.wastePerYear)}/yr wasted{saved ? ` · already in ${saved.name}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${on ? "border-fog bg-fog/[0.04]" : "border-line hover:border-line2"}`}
    >
      <span className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-fog" : "border-line2"}`} aria-hidden>
        {on && <span className="h-2 w-2 rounded-full bg-fog" />}
      </span>
      {children}
    </button>
  );
}
