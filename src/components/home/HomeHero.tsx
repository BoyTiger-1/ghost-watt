"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import { Arrow } from "./HomeNav";
import { useMediaQuery } from "./useMediaQuery";

const SchoolScene = dynamic(() => import("./SchoolScene").then((m) => m.SchoolScene), {
  ssr: false,
  loading: () => null,
});

const rise = {
  hidden: { opacity: 0, y: 28, filter: "blur(8px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 1, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function HomeHero() {
  const [ready, setReady] = useState(false);
  // Phones get a card made for the screen instead of a WebGL scene.
  const wide = useMediaQuery("(min-width: 768px)");

  return (
    <section className="relative isolate overflow-hidden">
      {/* the sky at about 7pm: haze up top, a low warm sun, paper underneath */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#e4e6f1_0%,#eeebef_32%,#f5f0e8_62%,var(--color-paper)_100%)]" />
        <div className="absolute right-[8%] top-[22%] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(255,196,128,0.55),rgba(255,196,128,0)_65%)] blur-2xl" />
        <div className="absolute -left-[10%] top-[-10%] h-[34rem] w-[44rem] rounded-full bg-[radial-gradient(circle,rgba(182,192,230,0.5),rgba(182,192,230,0)_70%)] blur-2xl" />
      </div>

      <div className="relative mx-auto grid max-w-[84rem] grid-rows-[auto_1fr] px-5 pb-14 pt-24 sm:px-8 md:min-h-[calc(100svh-4.5rem)] md:pb-0 md:pt-28 lg:block lg:pt-0">
        {/* the scene sits behind and to the right of the words on a wide screen,
            and underneath them on a narrow one */}
        {wide ? (
        <div
          className={`relative -mx-5 h-[58svh] min-h-[22rem] transition-opacity duration-[1400ms] sm:-mx-8 lg:absolute lg:inset-y-0 lg:left-[33%] lg:right-[-4vw] lg:mx-0 lg:h-auto lg:[mask-image:linear-gradient(90deg,transparent,#000_14%,#000_92%,transparent),linear-gradient(180deg,#000_85%,transparent)] lg:[mask-composite:intersect] ${
            ready ? "opacity-100" : "opacity-0"
          } row-start-2`}
        >
          <SchoolScene onReady={() => setReady(true)} />
        </div>
        ) : (
          <TonightCard />
        )}

        <div className="relative z-10 row-start-1 max-w-[36rem] lg:flex lg:min-h-[calc(100svh-4.5rem)] lg:flex-col lg:justify-center lg:pt-20">
          <motion.p
            variants={rise}
            initial="hidden"
            animate="show"
            custom={0}
            className="inline-flex items-center gap-2 text-[0.82rem] text-stone"
          >
            <span className="relative flex h-2 w-2">
              <span className="soft-pulse absolute inset-0 rounded-full bg-sodium" />
              <span className="relative h-2 w-2 rounded-full bg-sodium" />
            </span>
            An energy audit you can do with a phone
          </motion.p>

          <motion.h1
            variants={rise}
            initial="hidden"
            animate="show"
            custom={1}
            className="font-editorial mt-5 text-[clamp(3.2rem,6.2vw,5.9rem)] leading-[0.93] text-graphite"
          >
            Your school has
            <br />a night shift.
            <br />
            <span className="whitespace-nowrap italic text-dusk">Nobody clocked in.</span>
          </motion.h1>

          <motion.p
            variants={rise}
            initial="hidden"
            animate="show"
            custom={2}
            className="mt-7 max-w-[30rem] text-[1.08rem] leading-[1.6] text-stone"
          >
            After the last bell, projectors idle, monitors glow and vending machines hum for an
            empty building. Ghost Watt finds them with your camera, prices every one, and tells
            you which to fix first.
          </motion.p>

          <motion.div
            variants={rise}
            initial="hidden"
            animate="show"
            custom={3}
            className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4"
          >
            <Link
              href="/scan"
              className="group inline-flex items-center gap-3 rounded-full bg-graphite py-3.5 pl-6 pr-4 text-[0.95rem] font-medium text-paper shadow-[0_12px_30px_-12px_rgba(28,27,24,0.6)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Start a free scan
              <span className="grid h-7 w-7 place-items-center rounded-full bg-sodium text-graphite transition-transform group-hover:translate-x-0.5">
                <Arrow />
              </span>
            </Link>
            <a href="#see" className="group inline-flex items-center gap-2 text-[0.95rem] text-graphite">
              <span className="underline decoration-graphite/25 decoration-1 underline-offset-[6px] transition-colors group-hover:decoration-graphite">
                See how it works
              </span>
            </a>
          </motion.div>
        </div>
      </div>

      {/* the receipt for tonight */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.6, duration: 1 }}
        className="relative z-10 mx-auto hidden max-w-[84rem] px-8 pb-8 lg:block"
      >
        <div className="flex items-end justify-between border-t border-graphite/10 pt-5 text-[0.85rem] text-stone">
          <p>
            <span className="text-graphite">Tonight, one middle school:</span> 4 rooms left on,{" "}
            <span className="tabular-nums text-sodium-deep">$1,183</span> a year, ranked worst first.
          </p>
          <p className="text-pebble">Free and open source · Works in any browser</p>
        </div>
      </motion.div>
    </section>
  );
}

/* ---- the phone's hero: tonight, as a short list ------------------------- */

const TONIGHT = [
  { room: "Computer lab", what: "30 monitors", cost: 486, tone: "cool" },
  { room: "Gym", what: "24 high-bays", cost: 310, tone: "warm" },
  { room: "Room 214", what: "projector", cost: 255, tone: "warm" },
  { room: "Lobby", what: "vending machine", cost: 132, tone: "warm" },
] as const;

function TonightCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="row-start-2 mt-12 overflow-hidden rounded-[1.75rem] bg-[linear-gradient(180deg,#2c3352,#1d2238)] p-5 text-paper shadow-[0_30px_60px_-30px_rgba(29,34,56,0.7)]"
    >
      <div className="flex items-center justify-between text-[0.8rem] text-paper/60">
        <span className="flex items-center gap-2">
          <span className="soft-pulse h-1.5 w-1.5 rounded-full bg-[#ffc777]" />
          Tonight, 9:41 pm
        </span>
        <span>Lincoln Middle</span>
      </div>
      <ul className="mt-4 space-y-1">
        {TONIGHT.map((t, i) => (
          <motion.li
            key={t.room}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.9 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3.5 rounded-2xl bg-white/[0.05] px-3.5 py-3"
          >
            <span
              className={`h-8 w-6 shrink-0 rounded-[5px] ${
                t.tone === "cool"
                  ? "bg-[linear-gradient(180deg,#dfe9ff,#a9c8ff)] shadow-[0_0_16px_rgba(169,200,255,0.55)]"
                  : "bg-[linear-gradient(180deg,#ffe2b0,#ffb54a)] shadow-[0_0_16px_rgba(255,181,74,0.55)]"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.95rem] font-medium leading-tight">{t.room}</span>
              <span className="block text-[0.8rem] text-paper/55">{t.what}, left on</span>
            </span>
            <span className="font-numeric text-[0.9rem] text-[#ffc777]">${t.cost}</span>
          </motion.li>
        ))}
      </ul>
      <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
        <span className="text-[0.8rem] leading-snug text-paper/60">
          a year, for one school,
          <br />
          ranked worst first
        </span>
        <span className="font-editorial text-[2.6rem] leading-none">$1,183</span>
      </div>
    </motion.div>
  );
}
