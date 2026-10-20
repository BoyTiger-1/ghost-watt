import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "@/components/Reveal";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "About - Ghost Watt",
  description:
    "Why Ghost Watt exists and how it works: the after-hours energy map nobody has, built so students can hand facilities a prioritized fix list they can act on Monday.",
};

// The page reads as a story: why it exists, how it works, what it stands for,
// who made it, then the questions people ask.

const STEPS = [
  {
    title: "Walk the building after hours",
    body: "At 4pm or after close, students sweep the building and point a phone at anything still drawing power: a lit lab, an idling projector, the humming vending machine.",
  },
  {
    title: "A vision model names the devices",
    body: "It identifies each device and whether it is on, in standby or off. That is all it does. In On-device mode it happens in the browser and nothing is uploaded.",
  },
  {
    title: "Plain arithmetic ranks them",
    body: "Published wattages times realistic empty hours give a dollar and CO₂ figure per device, sorted worst first, each with a costed fix and its payback.",
  },
];

const BELIEFS = [
  {
    title: "What you can't see, nobody fixes",
    body: "Nobody is careless on purpose. A projector humming at midnight is just invisible. Show people where the waste is and most of it gets switched off.",
  },
  {
    title: "Plain words, not jargon",
    body: "You shouldn't need to know what a kilowatt-hour is to save money. Every number here comes in dollars, hours and things you can picture.",
  },
  {
    title: "Show the math",
    body: "Estimates come with a range and the reason behind them. Every wattage and formula is published, so anyone can check our work.",
  },
  {
    title: "Cheapest fixes first",
    body: "Changing a habit or setting a timer often beats buying new equipment. We rank fixes by what each dollar gets back, and free ones lead.",
  },
  {
    title: "Your photos are yours",
    body: "No accounts and no tracking. Pictures can be read right on your device, and team scans share device lists, never photos.",
  },
];

const TEAM = [
  {
    name: "Shaurya Sahdev",
    initials: "SS",
    roles: ["Live mode", "Frontend & design"],
    body: "Built the live camera mode that boxes and prices devices as you point at them, and designed much of how the app looks and feels.",
  },
  {
    name: "Ronit Agarwal",
    initials: "RA",
    roles: ["AI models & training", "Backend"],
    body: "Trains and tunes the vision models that find devices in a picture, and built the server side that reads photos and looks up prices.",
  },
  {
    name: "Vyom Joshi",
    initials: "VJ",
    roles: ["Frontend", "Testing"],
    body: "Builds the screens people use every day and puts them through their paces, making sure they hold up on real phones in real rooms.",
  },
  {
    name: "Rayan Alam",
    initials: "RA",
    roles: ["Backend & data", "Testing"],
    body: "Works on the data and services behind the numbers, from electricity prices to saved places, and tests that they add up.",
  },
];

const NOTES: { q: string; a: ReactNode }[] = [
  {
    q: "Why hasn't this been done?",
    a: "Commercial energy audits cost money and happen once a decade. Carbon calculators ask you to type in guesses. Nobody had put a vision model, a wattage table and a ranked to-do list in the hands of the people who actually walk the halls.",
  },
  {
    q: "What does it look like in practice?",
    a: "Point a phone at a lit, empty computer lab and it says: about $340 a year and 1.2 tonnes of CO₂ here; fix it with smart power strips, about $60, paid back in two months. That is an action, not a guilt trip.",
  },
  {
    q: "What does a school get at the end?",
    a: "A prioritised list facilities can act on Monday (timers, occupancy sensors, power strips, a shutdown policy) and a one-page brief for whoever signs the purchase order.",
  },
  {
    q: "Where do the photos go?",
    a: (
      <>
        In On-device mode, nowhere: a detector in the browser reads them and nothing is uploaded. In Enhanced mode a photo is sent to the cloud vision
        model for the scan and then discarded. The pill in the header always says which mode is about to run, and every result is labelled{" "}
        <span className="text-fog">Enhanced · cloud</span> or <span className="text-fog">On-device</span>.
      </>
    ),
  },
  {
    q: "How accurate is it?",
    a: (
      <>
        Wattage from a photo is an estimate, and Ghost Watt never pretends otherwise. But the ranking of the worst offenders holds even when individual
        watts are fuzzy, and the ranking is what drives action. The{" "}
        <Link href="/methodology" className="text-cyan underline decoration-cyan/30 underline-offset-4 hover:decoration-cyan">
          methodology
        </Link>{" "}
        shows every figure and formula.
      </>
    ),
  },
  {
    q: "Does a team scan need accounts?",
    a: "No. Whoever starts a team gets a six-character code and a QR code for the board. Everyone scans their own rooms on their own phone, and only the device lists travel.",
  },
];

/** A section's eyebrow and serif heading, the same voice as the page header. */
function SectionHead({ eyebrow, title, accent }: { eyebrow: string; title: ReactNode; accent?: ReactNode }) {
  return (
    <Reveal>
      <p className="flex items-center gap-2 text-[0.82rem] text-mist">
        <span className="h-1.5 w-1.5 rounded-full bg-sodium" />
        {eyebrow}
      </p>
      <h2 className="font-editorial mt-3 text-[2rem] leading-[1.08] text-fog sm:text-[2.6rem]">
        {title}
        {accent && (
          <>
            {" "}
            <span className="italic text-cyan">{accent}</span>
          </>
        )}
      </h2>
    </Reveal>
  );
}

