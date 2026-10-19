"use client";

// The ⋯ button: the things you need now and then, kept out of the way.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface MoreItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function MoreMenu({ items }: { items: MoreItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={root} className="relative" data-tour="help">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        className="grid h-10 w-10 place-items-center rounded-full bg-fog/[0.06] text-mist transition-colors hover:bg-fog/[0.1] hover:text-fog"
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full z-40 mt-1.5 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.3)]"
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`block w-full rounded-xl px-3.5 py-2.5 text-left text-[0.9rem] transition-colors hover:bg-fog/[0.05] ${it.danger ? "text-ember" : "text-fog"}`}
              >
                {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
