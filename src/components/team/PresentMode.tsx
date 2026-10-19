"use client";

// The team on the classroom projector: the code and a QR big enough to scan
// from the back row, and the building's total climbing as scans arrive. Always
// the night palette, since a dark screen is easier on a dim room.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { fmtMoneyFull } from "@/lib/energy";
import type { TeamBoard } from "@/lib/team";
import { TeamQR } from "./TeamQR";
import { Mark } from "../home/HomeNav";
import { CountTo } from "../motion/Motion";

export function PresentMode({ code, link, data, onClose }: { code: string; link: string; data: TeamBoard | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const latest = [...(data?.areas ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  const total = data?.totals.costPerYear ?? 0;

  // On <body>, so no page wrapper's stacking context can put the header over it.
  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Team ${code}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="grain fixed inset-0 z-[150] overflow-y-auto bg-[linear-gradient(180deg,#1b1f33_0%,#121420_100%)] text-moon"
    >
      <div className="pointer-events-none absolute -right-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,170,80,0.16),transparent)]" />
      <div className="relative mx-auto flex min-h-full max-w-[90rem] flex-col px-6 py-6 sm:px-12 sm:py-10">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-3">
            <Mark tint="text-moon" />
            <span className="text-[1.05rem] font-semibold tracking-[-0.02em]">Ghost Watt · team scan</span>
          </span>
          <button onClick={onClose} className="rounded-full border border-white/15 px-4 py-2 text-[0.9rem] text-moon/80 hover:bg-white/5">
            Close <span className="ml-1 text-moon/40">Esc</span>
          </button>
        </div>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[auto_1fr] lg:gap-20">
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="text-center">
            <TeamQR value={link} className="mx-auto h-[min(42vh,22rem)] w-[min(42vh,22rem)] shadow-[0_0_80px_-10px_rgba(255,190,110,0.35)]" />
            <p className="mt-6 text-[1rem] text-moon/60">Scan to join, or go to</p>
            <p className="mt-1 font-numeric text-[1rem] text-moon/80">{new URL(link, "http://x").host}/team</p>
            <p className="mt-3 font-numeric text-[clamp(3rem,7vw,5.5rem)] font-bold leading-none tracking-[0.18em] text-[#ffc777]">{code}</p>
          </motion.div>

          <div>
            <p className="text-[1.05rem] text-moon/60">{data?.buildingName ?? "Loading…"} · found so far</p>
            <motion.p
              key={Math.round(total)}
              initial={{ scale: 1.04, textShadow: "0 0 80px rgba(255,170,80,0.7)" }}
              animate={{ scale: 1, textShadow: "0 0 40px rgba(255,170,80,0.25)" }}
              transition={{ duration: 0.8 }}
              className="font-editorial mt-2 origin-left text-[clamp(4rem,11vw,9.5rem)] leading-[0.9] tracking-[-0.03em] text-[#ffc777]"
            >
              {fmtMoneyFull(total)}
              <span className="text-[0.32em] text-moon/50"> a year</span>
            </motion.p>

            <dl className="mt-8 grid max-w-[36rem] grid-cols-3 gap-px overflow-hidden rounded-2xl bg-white/10">
              {[
                { v: data?.totals.areaCount ?? 0, l: "rooms scanned" },
                { v: data?.totals.contributorCount ?? 0, l: "people helping" },
                { v: Math.round(data?.totals.recoverable ?? 0), l: "$ a year fixable", money: true },
              ].map((s) => (
                <div key={s.l} className="bg-[#171a2a] px-5 py-4">
                  <dd className="font-editorial text-[2.4rem] leading-none">
                    <CountTo key={s.v} to={s.v} prefix={s.money ? "$" : ""} duration={0.8} />
                  </dd>
                  <dt className="mt-1.5 text-[0.85rem] text-moon/55">{s.l}</dt>
                </div>
              ))}
            </dl>

            <ul className="mt-8 max-w-[36rem] space-y-2">
              <AnimatePresence initial={false}>
                {latest.map((a) => (
                  <motion.li
                    key={`${a.area}|${a.contributor}|${a.at}`}
                    layout
                    initial={{ opacity: 0, x: -20, backgroundColor: "rgba(255,199,119,0.18)" }}
                    animate={{ opacity: 1, x: 0, backgroundColor: "rgba(255,255,255,0.04)" }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center gap-4 rounded-2xl px-4 py-3"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ffc777] shadow-[0_0_12px_rgba(255,199,119,0.8)]" />
                    <span className="min-w-0 flex-1 truncate text-[1.05rem]">
                      {a.area} <span className="text-moon/50">· {a.contributor || "Someone"}</span>
                    </span>
                    <span className="font-numeric text-[1rem] text-[#ffc777]">{fmtMoneyFull(a.costPerYear)}/yr</span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {latest.length === 0 && <li className="text-[1.05rem] text-moon/50">Waiting for the first scan…</li>}
            </ul>
          </div>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
