"use client";

// The math, as a sentence you can argue with.
//
// Every figure in the sentence can be dragged, and the conclusion rewrites itself.
// The point being made is the product's central design choice: the camera only
// says what is in the room, and everything after that is arithmetic anyone can
// check, so it is shown as arithmetic.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { Chapter } from "./Chapter";
import { Cite } from "@/components/Cite";
import { Arrow } from "./HomeNav";

const THINGS = [
  { name: "projector", watts: 250 },
  { name: "vending machine", watts: 220 },
  { name: "lab of thirty monitors", watts: 900 },
  { name: "hallway of lights", watts: 520 },
];

const KG_PER_KWH = 0.35;
const KG_PER_MILE = 0.4;

const int = (n: number) => Math.round(n).toLocaleString("en-US");

export function CountSection() {
  const [thing, setThing] = useState(0);
  const [watts, setWatts] = useState(THINGS[0].watts);
  const [hours, setHours] = useState(6800);
  const [rate, setRate] = useState(0.13);
  const [touched, setTouched] = useState(false);

  const kwh = (watts * hours) / 1000;
  const dollars = kwh * rate;
  const kg = kwh * KG_PER_KWH;

  const cycle = () => {
    const next = (thing + 1) % THINGS.length;
    setThing(next);
    setWatts(THINGS[next].watts);
    setTouched(true);
  };

  return (
    <section id="count" className="scroll-mt-16 px-3 py-10 sm:px-6 sm:py-16">
      <div className="relative mx-auto max-w-[86rem] overflow-hidden rounded-[2rem] bg-cream px-6 py-20 shadow-[0_1px_0_rgba(28,27,24,0.04),0_40px_80px_-50px_rgba(58,69,102,0.35)] ring-1 ring-hair/70 sm:rounded-[2.75rem] sm:px-14 sm:py-28 lg:px-20">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(239,157,46,0.16),transparent_65%)]" />

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <Chapter n="02" label="Count" />
          <p
            className={`flex items-center gap-2 text-[0.82rem] text-pebble transition-opacity duration-700 ${touched ? "opacity-0" : "opacity-100"}`}
            aria-hidden={touched}
          >
            <DragIcon /> Drag any underlined number
          </p>
        </div>

        <p className="font-editorial relative mt-10 max-w-[64rem] text-[clamp(1.9rem,3.9vw,3.4rem)] leading-[1.28] text-graphite">
          One{" "}
          <button
            type="button"
            onClick={cycle}
            className="group inline-flex items-baseline gap-1 rounded-md italic text-dusk decoration-dusk/40 decoration-[1.5px] underline-offset-[0.18em] hover:underline"
            aria-label={`Device: ${THINGS[thing].name}. Click to change.`}
          >
            {THINGS[thing].name}
            <svg viewBox="0 0 12 12" className="h-[0.42em] w-[0.42em] self-center opacity-50 transition-transform group-hover:rotate-180" aria-hidden="true">
              <path d="M2 4.5l4 3.5 4-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>{" "}
          drawing{" "}
          <Scrub value={watts} min={10} max={2000} step={10} onChange={(v) => { setWatts(v); setTouched(true); }} format={(v) => `${int(v)} watts`} label="Power draw in watts" />, left on for{" "}
          <Scrub value={hours} min={500} max={8760} step={100} onChange={(v) => { setHours(v); setTouched(true); }} format={(v) => int(v)} label="Empty hours per year" />{" "}
          empty hours a year, at{" "}
          <Scrub value={rate} min={0.05} max={0.45} step={0.01} onChange={(v) => { setRate(v); setTouched(true); }} format={(v) => `$${v.toFixed(2)}`} label="Electricity price per kilowatt-hour" />{" "}
          a kilowatt-hour, costs your building{" "}
          <Figure value={dollars} prefix="$" className="text-sodium-deep" />{" "}
          a year and puts <Figure value={kg} suffix=" kg" className="text-moss" /> of CO₂ into the air.
        </p>

        <div className="relative mt-14 grid gap-10 border-t border-hair pt-8 lg:grid-cols-[1.4fr_1fr] lg:gap-20">
          <p className="font-numeric text-[0.82rem] leading-[1.9] text-pebble">
            <span className="text-graphite">{int(watts)} W</span> × <span className="text-graphite">{int(hours)} h</span> ={" "}
            {int(kwh)} kWh
            <br />
            {int(kwh)} kWh × <span className="text-graphite">${rate.toFixed(2)}</span> ={" "}
            <span className="text-sodium-deep">${int(dollars)}</span>
            <br />
            {int(kwh)} kWh × {KG_PER_KWH} kg/kWh = <span className="text-moss">{int(kg)} kg CO₂</span>
            <span className="text-pebble/70">, about a {int(kg / KG_PER_MILE)}-mile drive</span>
            <Cite
              className="mt-3 font-sans text-pebble"
              items={[
                { id: "catalog", name: "wattage table" },
                { id: "eia-table4-2024", name: "EIA prices" },
                { id: "egrid", name: "EPA eGRID" },
                { id: "epa-ghg-equivalencies", name: "EPA per-mile CO₂" },
              ]}
            />
          </p>
          <div>
            <p className="text-[1rem] leading-[1.65] text-stone">
              The camera only tells Ghost Watt <em className="font-editorial text-[1.15em] text-graphite">what</em> is in the
              room. Every dollar and kilogram after that is plain arithmetic like this, from a
              published wattage table, with your own rates. Same photo, same answer, every time.
            </p>
            <Link href="/methodology" className="group mt-5 inline-flex items-center gap-2 text-[0.95rem] text-graphite">
              <span className="underline decoration-graphite/25 underline-offset-[6px] group-hover:decoration-graphite">
                Read every formula and source
              </span>
              <Arrow className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A number you can drag sideways, or nudge with the arrow keys. */
function Scrub({
  value,
  min,
  max,
  step,
  onChange,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  label: string;
}) {
  const start = useRef<{ x: number; v: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  // A full drag across ~400px sweeps the whole range.
  const perPx = (max - min) / 400;

  return (
    <span
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, v: value };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onChange(clamp(start.current.v + (e.clientX - start.current.x) * perPx));
      }}
      onPointerUp={() => {
        start.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
      }}
      onKeyDown={(e) => {
        const big = e.shiftKey || e.key.startsWith("Page") ? 10 : 1;
        if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp") {
          e.preventDefault();
          onChange(clamp(value + step * big));
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown") {
          e.preventDefault();
          onChange(clamp(value - step * big));
        }
      }}
      className={`relative inline-block cursor-ew-resize touch-none select-none whitespace-nowrap rounded-md px-[0.08em] text-graphite underline decoration-dotted decoration-[1.5px] underline-offset-[0.2em] transition-colors ${
        dragging ? "bg-sodium/20 decoration-sodium-deep" : "decoration-graphite/40 hover:bg-graphite/[0.05]"
      }`}
    >
      {format(value)}
    </span>
  );
}

/** The conclusion, easing toward each new value rather than snapping. */
function Figure({ value, prefix = "", suffix = "", className = "" }: { value: number; prefix?: string; suffix?: string; className?: string }) {
  const spring = useSpring(value, { stiffness: 140, damping: 24 });
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  const text = useTransform(spring, (v) => `${prefix}${int(v)}${suffix}`);
  return <motion.span className={`italic ${className}`}>{text}</motion.span>;
}

function DragIcon() {
  return (
    <svg viewBox="0 0 20 12" className="h-3 w-5" aria-hidden="true">
      <path d="M1 6h18M4 3L1 6l3 3M16 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
