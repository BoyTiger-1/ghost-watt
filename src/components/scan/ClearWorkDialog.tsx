"use client";

// "Start fresh?" Asked before anything is deleted, with the choice of how much.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

export function ClearWorkDialog({
  open,
  count,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Pictures in the current work. */
  count: number;
  onCancel: () => void;
  onConfirm: (everything: boolean) => void;
}) {
  const [everything, setEverything] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="clear"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="no-print fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]"
          onClick={onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-title"
            aria-describedby="clear-body"
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[1.4rem] border border-line bg-ink p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]"
          >
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ember/10 text-ember">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
              </svg>
            </div>
            <h2 id="clear-title" className="mt-4 text-[1.2rem] font-semibold text-fog">
              Clear your current work?
            </h2>
            <div id="clear-body" className="mt-2 space-y-2 text-[0.9rem] leading-relaxed text-mist">
              <p>
                {`This removes the ${count === 1 ? "picture" : `${count} pictures`} on this page, what was found in ${count === 1 ? "it" : "them"},`} your corrections and your report notes. It
                can&apos;t be undone.
              </p>
              <p className="text-[0.84rem] text-dim">Rooms already saved to My places stay there.</p>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3.5 py-3 text-[0.86rem] text-mist transition-colors hover:border-line2">
              <input type="checkbox" checked={everything} onChange={(e) => setEverything(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-ember)]" />
              <span>
                <span className="font-medium text-fog">Also erase everything else on this device</span>
                <span className="mt-0.5 block text-[0.8rem] text-dim">Your places, saved rooms, fix checklist, team code and settings.</span>
              </span>
            </label>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={onCancel} className="rounded-full border border-line px-5 py-2.5 text-[0.9rem] text-fog transition-colors hover:border-fog/40">
                Keep my work
              </button>
              <button
                onClick={() => onConfirm(everything)}
                autoFocus
                className="rounded-full bg-ember px-5 py-2.5 text-[0.9rem] font-medium text-white transition-opacity hover:opacity-90"
              >
                {everything ? "Erase everything" : "Clear current work"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