export default function AboutPage() {
  return (
    <div className="relative">
      {/* the landing page's evening sky, faintly, behind the header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[linear-gradient(180deg,var(--home-sky-1),var(--home-sky-3)_70%,transparent)] opacity-80" />

      <div className="mx-auto max-w-6xl px-5 pb-12 pt-24 sm:px-6 sm:pt-32">
        <Reveal>
          <PageHeader eyebrow="About" title="The biggest easy energy win" accent="is the one nobody measures.">
            Everyone measures a building&apos;s daytime footprint. Almost no one measures what a school burns while it&apos;s empty: labs left on
            overnight, projectors in standby, hallway lights all weekend, the vending machine chilling soda at 2am. Most schools have no idea what that
            number is. Ghost Watt is how you find out.
          </PageHeader>
        </Reveal>

        {/* 1. why we built it */}
        <section className="mt-20 grid gap-10 sm:mt-24 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <SectionHead eyebrow="Our story" title="Why we built it." />
          <Reveal delay={0.06}>
            <div className="space-y-4 text-[1.05rem] leading-relaxed text-mist">
              <p>
                We noticed it walking through school after the bell: rooms full of screens still glowing, lights on in empty halls, machines humming for
                nobody. Every one of them was costing money and putting carbon into the air, and nobody knew how much.
              </p>
              <p>
                Energy audits are expensive and rare, and the tools that exist assume you already speak the language of kilowatts. We wanted something
                anyone could pick up: point a phone at a room, see what&apos;s wasting power, and know exactly what to do about it, starting with what&apos;s
                free.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {[
                ["$221", "one projector left on after hours, for a year"],
                ["6,800", "hours a year a school stands empty"],
                ["10 min", "for thirty students scanning three or four rooms each"],
              ].map(([v, l]) => (
                <div key={v} className="bg-surface px-4 py-4 sm:px-5">
                  <div className="font-editorial text-[1.9rem] leading-none text-fog">{v}</div>
                  <div className="mt-1.5 text-[0.78rem] leading-snug text-dim">{l}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* 2. how it works */}
        <section className="mt-20 border-t border-line pt-14 sm:mt-24">
          <SectionHead eyebrow="How it works" title="A professional audit costs money and happens once a decade." accent="This costs a walk." />
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.08} className="h-full">
                <li className="panel panel-hover lift relative h-full p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-fog font-editorial text-[1.3rem] text-ink">{i + 1}</span>
                  <h3 className="mt-4 text-[1.08rem] font-semibold text-fog">{s.title}</h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{s.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* 3. what we believe */}
        <section className="mt-20 border-t border-line pt-14 sm:mt-24">
          <SectionHead eyebrow="What we believe" title="Five rules" accent="we built it by." />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BELIEFS.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.05} className="h-full">
                <li className="panel panel-hover lift h-full p-6">
                  <span className="font-numeric text-[0.78rem] text-amber">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 text-[1.05rem] font-semibold text-fog">{b.title}</h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{b.body}</p>
                </li>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* 4. the team */}
        <section className="mt-20 border-t border-line pt-14 sm:mt-24">
          <SectionHead eyebrow="The team" title="Four of us." accent="One building at a time." />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {TEAM.map((m, i) => (
              <Reveal key={m.name} delay={i * 0.06} className="h-full">
                <li className="panel panel-hover lift flex h-full gap-5 p-6">
                  <span
                    aria-hidden
                    className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(160deg,#ffe2b0,#ffb54a)] font-editorial text-[1.5rem] text-[#1c1b18] shadow-[0_8px_24px_-10px_rgba(255,170,80,0.7)]"
                  >
                    {m.initials}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[1.15rem] font-semibold text-fog">{m.name}</h3>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.roles.map((r) => (
                        <span key={r} className="rounded-full bg-fog/[0.06] px-2.5 py-0.5 text-[0.78rem] font-medium text-mist">
                          {r}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-[0.95rem] leading-relaxed text-mist">{m.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* 5. questions */}
        <section className="mt-20 border-t border-line pt-14 sm:mt-24">
          <SectionHead eyebrow="Questions" title="A few honest answers." />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {NOTES.map((n, i) => (
              <Reveal key={n.q} delay={(i % 2) * 0.06} className="h-full">
                <div className="panel h-full p-6">
                  <h3 className="text-[1.05rem] font-semibold text-fog">{n.q}</h3>
                  <p className="mt-2 text-[0.96rem] leading-relaxed text-mist">{n.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <Reveal>
          <div className="mt-20 flex flex-col items-start justify-between gap-6 rounded-[1.75rem] bg-fog px-7 py-9 text-ink sm:mt-24 sm:flex-row sm:items-center sm:px-10">
            <div>
              <h2 className="font-editorial text-[2rem] leading-[1.05] sm:text-[2.4rem]">
                Your building is <span className="italic text-sodium">on right now.</span>
              </h2>
              <p className="mt-2 text-[0.98rem] text-ink/70">Scan one room tonight. It takes a minute and costs nothing.</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/scan"
                className="rounded-full bg-sodium px-6 py-3 text-[0.95rem] font-medium text-[#1c1b18] transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                Start a scan
              </Link>
              <Link href="/methodology" className="text-[0.95rem] text-ink/80 underline decoration-ink/30 underline-offset-[6px] hover:decoration-ink">
                Read the methodology
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
