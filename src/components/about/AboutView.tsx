"use client";

// About, told the way the landing page tells things: an evening sky, a serif
// voice, chapters, and motion that means something (a light that follows you,
// words that come up out of the dark, a timeline that draws as you read).

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { Chapter } from "@/components/home/Chapter";
import { Arrow } from "@/components/home/HomeNav";
import { CountTo, Flashlight, Magnetic, ScrollWords, SplitLines, Tilt } from "@/components/motion/Motion";

const EASE = [0.22, 1, 0.36, 1] as const;

const BELIEFS = [
  {
    title: "What you can't see, nobody fixes.",
    body: "Nobody is careless on purpose. A projector humming at midnight is just invisible. Show people where the waste is and most of it gets switched off.",
  },
  {
    title: "Plain words, not jargon.",
    body: "You shouldn't need to know what a kilowatt-hour is to save money. Every number here comes in dollars, hours and things you can picture.",
  },
  {
    title: "Show the math.",
    body: "Estimates come with a range and the reason behind them. Every wattage and formula is published, so anyone can check our work.",
  },
  {
    title: "Cheapest fixes first.",
    body: "Changing a habit or setting a timer often beats buying new equipment. We rank fixes by what each dollar gets back, and free ones lead.",
  },
  {
    title: "Your photos are yours.",
    body: "No accounts and no tracking. Pictures can be read right on your device, and team scans share device lists, never photos.",
  },
];

const TEAM = [
  {
    name: "Shaurya Sahdev",
    initials: "SS",
    roles: ["Live mode", "Frontend & design"],
    body: "Built the live camera mode that boxes and prices devices as you point at them, and designed much of how the app looks and feels.",
    tone: "warm",
  },
  {
    name: "Ronit Agarwal",
    initials: "RA",
    roles: ["AI models & training", "Backend"],
    body: "Trains and tunes the vision models that find devices in a picture, and built the server side that reads photos and looks up prices.",
    tone: "cool",
  },
  {
    name: "Vyom Joshi",
    initials: "VJ",
    roles: ["Frontend", "Testing"],
    body: "Builds the screens people use every day and puts them through their paces, making sure they hold up on real phones in real rooms.",
    tone: "cool",
  },
  {
    name: "Rayan Alam",
    initials: "RA",
    roles: ["Backend & data", "Testing"],
    body: "Works on the data and services behind the numbers, from electricity prices to saved places, and tests that they add up.",
    tone: "warm",
  },
] as const;

const STEPS = [
  {
    when: "4:00 pm",
    title: "Walk the building after hours",
    body: "After the last bell, students sweep the building and point a phone at anything still drawing power: a lit lab, an idling projector, the humming vending machine.",
  },
  {
    when: "4:01 pm",
    title: "A vision model names the devices",
    body: "It identifies each device and whether it is on, in standby or off. That is all it does. In On-device mode it happens in the browser and nothing is uploaded.",
  },
  {
    when: "4:02 pm",
    title: "Plain arithmetic ranks them",
    body: "Published wattages times realistic empty hours give a dollar and CO₂ figure per device, sorted worst first, each with a costed fix and its payback.",
  },
  {
    when: "Monday",
    title: "Facilities gets a to-do list",
    body: "Timers, occupancy sensors, power strips, a shutdown policy: a one-page brief, in priority order, for whoever signs the purchase order.",
  },
];

const NOTES: { q: string; a: React.ReactNode }[] = [
  {
    q: "Why hasn't this been done?",
    a: "Commercial energy audits cost money and happen once a decade. Carbon calculators ask you to type in guesses. Nobody had put a vision model, a wattage table and a ranked to-do list in the hands of the people who actually walk the halls.",
  },
  {
    q: "What does it look like in practice?",
    a: "Point a phone at a lit, empty computer lab and it says: about $340 a year and 1.2 tonnes of CO₂ here; fix it with smart power strips, about $60, paid back in two months. That is an action, not a guilt trip.",
  },
  {
    q: "Where do the photos go?",
    a: (
      <>
        In On-device mode, nowhere: a detector in the browser reads them and nothing is uploaded. In Enhanced mode a photo is sent to the cloud vision
        model for the scan and then discarded. The pill in the header always says which mode is about to run, and every result is labelled{" "}
        <span className="text-graphite">Enhanced · cloud</span> or <span className="text-graphite">On-device</span>.
      </>
    ),
  },
  {
    q: "How accurate is it?",
    a: (
      <>
        Wattage from a photo is an estimate, and Ghost Watt never pretends otherwise. But the ranking of the worst offenders holds even when individual
        watts are fuzzy, and the ranking is what drives action. The{" "}
        <Link href="/methodology" className="text-dusk underline decoration-dusk/30 underline-offset-4 hover:decoration-dusk">
          methodology
        </Link>{" "}
        shows every figure and formula.
      </>
    ),
  },
  {
    q: "Does a team scan need accounts?",
    a: "No. Whoever starts a team gets a six-character code and a QR to put on the board. Everyone scans their own rooms on their own phone; only the device lists travel, encrypted, and the team forgets itself on its own.",
  },
];

