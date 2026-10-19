"use client";

// A first-visit walk around the scanner: six short steps, each pointing at the
// thing it explains. It opens by itself once, closes with one click (or Esc),
// and the ? button brings it back.

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

export const TOUR_KEY = "gw-tour-done";

interface Step {
  /** data-tour value of the thing to point at; none for a centred card. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome to Ghost Watt",
    body: "Lots of things keep using electricity when nobody's around: screens, chargers, lights, printers. Ghost Watt spots them in a photo and tells you what they cost and how to stop it. This takes a minute.",
  },
  {
    target: "mode",
    title: "Camera or upload",
    body: "Point your camera at a room, or upload photos and videos you already have. Either works.",
  },
  {
    target: "add",
    title: "Add a picture",
    body: "Each device we find gets a box on the photo. Next to it you'll get the short version: what it all costs a year, what's wasted, and what you could save.",
  },
  {
    target: "settings",
    title: "Where you are, and your price",
    body: "This shows the kind of place (home, school or office) and what electricity costs there. Tap it to change either, or type in the price from your bill for exact numbers.",
  },
  {
    target: "places",
    title: "Keep track in My places",
    body: "Happy with a scan? Tap Add to place to save its rooms to a place like your home. My places then gives you one to-do list for every room, and checks your fixes worked.",
  },
  {
    target: "help",
    title: "That's it",
    body: "Your work is saved on this device as you go. Open this tour again any time from this ⋯ menu.",
  },
];

/** The on-screen element for a step, the visible one when there are two (desktop and phone nav). */
function find(target?: string): HTMLElement | null {
  if (!target) return null;
  const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)];
  return all.find((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0) ?? null;
}

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [wide, setWide] = useState(true);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const close = useCallback(() => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // Not remembered; it will offer itself again next time.
    }
    onClose();
    setTimeout(() => setI(0), 300);
  }, [onClose]);

  // Bring the step's target into view, then follow it as the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    const el = find(step.target);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setWide(window.innerWidth >= 640);
        setRect(find(step.target)?.getBoundingClientRect() ?? null);
      });
    };
    measure();
    const settle = setTimeout(measure, 450);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, step.target]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((v) => Math.min(STEPS.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (typeof document === "undefined") return null;

  // The card sits under the target when there's room, above it otherwise; on a phone it's a sheet at the bottom.
  const pad = 8;
  const cardW = 360;
  let cardStyle: React.CSSProperties = {};
  if (wide && rect) {
    const below = rect.bottom + pad + 14;
    const fitsBelow = below + 230 < window.innerHeight;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), window.innerWidth - cardW - 16);
    cardStyle = fitsBelow ? { top: below, left, width: cardW } : { bottom: window.innerHeight - rect.top + pad + 14, left, width: cardW };
  } else if (wide) {
    cardStyle = { top: "50%", left: "50%", width: 420, transform: "translate(-50%, -50%)" };
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="tour" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="no-print fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
          {/* the dimmed page, with a window cut around the thing being explained */}
          {rect ? (
            <motion.div
              className="pointer-events-none fixed rounded-2xl"
              animate={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              style={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 0 0 9999px rgba(10,10,12,0.6)" }}
            />
          ) : (
            <div className="fixed inset-0 bg-[rgba(10,10,12,0.6)]" />
          )}

          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            style={cardStyle}
            className={`fixed rounded-[1.25rem] border border-line bg-ink p-5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)] ${
              wide ? "" : "inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-[0.74rem] font-medium text-dim">
                {i + 1} of {STEPS.length}
              </span>
              <button onClick={close} aria-label="Close the tour" className="-mr-1.5 -mt-1.5 grid h-8 w-8 place-items-center rounded-full text-mist hover:bg-fog/[0.06] hover:text-fog">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <h2 id="tour-title" className="mt-1 text-[1.1rem] font-semibold text-fog">
              {step.title}
            </h2>
            <p className="mt-1.5 text-[0.9rem] leading-relaxed text-mist">{step.body}</p>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex gap-1.5" aria-hidden>
                {STEPS.map((_, n) => (
                  <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-fog" : "w-1.5 bg-line2"}`} />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {i === 0 ? (
                  <button onClick={close} className="rounded-full px-3 py-2 text-[0.85rem] text-dim hover:text-fog">
                    Skip
                  </button>
                ) : (
                  <button onClick={() => setI(i - 1)} className="rounded-full px-3 py-2 text-[0.85rem] text-mist hover:text-fog">
                    Back
                  </button>
                )}
                <button onClick={() => (last ? close() : setI(i + 1))} autoFocus className="rounded-full bg-fog px-4 py-2 text-[0.85rem] font-medium text-ink hover:bg-fog/85">
                  {i === 0 ? "Show me" : last ? "Got it" : "Next"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
