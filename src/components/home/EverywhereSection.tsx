"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { Laptop, Phone, Tablet } from "./Devices";
import { BudgetScreen, OffenderScreen, RANKED, ReportScreen } from "./Screens";
import { DeviceGlyph } from "@/components/DeviceGlyph";
import { Chapter } from "./Chapter";

export function EverywhereSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const p = useSpring(scrollYProgress, { stiffness: 70, damping: 20, mass: 0.5 });

  const laptopScale = useTransform(p, [0, 1], [0.9, 1]);
  const laptopY = useTransform(p, [0, 1], [60, 0]);
  const tabletX = useTransform(p, [0, 1], ["22%", "0%"]);
  const tabletRot = useTransform(p, [0, 1], [-10, 0]);
  const phoneX = useTransform(p, [0, 1], ["-40%", "0%"]);
  const phoneRot = useTransform(p, [0, 1], [12, 0]);
  const fade = useTransform(p, [0.2, 0.9], [0, 1]);

  return (
    <section id="everywhere" ref={ref} className="relative scroll-mt-16 overflow-hidden px-5 pb-10 pt-16 sm:px-8 sm:pb-16 sm:pt-36">
      <div className="mx-auto max-w-[84rem]">
        <div className="mx-auto max-w-[60rem] text-center">
          <div className="flex justify-center">
            <Chapter n="03" label="Fix" />
          </div>
          <h2 className="font-editorial mt-6 text-[clamp(2.5rem,5.2vw,4.6rem)] leading-[0.98] text-graphite">
            Scan on a phone. Plan on a tablet.
            <br className="hidden sm:block" />{" "}
            <span className="italic text-dusk">Show the school board.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-[36rem] text-[1.05rem] leading-[1.65] text-stone">
            Every scan becomes one ranked list: what to fix first, what it costs, and how fast it
            pays for itself. Tell it what you can actually spend and it picks the exact
            combination of fixes that buys back the most.
          </p>
        </div>

        <FixListCard />

        {/* the composition */}
        <div className="relative mx-auto mt-16 hidden aspect-[16/9] max-w-[74rem] sm:mt-20 md:block">
          <div className="absolute bottom-[3%] left-1/2 h-[18%] w-[90%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(28,27,24,0.16),transparent)] blur-xl" />

          <motion.div style={{ scale: laptopScale, y: laptopY }} className="absolute left-[14%] top-0 w-[72%]">
            <Laptop>
              <ReportScreen />
            </Laptop>
          </motion.div>

          <motion.div
            style={{ x: tabletX, rotate: tabletRot }}
            className="absolute bottom-[4%] left-0 w-[36%] origin-bottom-right"
          >
            <Tablet>
              <BudgetScreen />
            </Tablet>
          </motion.div>

          <motion.div
            style={{ x: phoneX, rotate: phoneRot }}
            className="absolute bottom-[2%] right-[2%] w-[17%] origin-bottom-left"
          >
            <Phone>
              <OffenderScreen />
            </Phone>
          </motion.div>
        </div>

        {/* captions sit under the thing they describe, at the height they fall */}
        <motion.div style={{ opacity: fade }} className="relative mx-auto mt-6 hidden max-w-[74rem] md:block">
          <div className="h-28">
            <Caption className="absolute left-[3%] top-0 w-[30%]" title="Budget planner">
              Give it the $250 the PTA has. An exact solver returns the best set of fixes, not a
              greedy guess.
            </Caption>
            <Caption className="absolute left-[39%] top-6 w-[24%]" title="The brief">
              A one-page, printable report for facilities and the board, every number sourced.
            </Caption>
            <Caption className="absolute right-[2%] top-0 w-[24%] text-right" title="Every offender">
              Its cost, its carbon, the fix, and whether the model or an estimate produced it.
            </Caption>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Caption({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[0.95rem] font-medium text-graphite">{title}</p>
      <p className="mt-1.5 text-[0.9rem] leading-relaxed text-stone">{children}</p>
    </div>
  );
}

/* ---- phone: the list itself, no hardware ------------------------------- */

function FixListCard() {
  return (
    <div className="mt-12 space-y-3 md:hidden">
      <div className="rounded-[1.75rem] bg-cream p-5 ring-1 ring-hair">
        <div className="flex items-baseline justify-between">
          <p className="text-[0.8rem] text-pebble">Lincoln Middle · ranked</p>
          <p className="text-[0.8rem] text-pebble">per year</p>
        </div>
        <p className="font-editorial mt-1 text-[2.1rem] leading-[1.05] text-graphite">
          $4,820 <span className="italic text-dusk">recoverable.</span>
        </p>
        <ol className="mt-4 divide-y divide-hair">
          {RANKED.map((r, i) => (
            <li key={r.name} className="flex items-center gap-3 py-3">
              <span className="w-3 font-numeric text-[0.75rem] text-pebble">{i + 1}</span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper2 text-dusk">
                <DeviceGlyph icon={r.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.95rem] font-medium text-graphite">{r.name}</span>
                <span className="block truncate text-[0.78rem] text-pebble">
                  {r.fix} · <span className="text-moss">{r.pay}</span>
                </span>
              </span>
              <span className="font-numeric text-[0.9rem] text-sodium-deep">${r.cost}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-[1.75rem] bg-graphite p-5 text-paper">
        <p className="text-[0.8rem] text-paper/60">With the $250 the PTA has</p>
        <p className="font-editorial mt-1 text-[1.9rem] leading-[1.05]">Fix four things first.</p>
        <p className="mt-2 text-[0.88rem] text-paper/70">$1,120 a year back. Pays for itself in 2.5 months.</p>
      </div>
    </div>
  );
}
