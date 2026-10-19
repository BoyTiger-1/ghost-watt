"use client";

// The scale of it, live. A counter runs from the moment the page opened, at the
// rate America's schools pay for energy nobody used; below it, a ticker of the
// kind of thing a single scan turns up.
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
  ["Room 214", "projector in standby", "$255"],
  ["Computer lab", "30 monitors left on", "$486"],
  ["Gym", "24 high-bays, empty court", "$310"],
  ["Lobby", "vending machine, lit 24/7", "$132"],
  ["Library", "12 desktops asleep, not off", "$141"],
  ["Art room", "kiln controller idling", "$64"],
  ["Cafeteria", "warming cabinet overnight", "$212"],
  ["Main office", "space heater under a desk", "$98"],
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
                <SplitLines inView lines={["Since you opened this page,", <span key="b" className="italic text-[#ffc777]">America&apos;s schools have paid</span>]} />
              </h2>
              <LiveCounter />
              <p className="mt-3 max-w-[34rem] text-[0.95rem] leading-relaxed text-[#f5f2eb]/60">
                for electricity in empty rooms, at up to $76 a second. That is the share of a ~$8 billion annual K-12 energy bill that ENERGY STAR
                estimates is wasted (up to 30%).
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10">
              <Stat value={<CountTo to={2.4} prefix="$" suffix="B" decimals={1} duration={1.2} />} label="a year, up to, wasted by U.S. K-12 schools" />
              <Stat value={<CountTo to={6800} />} label="hours a year a typical school stands empty" />
              <Stat value={<CountTo to={98800} />} label="public schools in the U.S. that could run this scan" />
              <Stat value={<>10<span className="text-[#ffc777]">min</span></>} label="for a class of thirty to scan a whole building" />
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

/** Dollars since the page opened, to the cent, ticking in real time once on screen. */
function LiveCounter() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { margin: "-40px" });
  const reduce = useReducedMotion();
  const [start] = useState(() => (typeof performance !== "undefined" ? performance.now() : 0));
  const [now, setNow] = useState(start);

  useEffect(() => {
    if (!seen) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      // Under reduced motion it still counts, just once a second rather than every frame.
      if (!reduce || t - last > 1000) {
        setNow(t);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, reduce]);

  const dollars = ((now - start) / 1000) * PER_SECOND;
  const [whole, cents] = dollars.toFixed(2).split(".");

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="mt-6 flex items-baseline font-editorial text-[clamp(3.6rem,10vw,8.5rem)] leading-none tracking-[-0.03em] text-[#ffc777] [text-shadow:0_0_60px_rgba(255,170,80,0.35)]"
      aria-live="off"
    >
      <span>$</span>
      <span className="tabular-nums">{Number(whole).toLocaleString("en-US")}</span>
      <span className="text-[0.45em] tabular-nums text-[#ffc777]/70">.{cents}</span>
    </motion.div>
  );
}
