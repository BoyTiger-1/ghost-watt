"use client";

// The ending: a facade of lit windows that go dark, one by one, as you scroll in.
// The last one stays on, waiting for you.

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { Arrow } from "./HomeNav";
import { Flashlight, Magnetic, SplitLines } from "@/components/motion/Motion";

const COLS = 14;
const ROWS = 4;
// The one that stays lit; column 4, so it is on screen when a phone shows 7.
const KEEP = 2 * COLS + 4;

/** A fixed shuffle so the windows go out in a scattered, natural order. */
const ORDER = (() => {
  const idx = Array.from({ length: COLS * ROWS }, (_, i) => i).filter((i) => i !== KEEP);
  let s = 7;
  for (let i = idx.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const rank = new Map<number, number>();
  idx.forEach((v, k) => rank.set(v, k));
  return rank;
})();

export function LightsOut() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.9", "center 0.45"] });

  return (
    <section className="px-3 pb-6 pt-10 sm:px-6">
      <div
        ref={ref}
        className="grain relative isolate mx-auto max-w-[86rem] overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,#2a3150_0%,#1d2238_70%,#191d30_100%)] px-6 pb-16 pt-20 text-moon sm:rounded-[2.75rem] sm:px-14 sm:pt-28"
      >
        <Flashlight size={600} />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(160,175,230,0.25),transparent)]" />

        <div className="relative mx-auto max-w-[44rem] text-center">
          <h2 className="font-editorial text-[clamp(2.8rem,6.4vw,5.6rem)] leading-[0.96]">
            <SplitLines inView lines={["Find it tonight.", <span key="b" className="italic text-[#ffc777]">Switch it off tomorrow.</span>]} />
          </h2>
          <p className="mx-auto mt-6 max-w-[30rem] text-[1.05rem] leading-[1.65] text-moon/70">
            Open Ghost Watt on any phone or laptop and scan your first room. There is nothing
            to install and nothing to pay for.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <Magnetic>
            <Link
              href="/scan"
              className="group inline-flex items-center gap-3 rounded-full bg-moon py-3.5 pl-6 pr-4 text-[0.95rem] font-medium text-[#1c1b18] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Start a free scan
              <span className="grid h-7 w-7 place-items-center rounded-full bg-sodium transition-transform group-hover:translate-x-0.5">
                <Arrow />
              </span>
            </Link>
            </Magnetic>
            <Link href="/methodology" className="text-[0.95rem] text-moon/80 underline decoration-moon/25 underline-offset-[6px] hover:decoration-moon">
              How the numbers work
            </Link>
          </div>
        </div>

        {/* the facade */}
        <div className="relative mx-auto mt-20 max-w-[60rem]" aria-hidden="true">
          <div className="grid grid-cols-7 gap-2 rounded-t-xl border border-b-0 border-white/10 bg-white/[0.035] p-3 sm:p-4 md:grid-cols-14">
            {Array.from({ length: COLS * ROWS }).map((_, i) => (
              <Pane key={i} progress={scrollYProgress} rank={i === KEEP ? null : ORDER.get(i)!} hideOnPhone={i % COLS >= 7} />
            ))}
          </div>
          <div className="h-px bg-white/15" />
        </div>
      </div>
    </section>
  );
}

function Pane({ progress, rank, hideOnPhone }: { progress: MotionValue<number>; rank: number | null; hideOnPhone: boolean }) {
  const n = COLS * ROWS - 1;
  const at = rank === null ? 2 : 0.1 + (rank / n) * 0.85;
  const opacity = useTransform(progress, [at - 0.02, at + 0.02], [1, 0]);
  return (
    <div className={`relative aspect-[3/4] rounded-[3px] bg-[#2f3757] ${hideOnPhone ? "hidden md:block" : ""}`}>
      <motion.div
        style={{ opacity }}
        className="absolute inset-0 rounded-[3px] bg-[linear-gradient(180deg,#ffd18a,#f2a443)] shadow-[0_0_18px_rgba(255,190,110,0.55)]"
      />
    </div>
  );
}
