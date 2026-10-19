"use client";

// A panel that slides in from the right, over everything (portalled to <body>
// so the site header can't sit on top of it). Esc, the ✕ or a click outside
// closes it.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./icons";

export function Drawer({
  open,
  onClose,
  title,
  sub,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  /** Pinned to the bottom, for the panel's main action. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="no-print fixed inset-0 z-[70] bg-black/35 backdrop-blur-[2px]"
            aria-hidden
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="no-print fixed inset-y-0 right-0 z-[71] flex w-full max-w-md flex-col border-l border-line bg-ink pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-[0_0_60px_-10px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[1.1rem] font-semibold text-fog">{title}</h2>
                {sub && <p className="mt-0.5 text-[0.8rem] leading-relaxed text-dim">{sub}</p>}
              </div>
              <button onClick={onClose} aria-label="Close" className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist hover:bg-fog/[0.06] hover:text-fog">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && <div className="border-t border-line px-5 py-4">{footer}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