export function AboutView() {
  return (
    <div className="home bg-paper text-graphite">
      <Hero />
      <Why />
      <Beliefs />
      <Team />
      <Timeline />
      <Notes />
      <Closing />
    </div>
  );
}

/* ---- hero ---------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <Flashlight size={560} className="-z-[5]" />
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--home-sky-1)_0%,var(--home-sky-2)_40%,var(--home-sky-3)_75%,var(--color-paper)_100%)]" />
        <div className="absolute right-[6%] top-[18%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,var(--home-sun),transparent_65%)] blur-2xl" />
        <div className="absolute -left-[10%] top-[-20%] h-[30rem] w-[40rem] rounded-full bg-[radial-gradient(circle,var(--home-haze),transparent_70%)] blur-2xl" />
      </div>

      <div className="mx-auto max-w-[84rem] px-5 pb-16 pt-32 sm:px-8 sm:pb-24 sm:pt-44">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
          className="inline-flex items-center gap-2 text-[0.82rem] text-stone"
        >
          <span className="relative flex h-2 w-2">
            <span className="soft-pulse absolute inset-0 rounded-full bg-sodium" />
            <span className="relative h-2 w-2 rounded-full bg-sodium" />
          </span>
          About Ghost Watt
        </motion.p>

        <h1 className="font-editorial mt-6 max-w-[62rem] text-[clamp(3rem,7vw,6.6rem)] leading-[0.92] text-graphite">
          <SplitLines
            delay={0.2}
            lines={[
              "The biggest easy",
              "energy win is the one",
              <span key="c" className="italic text-dusk">
                nobody measures.
              </span>,
            ]}
          />
        </h1>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.7, ease: EASE }}
            className="max-w-[36rem] text-[1.1rem] leading-[1.65] text-stone"
          >
            Everyone measures a building&apos;s daytime footprint. Almost no one measures what a school burns while it&apos;s empty: labs left on
            overnight, projectors in standby, hallway lights all weekend, the vending machine chilling soda at 2am. Ghost Watt is how you find out.
          </motion.p>

          <motion.dl
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.85, ease: EASE }}
            className="grid grid-cols-3 gap-8 border-t border-graphite/10 pt-6 lg:gap-12"
          >
            {[
              { v: <CountTo to={4} />, l: "students" },
              { v: <CountTo to={1} />, l: "phone needed" },
              { v: <CountTo to={0} prefix="$" />, l: "to use, ever" },
            ].map((s) => (
              <div key={s.l}>
                <dd className="font-editorial text-[2.6rem] leading-none text-graphite">{s.v}</dd>
                <dt className="mt-1.5 text-[0.82rem] text-pebble">{s.l}</dt>
              </div>
            ))}
          </motion.dl>
        </div>
      </div>
    </section>
  );
}

/* ---- why ----------------------------------------------------------------- */

function Why() {
  return (
    <section className="px-5 py-16 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-[62rem]">
        <Chapter n="01" label="Why we built it" />
        <ScrollWords
          className="font-editorial mt-8 text-[clamp(1.9rem,4vw,3.3rem)] leading-[1.15] text-graphite"
          emClass="italic text-sodium-deep"
          text="We noticed it walking through school after the bell: *rooms full of screens still glowing,* lights on in empty halls, machines humming for nobody. Every one of them cost money and put carbon in the air, and nobody knew how much. Audits are expensive and rare. *We wanted something anyone could pick up.*"
        />
      </div>
    </section>
  );
}

/* ---- beliefs --------------------------------------------------------------- */

