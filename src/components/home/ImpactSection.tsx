"use client";

// The scale of it, live, from the moment you open the site: what America's
// commercial buildings (offices, stores, schools: the places Ghost Watt scans)
// spend on electricity nobody uses, in dollars, with the energy below; then a
// ticker of what a single scan turns up.
//
// Commercial buildings spent $119B on electricity in 2018 (EIA, CBECS 2018), and
// the EPA's long-standing estimate is that about 30% of the energy they use is
// wasted. So about $35.7B a year, roughly $1,130 a second. At the U.S. commercial
// average of $0.13/kWh (EIA, 2024) that is about 275 billion kWh a year: a steady
// 31 GW, roughly thirty large nuclear reactors. The schools-only figure (up to
// $2.4B a year) stays in the stats beside it.

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Chapter } from "./Chapter";
import { Cite } from "@/components/Cite";
import { CountTo, Flashlight, SplitLines } from "@/components/motion/Motion";

const PER_YEAR = 119e9 * 0.3;
const SECONDS_PER_YEAR = 365 * 24 * 3600;
const PER_SECOND = PER_YEAR / SECONDS_PER_YEAR;
const RATE_PER_KWH = 0.13;
/** Megawatt-hours wasted a second: dollars a second over the price of a kWh, over 1000. */
const MWH_PER_SECOND = PER_SECOND / RATE_PER_KWH / 1000;
/** The same energy as a steady draw, in gigawatts. */
const GIGAWATTS = (MWH_PER_SECOND * 3600) / 1000;

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
                <SplitLines inView lines={["Since you opened this page,", <span key="b" className="italic text-[#ffc777]">America’s homes, offices, stores and schools have wasted</span>]} />
              </h2>
              <LiveCounter />
              <p className="mt-3 max-w-[34rem] text-[0.95rem] leading-relaxed text-[#f5f2eb]/60">
                on electricity nobody used. {`That is a steady ${Math.round(GIGAWATTS)} gigawatts, about thirty nuclear reactors’ worth.`} Commercial
                buildings spend $119 billion a year on electricity (EIA), and the EPA estimates about 30% of their energy is wasted.
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10">
              <Stat value={<CountTo to={2.4} prefix="$" suffix="B" decimals={1} duration={1.2} />} label="a year, up to, wasted by U.S. K-12 schools alone" />
              <Stat value={<CountTo to={6800} />} label="hours a year a typical building stands empty" />
              <Stat value={<CountTo to={5900000} />} label="commercial buildings in the U.S. that could run this scan" />
              <Stat value={<>10<span className="text-[#ffc777]">min</span></>} label="for a team of thirty scanning three or four rooms each" />
            </dl>
            <Cite
              className="text-[#f5f2eb] lg:col-span-2"
              items={[
                { id: "cbecs-2018", name: "EIA CBECS 2018" },
                { id: "epa-30pct", name: "EPA (30% wasted)" },
                { id: "energystar-k12", name: "ENERGY STAR K-12" },
                { id: "empty-hours", name: "how 6,800 hours is derived" },
              ]}
            />
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
 * Money and energy wasted since this page opened. It starts when you arrive, not
 * when you scroll here, and rolls every frame: the dollars climb about $1,130 a
 * second, so the thousands are easy to read while the last digits spin.
 */
function LiveCounter() {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const money = useRef<HTMLSpanElement>(null);
  const energy = useRef<HTMLSpanElement>(null);

  // The digits are written straight to the page each frame rather than through
  // React state: re-rendering a component 60 times a second was needless work.
  // While the counter is off screen it stops drawing; the total stays right
  // because it is worked out from the time since the page opened.
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    let last = 0;
    let visible = true;
    const draw = (t: number) => {
      const sec = (t - start) / 1000;
      if (money.current) money.current.textContent = Math.floor(sec * PER_SECOND).toLocaleString("en-US");
      if (energy.current)
        energy.current.textContent = (sec * MWH_PER_SECOND).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    };
    const tick = (t: number) => {
      // Under reduced motion it still counts, just once a second.
      if (visible && (!reduce || t - last > 1000)) {
        draw(t);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    if (box.current) io.observe(box.current);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [reduce]);

  return (
    <div ref={box} className="mt-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-baseline font-editorial text-[clamp(3rem,9vw,8rem)] leading-none tracking-[-0.03em] text-[#ffc777] [text-shadow:0_0_32px_rgba(255,170,80,0.3)]"
        aria-live="off"
      >
        <span>$</span>
        <span ref={money} className="tabular-nums">0</span>
      </motion.div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 font-editorial text-[clamp(1.4rem,2.8vw,2.2rem)] leading-tight text-[#f5f2eb]/85">
        <span ref={energy} className="tabular-nums">0.0</span>
        <span className="text-[#f5f2eb]/55">megawatt-hours of electricity</span>
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#ffc777]/25 bg-[#ffc777]/[0.08] py-1.5 pl-2.5 pr-3.5 font-numeric text-[0.85rem] tabular-nums text-[#ffc777]">
          <span className="soft-pulse h-2 w-2 rounded-full bg-[#ffc777] shadow-[0_0_10px_rgba(255,199,119,0.9)]" />
          +${Math.round(PER_SECOND).toLocaleString("en-US")} every second
        </span>
        <span className="rounded-full border border-white/10 px-3 py-1.5 text-[0.82rem] text-[#f5f2eb]/60">
          +{MWH_PER_SECOND.toFixed(1)} MWh every second
        </span>
      </div>
    </div>
  );
}
