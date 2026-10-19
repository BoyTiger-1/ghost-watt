"use client";

// The curtain before the landing page: 4:00 pm ticks to 9:41 pm while a row of
// windows goes dark, then the night lifts away to show the page. Once per visit,
// about 1.8 s, and never under reduced motion or lite visuals.

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Mark } from "./HomeNav";
import { usePrefs } from "@/lib/prefs";

const KEY = "gw-intro-seen";
const WINDOWS = 9;

export function Intro() {
  const reduce = useReducedMotion();
  const { lite, motion: motionPref } = usePrefs();
  const [show, setShow] = useState(false);
  const [minutes, setMinutes] = useState(16 * 60);

  useEffect(() => {
    if (reduce || lite || motionPref === "reduce") return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
      sessionStorage.setItem(KEY, "1");
    } catch {
      // No storage: show it, it is short.
    }
    if (seen) return;
    const t0 = setTimeout(() => setShow(true), 0);
    const startAt = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - startAt) / 1300);
      setMinutes(16 * 60 + Math.round((1 - Math.pow(1 - p, 3)) * (21 * 60 + 41 - 16 * 60)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t1 = setTimeout(() => setShow(false), 1800);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      cancelAnimationFrame(raf);
    };
  }, [reduce, lite, motionPref]);

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const clock = `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")} pm`;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          aria-hidden
          className="grain fixed inset-0 z-[200] grid place-items-center overflow-hidden bg-[#121420] text-[#f5f2eb]"
          exit={{ clipPath: "inset(0 0 100% 0)" }}
          initial={{ clipPath: "inset(0 0 0% 0)" }}
          transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="flex flex-col items-center">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
              <Mark className="h-14 w-[2.66rem]" tint="text-[#f5f2eb]" />
            </motion.div>
            <div className="mt-8 flex gap-1.5">
              {Array.from({ length: WINDOWS }).map((_, i) => (
                <motion.span
                  key={i}
                  className="h-7 w-5 rounded-[3px] bg-[linear-gradient(180deg,#ffd18a,#f2a443)] shadow-[0_0_14px_rgba(255,190,110,0.6)]"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: i === 4 ? 1 : 0.08 }}
                  transition={{ delay: 0.25 + ((i * 5) % WINDOWS) * 0.11, duration: 0.15 }}
                />
              ))}
            </div>
            <p className="mt-6 font-numeric text-[0.9rem] tabular-nums tracking-[0.2em] text-[#f5f2eb]/60">{clock}</p>
            <p className="font-editorial mt-2 text-[1.3rem] italic text-[#ffc777]">Everyone has gone home.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
