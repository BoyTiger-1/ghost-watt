"use client";

// Which place the numbers are priced for: a dropdown of your places.
//
// Right-click a place (or tap its ⋯ on a phone) for Rename and Edit details.
// Both take you to that place in My places, with the name ready to type over or
// the details open, since that's where a place is looked after.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { addBuilding, newBuilding, setActiveBuilding } from "@/lib/useStore";
import { BUILDING_TYPE_BY_ID } from "@/lib/benchmark";
import type { Building } from "@/lib/storage";
import { Icon } from "./icons";

export function PlaceSelect({ buildings, activeId }: { buildings: Building[]; activeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const active = buildings.find((b) => b.id === activeId) ?? buildings[0];

  useEffect(() => {
    if (!open && !menu) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
        setMenu(null);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Close this menu without also closing the panel it sits in.
        e.stopImmediatePropagation();
        setMenu(null);
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open, menu]);

  const go = (id: string, action: "rename" | "edit") => router.push(`/places?place=${id}&action=${action}`);
  const showMenu = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const box = root.current!.getBoundingClientRect();
    // Kept inside the panel: the menu is 11.5rem wide.
    setMenu({ id, x: Math.max(0, Math.min(e.clientX - box.left, box.width - 190)), y: e.clientY - box.top });
  };

  return (
    <div ref={root} className="relative">
      <div className="flex items-stretch gap-1.5">
        <button
          onClick={() => setOpen((o) => !o)}
          onContextMenu={(e) => active && showMenu(active.id, e)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line2"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-sodium" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.98rem] font-medium text-fog">{active?.name}</span>
            <span className="block truncate text-[0.76rem] text-dim">{BUILDING_TYPE_BY_ID[active?.typeId ?? ""]?.label ?? "Place"} · {active?.regionCode}</span>
          </span>
          <Icon name="chevron" className={`h-4 w-4 shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <button
          onClick={(e) => active && showMenu(active.id, e)}
          aria-label={`Rename or edit ${active?.name}`}
          className="grid w-11 shrink-0 place-items-center rounded-2xl border border-line text-mist transition-colors hover:border-line2 hover:text-fog"
        >
          <Dots />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.3)]"
          >
            {buildings.map((b) => (
              <li key={b.id}>
                <button
                  role="option"
                  aria-selected={b.id === activeId}
                  onClick={() => {
                    setActiveBuilding(b.id);
                    setOpen(false);
                  }}
                  onContextMenu={(e) => showMenu(b.id, e)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[0.9rem] transition-colors ${
                    b.id === activeId ? "bg-fog/[0.06] text-fog" : "text-mist hover:bg-fog/[0.04] hover:text-fog"
                  }`}
                >
                  <span className="truncate">{b.name}</span>
                  {b.id === activeId && <span className="text-[0.74rem] text-dim">selected</span>}
                </button>
              </li>
            ))}
            <li className="mt-1 border-t border-line pt-1">
              <button
                onClick={() => {
                  addBuilding(newBuilding(`Place ${buildings.length + 1}`));
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[0.88rem] text-cyan hover:bg-fog/[0.04]"
              >
                + New place
              </button>
            </li>
            <li className="px-3 pb-1 pt-1.5 text-[0.72rem] text-dim">Right-click a place to rename or edit it.</li>
          </motion.ul>
        )}
      </AnimatePresence>

      {menu && (
        <div
          role="menu"
          style={{ left: menu.x, top: menu.y + 4 }}
          className="absolute z-20 w-[11.5rem] rounded-xl border border-line bg-surface p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)]"
        >
          <MenuItem onClick={() => go(menu.id, "rename")}>Rename</MenuItem>
          <MenuItem onClick={() => go(menu.id, "edit")}>Edit details</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitem" onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[0.88rem] text-fog hover:bg-fog/[0.06]">
      {children}
      <span className="text-[0.72rem] text-dim">My places →</span>
    </button>
  );
}

function Dots() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
