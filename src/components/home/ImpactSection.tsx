"use client";

// The scale of it, live, from the moment you open the site: the electricity
// America's empty schools waste, counted in watt-hours (about 585,000 a second)
// with the dollars beside it; below, a ticker of what a single scan turns up.
//
// The rate is deliberately the conservative reading of the sources: about $8B a
// year on K-12 energy (U.S. DOE Better Buildings; ENERGY STAR cites $6-8B), of
// which ENERGY STAR says "as much as 30%" is wasted. So "up to" $2.4B a year,
// about $76 a second. At the U.S. commercial average of $0.13/kWh (EIA, 2024)
// that is about 18.5 billion kWh a year: a steady 2.1 GW, roughly the output of
// two large nuclear reactors. The copy says "up to".

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Chapter } from "./Chapter";
import { CountTo, Flashlight, SplitLines } from "@/components/motion/Motion";

const PER_YEAR = 8e9 * 0.3;
const SECONDS_PER_YEAR = 365 * 24 * 3600;
const PER_SECOND = PER_YEAR / SECONDS_PER_YEAR;
const RATE_PER_KWH = 0.13;
/** Watt-hours wasted a second: dollars a second over the price of a kWh, times 1000. */
const WH_PER_SECOND = (PER_SECOND / RATE_PER_KWH) * 1000;
/** The same energy as a steady draw, in gigawatts. */
const GIGAWATTS = (WH_PER_SECOND * 3600) / 1e9;

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
                <SplitLines inView lines={["Since you opened this page,", <span key="b" className="italic text-[#ffc777]">America’s empty schools have wasted</span>]} />
              </h2>
              <LiveCounter />
              <p className="mt-3 max-w-[34rem] text-[0.95rem] leading-relaxed text-[#f5f2eb]/60">
                That is a steady {GIGAWATTS.toFixed(1)} gigawatts, about the output of two nuclear reactors, running rooms nobody is in. It is the
                share of a ~$8 billion annual K-12 energy bill that ENERGY STAR estimates is wasted (up to 30%), at the U.S. average price.
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

/**
 * Energy and money wasted since this page opened, ticking every frame. It starts
 * when you arrive, not when you scroll here, so the number is already running.
 */
function LiveCounter() {
  const reduce = useReducedMotion();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      // Under reduced motion it still counts, just once a second rather than every frame.
      if (!reduce || t - last > 1000) {
        setSeconds((t - start) / 1000);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  const wh = seconds * WH_PER_SECOND;
  const dollars = seconds * PER_SECOND;

  return (
    <div className="mt-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-baseline gap-x-3 font-editorial leading-none tracking-[-0.03em] text-[#ffc777] [text-shadow:0_0_60px_rgba(255,170,80,0.35)]"
        aria-live="off"
      >
        <span className="text-[clamp(2.6rem,7.6vw,6.8rem)] tabular-nums">{Math.floor(wh).toLocaleString("en-US")}</span>
        <span className="text-[clamp(1.2rem,2.4vw,2rem)] text-[#ffc777]/70">watt-hours</span>
      </motion.div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#ffc777]/25 bg-[#ffc777]/[0.08] py-1.5 pl-2.5 pr-3.5 font-numeric text-[0.88rem] tabular-nums text-[#ffc777]">
          <span className="soft-pulse h-2 w-2 rounded-full bg-[#ffc777] shadow-[0_0_10px_rgba(255,199,119,0.9)]" />
          ${dollars.toFixed(2)} of electricity
        </span>
        <span className="rounded-full border border-white/10 px-3 py-1.5 text-[0.82rem] text-[#f5f2eb]/60">
          +{Math.round(WH_PER_SECOND).toLocaleString("en-US")} Wh every second
        </span>
      </div>
    </div>
  );
}
