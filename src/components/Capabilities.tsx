"use client";

// What is actually behind the scan button.
//
// The obvious criticism of anything that starts with "point your phone at it" is
// that the model is doing all the work and the rest is a skin. This band exists
// to answer that in public: the vision model contributes one thing - a list of
// what is in the room - and everything a school would actually act on comes out
// of code that runs identically with the model switched off.

import Link from "next/link";
import { motion } from "framer-motion";
import { Reveal } from "./Reveal";
import { DEVICE_CATALOG } from "@/lib/devices";
import { REGIONS } from "@/lib/grid";
import { BUILDING_TYPES } from "@/lib/benchmark";

const PIPELINE = [
  {
    stage: "perception",
    weight: "the model",
    body: "A local vision model names what is in the photo. That is the entire extent of its job - it never sees a watt, a dollar or a kilogram.",
    tint: "var(--color-amber)",
    share: 0.18,
  },
  {
    stage: "accounting",
    weight: "deterministic",
    body: `Each device is matched to one of ${DEVICE_CATALOG.length} categories with a published wattage range, a duty cycle and a costed fix. Same input, same answer, every time.`,
    tint: "var(--color-cyan)",
    share: 1,
  },
  {
    stage: "decision",
    weight: "optimisation",
    body: "An exact 0/1 knapsack solves for the best set of fixes your actual budget can buy, with payback, ten-year NPV and a CO₂ figure attached.",
    tint: "var(--color-lime)",
    share: 0.7,
  },
];

const CAPS = [
  {
    href: "/scan",
    title: "Scan a room",
    body: "Photo, or no photo at all - a room-profile estimate works with the model off, so a demo never blanks.",
    stat: `${DEVICE_CATALOG.length} device categories`,
  },
  {
    href: "/scan",
    title: "Plan against a budget",
    body: "Give it the $250 the PTA actually has. It returns the exact combination of fixes that buys the most back.",
    stat: "exact knapsack, not greedy",
  },
  {
    href: "/portfolio",
    title: "Prove it worked",
    body: "Log what got installed, re-scan later, and get a device-by-device verdict on whether the load really went away.",
    stat: "expected vs verified",
  },
  {
    href: "/scan",
    title: "Know when, not just how much",
    body: "Live hourly fuel mix from the grid operator serving you. The same kilowatt-hour is worth different carbon depending on the hour it burns.",
    stat: "EIA-930, computed here",
  },
  {
    href: "/methodology",
    title: "Argue with the numbers",
    body: "Every wattage, range and source is published on one page. An estimate you cannot audit is a guess with better typography.",
    stat: "all sources shown",
  },
  {
    href: "/settings",
    title: "Run anywhere",
    body: `${REGIONS.length} state rates and eGRID carbon intensities, ${BUILDING_TYPES.length} building types from schools to utilities, stored locally.`,
    stat: "works with zero keys",
  },
  {
    href: "/scan",
    title: "Hand it to facilities",
    body: "CSV, a printable one-page brief, and a copyable summary - in the form the person who signs the work order already uses.",
    stat: "nothing leaves the device",
  },
];

export function Capabilities() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <p className="mono-label text-cyan">not a wrapper</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-fog sm:text-5xl">
          The model does one job.{" "}
          <span className="grad-energy">The rest is arithmetic.</span>
        </h2>
      </Reveal>

      {/* the three stages, sized by how much of the work they do */}
      <div className="mt-14 grid gap-px overflow-hidden border border-line bg-line lg:grid-cols-3">
        {PIPELINE.map((p, i) => (
          <Reveal key={p.stage} delay={i * 0.08}>
            <div className="relative h-full bg-ink p-7">
              <span
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: p.tint }}
              />
              <div className="flex items-baseline justify-between gap-3">
                <span className="mono-label" style={{ color: p.tint }}>
                  {p.stage}
                </span>
                <span className="font-mono text-[0.62rem] uppercase tracking-wider text-dim">
                  {p.weight}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-mist">{p.body}</p>
              {/* The scroll trigger lives on the track, not the bar. A bar that
                  starts at scaleX(0) has a zero-width box, and an element with no
                  box never reports as intersecting - so the shortest bar is
                  exactly the one that would silently never animate. */}
              <motion.div
                className="mt-5 h-0.5 w-full bg-line"
                initial="hidden"
                whileInView="shown"
                viewport={{ once: true, margin: "-80px" }}
              >
                <motion.span
                  className="block h-full origin-left"
                  style={{ background: p.tint }}
                  variants={{ hidden: { scaleX: 0 }, shown: { scaleX: p.share } }}
                  transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: "easeOut" }}
                />
              </motion.div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.1}>
        <p className="mt-4 font-mono text-[0.72rem] leading-relaxed text-dim">
          Bar length is roughly how much of the final answer each stage is responsible for.
          Switch the model off and the middle and right bars are unchanged.
        </p>
      </Reveal>

      {/* what you can actually do */}
      <div className="mt-16 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {CAPS.map((c, i) => (
          <Reveal key={c.title} delay={(i % 3) * 0.06}>
            <Link
              href={c.href}
              className="group block h-full bg-ink p-7 transition-colors hover:bg-surface"
            >
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 grad-energy-bg" />
                <h3 className="text-base font-bold text-fog">{c.title}</h3>
                <span className="ml-auto font-mono text-xs text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-cyan">
                  →
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-mist">{c.body}</p>
              <p className="mt-4 font-mono text-[0.66rem] uppercase tracking-wider text-cyan">
                {c.stat}
              </p>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
