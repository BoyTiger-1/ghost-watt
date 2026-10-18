"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { Phone } from "./Devices";
import { TrackingFeed } from "./TrackingFeed";
import { Chapter } from "./Chapter";

const CALLOUTS = [
  { top: "9%", title: "Runs in the browser", body: "The detector runs on the phone itself. Nothing to install, and nothing to sign up for." },
  { top: "52%", title: "Boxes every device", body: "Each one is tagged on, standby or off, and priced the moment it is recognised." },
  { top: "84%", title: "Hold still to audit", body: "Pause on a view for under a second and it sends that frame for a full audit." },
];

export function SeeSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const p = useSpring(scrollYProgress, { stiffness: 80, damping: 22, mass: 0.4 });
  const rotateY = useTransform(p, [0, 0.5, 1], [-26, -4, 8]);
  const rotateX = useTransform(p, [0, 0.5, 1], [10, 2, -4]);
  const y = useTransform(p, [0, 0.5, 1], [80, 0, -60]);

  return (
    <section id="see" ref={ref} className="relative scroll-mt-16 overflow-hidden px-5 py-16 sm:px-8 sm:py-32">
      <div className="mx-auto grid max-w-[84rem] items-center gap-14 lg:grid-cols-[1fr_auto_17rem] lg:gap-16">
        <div className="max-w-[30rem]">
          <Chapter n="01" label="See" />
          <h2 className="font-editorial mt-6 text-[clamp(2.5rem,5vw,4.4rem)] leading-[0.98] text-graphite">
            Point it at a room.
            <br />
            <span className="italic text-dusk">
              It sees what
              <br />
              was left on.
            </span>
          </h2>
          <p className="mt-6 text-[1.05rem] leading-[1.65] text-stone">
            Walk the building after hours with the camera open. Ghost Watt boxes the projectors,
            monitors, vending machines and lights it recognises, live, and keeps a running tally
            of what this room costs to leave on.
          </p>
          <p className="mt-4 text-[1.05rem] leading-[1.65] text-stone">
            No meters, no clipboard, no consultant. A whole school takes about ten minutes.
          </p>

          {/* on narrow screens the callouts become a short list */}
          <dl className="mt-10 space-y-5 border-t border-hair pt-8 lg:hidden">
            {CALLOUTS.map((c) => (
              <div key={c.title}>
                <dt className="text-[0.95rem] font-medium text-graphite">{c.title}</dt>
                <dd className="mt-1 text-[0.92rem] leading-relaxed text-stone">{c.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* phone: the feed itself, as a card */}
        <div className="-mx-1 md:hidden">
          <div className="relative aspect-[300/460] overflow-hidden rounded-[1.75rem] shadow-[0_30px_60px_-30px_rgba(29,34,56,0.7)] [container-type:inline-size]">
            <div className="absolute inset-0 text-[3.6cqw]">
              <TrackingFeed crop />
            </div>
          </div>
          <p className="mt-3 text-center text-[0.8rem] text-pebble">What the camera sees, live.</p>
        </div>

        <div className="relative mx-auto hidden [perspective:1800px] md:block">
          {/* a pool of light on the table under the phone */}
          <div className="absolute left-1/2 top-[55%] -z-10 h-[70%] w-[160%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(154,168,214,0.45),rgba(255,190,120,0.18)_55%,transparent)] blur-2xl" />
          <motion.div style={{ rotateY, rotateX, y }} className="[transform-style:preserve-3d]">
            <Phone className="w-[17rem] sm:w-[19.5rem]">
              <TrackingFeed />
            </Phone>
          </motion.div>

          <div className="pointer-events-none absolute inset-y-0 left-[calc(100%-2.5rem)] hidden w-[19rem] lg:block">
            {CALLOUTS.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.8, delay: 0.3 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="absolute left-0 flex w-full items-start gap-4"
                style={{ top: c.top }}
              >
                <span className="mt-[0.6rem] flex w-20 shrink-0 items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-graphite" />
                  <span className="h-px flex-1 bg-graphite/30" />
                </span>
                <div>
                  <p className="text-[0.95rem] font-medium text-graphite">{c.title}</p>
                  <p className="mt-1 text-[0.88rem] leading-relaxed text-stone">{c.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="hidden lg:block" />
      </div>
    </section>
  );
}
