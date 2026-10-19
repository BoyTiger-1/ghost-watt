"use client";

// Thirty phones, one building. A floor plan fills in room by room as people
// send their scans, which is what a team scan looks like on the screen that started it.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView } from "framer-motion";
import { Chapter } from "./Chapter";
import { Arrow } from "./HomeNav";

type Room = { x: number; y: number; w: number; h: number; name: string; cost?: number; who: string };

const ROOMS: Room[] = [
  { x: 20, y: 20, w: 100, h: 130, name: "101", who: "AM" },
  { x: 120, y: 20, w: 100, h: 130, name: "102", cost: 64, who: "JR" },
  { x: 220, y: 20, w: 140, h: 130, name: "Lab 108", cost: 486, who: "MK" },
  { x: 360, y: 20, w: 100, h: 130, name: "110", who: "TS" },
  { x: 460, y: 20, w: 120, h: 130, name: "Library", cost: 141, who: "DL" },
  { x: 20, y: 190, w: 180, h: 130, name: "Gym", cost: 310, who: "PB" },
  { x: 200, y: 190, w: 100, h: 130, name: "Lobby", cost: 132, who: "EW" },
  { x: 300, y: 190, w: 80, h: 130, name: "Office", cost: 58, who: "SN" },
  { x: 380, y: 190, w: 120, h: 130, name: "Cafeteria", cost: 212, who: "RC" },
  { x: 500, y: 190, w: 80, h: 130, name: "Music", who: "YO" },
];

const TOTAL = ROOMS.reduce((s, r) => s + (r.cost ?? 0), 0);

export function ClassSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const a = animate(0, TOTAL, { duration: ROOMS.length * 0.28 + 0.6, ease: "linear", onUpdate: (v) => setTotal(Math.round(v)) });
    return () => a.stop();
  }, [inView]);

  return (
    <section id="class" className="relative scroll-mt-16 px-5 py-16 sm:px-8 sm:py-32">
      <div className="mx-auto grid max-w-[84rem] items-center gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="max-w-[30rem]">
          <Chapter n="04" label="Together" />
          <h2 className="font-editorial mt-6 text-[clamp(2.5rem,5vw,4.4rem)] leading-[0.98] text-graphite">
            Thirty phones.
            <br />
            <span className="italic text-dusk">
              One building.
              <br />
              Ten minutes.
            </span>
          </h2>
          <p className="mt-6 text-[1.05rem] leading-[1.65] text-stone">
            Start a team scan and share the link. Everyone scans the rooms they&apos;re in on
            their own phone, and the total for the whole place fills in as the results arrive.
          </p>
          <p className="mt-4 text-[1.05rem] leading-[1.65] text-stone">
            No accounts, no logins, no email addresses. Photos stay on the phone that took
            them; only the device counts travel.
          </p>
          <Link href="/team" className="group mt-8 inline-flex items-center gap-2 text-[0.95rem] text-graphite">
            <span className="underline decoration-graphite/25 underline-offset-[6px] group-hover:decoration-graphite">
              Start a team scan
            </span>
            <Arrow className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div ref={ref} className="relative">
          {/* phone: the same session as a feed, newest first */}
          <div className="rounded-[1.75rem] bg-cream p-5 ring-1 ring-hair md:hidden">
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-graphite px-2.5 py-1 font-numeric text-[0.8rem] tracking-[0.18em] text-paper">K7QM4P</span>
              <span className="text-[0.8rem] text-stone">
                <span className="font-numeric text-sodium-deep">${total.toLocaleString("en-US")}</span>/yr found
              </span>
            </div>
            <ul className="mt-4 space-y-1.5">
              {ROOMS.map((r, i) => (
                <motion.li
                  key={r.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.28 }}
                  className="flex items-center gap-3 rounded-2xl bg-paper px-3 py-2"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-graphite text-[0.68rem] font-medium text-paper">{r.who}</span>
                  <span className="min-w-0 flex-1 text-[0.92rem] text-graphite">{r.name}</span>
                  {r.cost !== undefined ? (
                    <span className="font-editorial text-[1.25rem] italic text-sodium-deep">${r.cost}</span>
                  ) : (
                    <span className="font-editorial text-[1.1rem] italic text-moss">all off</span>
                  )}
                </motion.li>
              ))}
            </ul>
            <p className="mt-3 text-center text-[0.78rem] text-pebble">27 phones · results arrive as each room is scanned</p>
          </div>

          <div className="hidden md:block">
          <div className="rounded-[1.75rem] bg-cream p-4 shadow-[0_40px_80px_-50px_rgba(58,69,102,0.45)] ring-1 ring-hair/80 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="rounded-lg bg-graphite px-2.5 py-1 font-numeric text-[0.8rem] tracking-[0.18em] text-paper">K7QM4P</span>
                <span className="text-[0.85rem] text-stone">Lincoln Middle · 27 phones</span>
              </div>
              <span className="text-[0.85rem] text-stone">
                found so far <span className="font-numeric text-sodium-deep">${total.toLocaleString("en-US")}</span>/yr
              </span>
            </div>

            <svg viewBox="0 0 600 340" className="w-full" role="img" aria-label="Floor plan of a school filling in as rooms are scanned">
              <rect x="20" y="150" width="560" height="40" fill="#f1ede5" />
              <text x="300" y="175" textAnchor="middle" fontSize="10" fill="#a19b90" letterSpacing="3">CORRIDOR</text>
              {ROOMS.map((r, i) => {
                const d = 0.3 + i * 0.28;
                const waste = r.cost !== undefined;
                const heat = waste ? Math.min(1, (r.cost ?? 0) / 486) : 0;
                return (
                  <g key={r.name}>
                    <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#fbf9f5" stroke="#d6cfc2" strokeWidth="1.5" />
                    <motion.rect
                      x={r.x + 1}
                      y={r.y + 1}
                      width={r.w - 2}
                      height={r.h - 2}
                      fill={waste ? `rgba(239,157,46,${0.18 + heat * 0.5})` : "rgba(46,91,69,0.12)"}
                      initial={{ opacity: 0 }}
                      animate={inView ? { opacity: 1 } : {}}
                      transition={{ duration: 0.6, delay: d }}
                    />
                    <text x={r.x + 10} y={r.y + 20} fontSize="11" fill="#57534b" style={{ fontFamily: "var(--font-geist)" }}>
                      {r.name}
                    </text>
                    <motion.g initial={{ opacity: 0, y: 6 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: d + 0.15 }}>
                      <text
                        x={r.x + 10}
                        y={r.y + r.h - 14}
                        fontSize={waste && (r.cost ?? 0) > 200 ? 22 : 15}
                        fill={waste ? "#a8610c" : "#2e5b45"}
                        style={{ fontFamily: "var(--font-instrument)" }}
                        fontStyle="italic"
                      >
                        {waste ? `$${r.cost}` : "all off"}
                      </text>
                      <circle cx={r.x + r.w - 18} cy={r.y + 18} r="10" fill="#1c1b18" />
                      <text x={r.x + r.w - 18} y={r.y + 21.5} fontSize="8.5" textAnchor="middle" fill="#f5f2eb" style={{ fontFamily: "var(--font-geist)" }}>
                        {r.who}
                      </text>
                    </motion.g>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 px-2 text-[0.8rem] text-pebble">
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-sodium/60" /> left on, darker costs more</span>
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-moss/25" /> everything off</span>
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-graphite" /> who scanned it</span>
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}
