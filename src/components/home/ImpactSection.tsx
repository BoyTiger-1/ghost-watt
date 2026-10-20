"use client";

// The scale of it, live. One night of America's school waste plays back fast
// (a second on screen is ten real minutes), with a clock beside it; below it, a
// ticker of the kind of thing a single scan turns up.
//
// The rate is deliberately the conservative reading of the sources: about $8B a
// year on K-12 energy (U.S. DOE Better Buildings; ENERGY STAR cites $6-8B), of
// which ENERGY STAR says "as much as 30%" is wasted. So "up to" $2.4B a year,
// about $76 a second, and the copy says "up to".

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { Chapter } from "./Chapter";
import { CountTo, Flashlight, SplitLines } from "@/components/motion/Motion";

const PER_YEAR = 8e9 * 0.3;
const PER_SECOND = PER_YEAR / (365 * 24 * 3600);

const FINDS = [
  ["Room 214", "projector left on", "$221"],
  ["Computer lab", "30 monitors left on", "$796"],
  ["Gym", "8 light fixtures, empty court", "$849"],
  ["Lobby", "vending machine, all night", "$194"],
  ["Library", "6 desktops left on", "$424"],
  ["Room 102", "6 monitors left on", "$159"],
  ["Art room", "kiln controller in standby", "$18"],
  ["Main office", "space heater under a desk", "$530"],
] as const;

export function ImpactSection() {
  return (
    <section id="impact" className="relative px-3 py-10 sm:px-6">
      <div className="grain relative isolate mx-auto max-w-[86rem] overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,#1b1f33_0%,#151827_60%,#121420_100%)] text-moon sm:rounded-[2.75rem] [--flashlight:rgba(255,190,110,0.13)]">
        <Flashlight size={620} />
        <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,170,80,0.18),transparent)]" />

        <div className="relative px-6 pb-14 pt-16 sm:px-14 sm:pb-20 sm:pt-24">
          <Chapter n="00" label="The scale" tone="light" />

          <div className="mt-8 grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:items-end">
            <div>
              <h2 className="font-editorial text-[clamp(2.4rem,5vw,4.4rem)] leading-[0.98] text-[#f5f2eb]">
                <SplitLines inView lines={["Tonight, America’s", <span key="b" className="italic text-[#ffc777]">empty schools will pay</span>]} />
              </h2>
              <LiveCounter />
              <p className="mt-3 max-w-[34rem] text-[0.95rem] leading-relaxed text-[#f5f2eb]/60">
                for electricity nobody is using, from the last bell to the first. Played back fast: every second here is ten real minutes, at the
                rate of up to $76 a second. That is the share of a ~$8 billion annual K-12 energy bill that ENERGY STAR
                estimates is wasted (up to 30%).
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10">
              <Stat value={<CountTo to={2.4} prefix="$" suffix="B" decimals={1} duration={1.2} />} label="a year, up to, wasted by U.S. K-12 schools" />
              <Stat value={<CountTo to={6800} />} label="hours a year a typical school stands empty" />
              <Stat value={<CountTo to={98800} />} label="public schools in the U.S. that could run this scan" />
              <Stat value={<>10<span className="text-[#ffc777]">min</span></>} label="for thirty students scanning three or four rooms each" />
            </dl>
          </div>
        </div>

        {/* what one scan turns up */}
        <div className="ticker-host relative border-t border-white/10 py-5 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <div className="ticker flex w-max gap-3">
            {[...FINDS, ...FINDS].map(([room, what, cost], i) => (
              <span key={i} className="flex shrink-0 items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] py-2 pl-3 pr-4 text-[0.88rem]">
                <span className="h-2 w-2 rounded-full bg-[#ffc777] shadow-[0_0_10px_rgba(255,199,119,0.8)]" />
                <span className="font-medium text-[#f5f2eb]">{room}</span>
                <span className="text-[#f5f2eb]/55">{what}</span>
                <span className="font-numeric text-[#ffc777]">{cost}/yr</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="bg-[#171a2a] px-5 py-5">
      <dd className="font-editorial text-[2.3rem] leading-none text-[#f5f2eb]">{value}</dd>
      <dt className="mt-2 text-[0.8rem] leading-snug text-[#f5f2eb]/55">{label}</dt>
    </div>
  );
}

/** One night, 4 pm to 8 am. */
const NIGHT_SECONDS = 16 * 3600;
/** Each second on screen is ten real minutes. */
const SPEED = 600;

/**
 * Tonight's bill, played back fast: a clock runs from 4:00 pm to 8:00 am and the
 * dollars climb with it at the real rate times SPEED. The copy says it is sped up.
 */
function LiveCounter() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { margin: "-40px" });
  const reduce = useReducedMotion();
  // Real seconds of the night elapsed so far.
  const [night, setNight] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (reduce) {
      const t = setTimeout(() => setNight(NIGHT_SECONDS), 0);
      return () => clearTimeout(t);
    }
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const elapsed = Math.min(NIGHT_SECONDS, ((t - start) / 1000) * SPEED);
      setNight(elapsed);
      if (elapsed < NIGHT_SECONDS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, reduce, run]);

  const dollars = night * PER_SECOND;
  const done = night >= NIGHT_SECONDS;
  const minutes = (16 * 60 + Math.floor(night / 60)) % (24 * 60);
  const h = Math.floor(minutes / 60);
  const clock = `${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;

  return (
    <div ref={ref} className="mt-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-baseline font-editorial text-[clamp(2.7rem,8.6vw,7.6rem)] leading-none tracking-[-0.03em] text-[#ffc777] [text-shadow:0_0_60px_rgba(255,170,80,0.35)]"
        aria-live="off"
      >
        <span>$</span>
        <span className="tabular-nums">{Math.floor(dollars).toLocaleString("en-US")}</span>
      </motion.div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#ffc777]/25 bg-[#ffc777]/[0.08] py-1.5 pl-2.5 pr-3.5 font-numeric text-[0.85rem] tabular-nums text-[#ffc777]">
          <span className={`h-2 w-2 rounded-full bg-[#ffc777] shadow-[0_0_10px_rgba(255,199,119,0.9)] ${done ? "" : "soft-pulse"}`} />
          {clock}
        </span>
        <span className="rounded-full border border-white/10 px-3 py-1.5 text-[0.82rem] text-[#f5f2eb]/60">
          {done ? "One night, start to finish" : "Sped up: 1 second = 10 minutes"}
        </span>
        {done && !reduce && (
          <button
            type="button"
            onClick={() => {
              setNight(0);
              setRun((r) => r + 1);
            }}
            className="rounded-full px-3 py-1.5 text-[0.82rem] text-[#f5f2eb]/80 underline decoration-[#f5f2eb]/30 underline-offset-4 hover:decoration-[#f5f2eb]"
          >
            Play the night again
          </button>
        )}
      </div>
    </div>
  );
}
