"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CodeWindow, DEVICES_TS, ENERGY_TS, ENERGY_TS_SHORT } from "@/components/CodeWindow";
import { Chapter } from "./Chapter";
import { Arrow } from "./HomeNav";

const DEFAULTS = [
  { value: "$0.13", label: "per kWh, the US commercial average (EIA, 2024)" },
  { value: "0.35", label: "kg of CO₂ per kWh on the US grid (eGRID 2023)" },
  { value: "6,800", label: "empty hours a year, after 190 school days" },
];

export function MethodSection() {
  return (
    <section id="method" className="relative scroll-mt-16 px-5 py-16 sm:px-8 sm:py-32">
      <div className="mx-auto grid max-w-[84rem] items-start gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <div className="max-w-[40rem] lg:sticky lg:top-28">
          <Chapter n="05" label="Method" />
          <h2 className="font-editorial mt-6 text-[clamp(2.5rem,5vw,4.4rem)] leading-[0.98] text-graphite">
            Every number has
            <br />
            <span className="italic text-dusk">a line of code behind it.</span>
          </h2>
          <p className="mt-6 text-[1.05rem] leading-[1.65] text-stone">
            This is the actual source that turns a device into dollars, carbon and a payback date.
            It is short enough to read in a minute, and every wattage in the table cites where it
            came from.
          </p>

          <dl className="mt-9 space-y-4 border-t border-hair pt-7">
            {DEFAULTS.map((d) => (
              <div key={d.value} className="flex items-baseline gap-4">
                <dt className="font-editorial w-[5.5rem] shrink-0 text-[1.9rem] leading-none text-graphite">{d.value}</dt>
                <dd className="text-[0.92rem] leading-snug text-stone">{d.label}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-[0.88rem] text-pebble">The defaults. All three are yours to change.</p>

          <Link href="/methodology" className="group mt-8 inline-flex items-center gap-2 text-[0.95rem] text-graphite">
            <span className="underline decoration-graphite/25 underline-offset-[6px] group-hover:decoration-graphite">
              Read the full methodology
            </span>
            <Arrow className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40, rotateX: 8 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-0 [perspective:1600px]"
        >
          <div className="hidden sm:block">
            <CodeWindow files={[ENERGY_TS, DEVICES_TS]} />
          </div>
          <div className="sm:hidden">
            <CodeWindow files={[ENERGY_TS_SHORT]} compact />
          </div>
          <p className="mt-4 text-center text-[0.8rem] text-pebble">
            Quoted from the source. A test fails if this ever stops matching.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