function Beliefs() {
  return (
    <section className="px-5 pb-16 sm:px-8 sm:pb-28">
      <div className="mx-auto grid max-w-[84rem] gap-12 border-t border-hair pt-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24 lg:pt-24">
        <div>
          <div className="lg:sticky lg:top-28">
            <Chapter n="02" label="What we believe" />
            <h2 className="font-editorial mt-6 text-[clamp(2.4rem,4.6vw,4rem)] leading-[1.02] text-graphite">
              <SplitLines inView lines={["Five rules", <span key="b" className="italic text-dusk">we built it by.</span>]} />
            </h2>
          </div>
        </div>
        <ol className="border-t border-hair">
          {BELIEFS.map((b, i) => (
            <motion.li
              key={b.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.05, ease: EASE }}
              className="group relative grid grid-cols-[3.5rem_1fr] gap-4 border-b border-hair py-8 sm:grid-cols-[5rem_1fr]"
            >
              {/* a warm line that sweeps across on hover */}
              <span className="absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-[linear-gradient(90deg,var(--color-sodium),var(--color-flare))] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100" />
              <span className="font-numeric pt-1.5 text-[0.85rem] text-pebble transition-colors duration-300 group-hover:text-sodium-deep">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-editorial text-[clamp(1.6rem,2.6vw,2.2rem)] leading-[1.1] text-graphite transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-2">
                  {b.title}
                </h3>
                <p className="mt-3 max-w-[34rem] text-[1rem] leading-[1.7] text-stone">{b.body}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---- team ------------------------------------------------------------------ */

function Team() {
  return (
    <section className="px-5 pb-16 sm:px-8 sm:pb-28">
      <div className="mx-auto max-w-[84rem] border-t border-hair pt-16 lg:pt-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Chapter n="03" label="The team" />
            <h2 className="font-editorial mt-6 text-[clamp(2.4rem,4.6vw,4rem)] leading-[1.02] text-graphite">
              <SplitLines inView lines={["Four of us.", <span key="b" className="italic text-dusk">One building at a time.</span>]} />
            </h2>
          </div>
          <p className="max-w-[24rem] text-[0.98rem] leading-relaxed text-stone">High school students who got tired of walking past lit, empty rooms.</p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {TEAM.map((m, i) => (
            <motion.li
              key={m.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.8, delay: (i % 2) * 0.08, ease: EASE }}
            >
              <Tilt className="group h-full rounded-[1.75rem]">
                <div className="flex h-full gap-5 rounded-[1.75rem] bg-cream p-6 ring-1 ring-hair transition-shadow duration-500 group-hover:shadow-[0_30px_60px_-30px_rgba(58,69,102,0.45)] sm:p-7">
                  {/* a lit window with their initials in it */}
                  <span
                    aria-hidden
                    className={`relative grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-[0.6rem] font-editorial text-[1.6rem] text-[#1c1b18] transition-shadow duration-500 ${
                      m.tone === "cool"
                        ? "bg-[linear-gradient(180deg,#dfe9ff,#a9c8ff)] group-hover:shadow-[0_0_30px_rgba(169,200,255,0.75)]"
                        : "bg-[linear-gradient(180deg,#ffe2b0,#ffb54a)] group-hover:shadow-[0_0_30px_rgba(255,181,74,0.75)]"
                    }`}
                  >
                    <span className="absolute inset-x-0 top-1/2 h-px bg-black/10" />
                    <span className="absolute inset-y-0 left-1/2 w-px bg-black/10" />
                    <span className="relative">{m.initials}</span>
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[1.2rem] font-semibold tracking-[-0.01em] text-graphite">{m.name}</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.roles.map((r) => (
                        <span key={r} className="rounded-full bg-graphite/[0.06] px-2.5 py-0.5 text-[0.78rem] font-medium text-stone">
                          {r}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-[0.96rem] leading-relaxed text-stone">{m.body}</p>
                  </div>
                </div>
              </Tilt>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---- how: a timeline that draws as you read ----------------------------------- */

function Timeline() {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.75", "end 0.55"] });
  const draw = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });

  return (
    <section className="px-5 pb-16 sm:px-8 sm:pb-28">
      <div className="mx-auto max-w-[84rem] border-t border-hair pt-16 lg:pt-24">
        <Chapter n="04" label="How it works" />
        <h2 className="font-editorial mt-6 max-w-[48rem] text-[clamp(2.4rem,4.6vw,4rem)] leading-[1.02] text-graphite">
          <SplitLines inView lines={["An audit costs money and", "happens once a decade.", <span key="c" className="italic text-dusk">This costs a walk.</span>]} />
        </h2>

        <ol ref={ref} className="relative mt-14 grid gap-12 md:grid-cols-4 md:gap-8">
          {/* the rail, and the warm line that fills it */}
          <span className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-px bg-hair md:left-0 md:top-[7px] md:h-px md:w-full" />
          <motion.span
            style={{ scaleY: draw }}
            className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-px origin-top bg-[linear-gradient(180deg,var(--color-sodium),var(--color-flare))] md:hidden"
          />
          <motion.span
            style={{ scaleX: draw }}
            className="absolute left-0 top-[7px] hidden h-px w-full origin-left bg-[linear-gradient(90deg,var(--color-sodium),var(--color-flare))] md:block"
          />
          {STEPS.map((s, i) => (
            <motion.li
              key={s.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
              className="relative pl-9 md:pl-0 md:pt-10"
            >
              <span className="absolute left-0 top-1 grid h-[15px] w-[15px] place-items-center rounded-full bg-paper ring-1 ring-sodium md:top-0">
                <span className="h-[7px] w-[7px] rounded-full bg-sodium shadow-[0_0_10px_rgba(239,157,46,0.8)]" />
              </span>
              <p className="font-numeric text-[0.8rem] text-sodium-deep">{s.when}</p>
              <h3 className="mt-2 text-[1.12rem] font-semibold text-graphite">{s.title}</h3>
              <p className="mt-2 text-[0.96rem] leading-relaxed text-stone">{s.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---- notes ------------------------------------------------------------------- */

function Notes() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="px-5 pb-20 sm:px-8 sm:pb-28">
      <div className="mx-auto grid max-w-[84rem] gap-12 border-t border-hair pt-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24 lg:pt-24">
        <div>
          <Chapter n="05" label="Honest answers" />
          <h2 className="font-editorial mt-6 text-[clamp(2.4rem,4.6vw,4rem)] leading-[1.02] text-graphite">
            <SplitLines inView lines={["The questions", <span key="b" className="italic text-dusk">people actually ask.</span>]} />
          </h2>
        </div>
        <ul className="border-t border-hair">
          {NOTES.map((n, i) => {
            const isOpen = open === i;
            return (
              <li key={n.q} className="border-b border-hair">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="group flex w-full items-center justify-between gap-6 py-6 text-left"
                >
                  <span className="text-[1.15rem] font-medium text-graphite transition-colors group-hover:text-dusk">{n.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${isOpen ? "bg-graphite text-paper" : "bg-graphite/[0.06] text-graphite"}`}
                  >
                    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.45, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-[40rem] pb-7 text-[1.02rem] leading-[1.7] text-stone">{n.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ---- closing ----------------------------------------------------------------- */

function Closing() {
  return (
    <section className="px-3 pb-10 sm:px-6">
      <div className="grain relative isolate mx-auto max-w-[86rem] overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,#2a3150_0%,#1d2238_70%,#191d30_100%)] px-6 py-20 text-center text-moon sm:rounded-[2.75rem] sm:py-28">
        <Flashlight size={600} />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(160,175,230,0.25),transparent)]" />
        <h2 className="font-editorial relative mx-auto max-w-[44rem] text-[clamp(2.6rem,6vw,5rem)] leading-[0.96]">
          <SplitLines inView lines={["Your building is", <span key="b" className="italic text-[#ffc777]">on right now.</span>]} />
        </h2>
        <p className="relative mx-auto mt-6 max-w-[30rem] text-[1.05rem] leading-[1.65] text-moon/70">
          Scan one room tonight. It takes a minute, costs nothing, and nothing is installed.
        </p>
        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
          <Magnetic>
            <Link
              href="/scan"
              className="group inline-flex items-center gap-3 rounded-full bg-moon py-3.5 pl-6 pr-4 text-[0.95rem] font-medium text-[#1c1b18] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Start a free scan
              <span className="grid h-7 w-7 place-items-center rounded-full bg-sodium transition-transform group-hover:translate-x-0.5">
                <Arrow />
              </span>
            </Link>
          </Magnetic>
          <Link href="/team" className="text-[0.95rem] text-moon/80 underline decoration-moon/25 underline-offset-[6px] hover:decoration-moon">
            Start a team scan
          </Link>
        </div>
      </div>
    </section>
  );
}
