import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "About - Ghost Watt",
  description:
    "Why Ghost Watt exists and how it works: the after-hours energy map nobody has, built so students can hand facilities a prioritized fix list they can act on Monday.",
};

const STEPS = [
  {
    title: "Walk the building after hours",
    body: "At 4pm or after close, students sweep the building and point a phone at anything still drawing power: a lit lab, an idling projector, the humming vending machine.",
  },
  {
    title: "A vision model names the devices",
    body: "It identifies each device and whether it is on, in standby or off. That is all it does. With Ollama running, it happens on your own machine.",
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

const NOTES = [
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
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-24 sm:px-6 sm:pt-32">
      <Reveal>
        <PageHeader eyebrow="About" title="The biggest easy energy win" accent="is the one nobody measures.">
          Everyone measures a building&apos;s daytime footprint. Almost no one measures what a school
          burns while it&apos;s empty: labs left on overnight, projectors in standby, hallway lights
          all weekend, the vending machine chilling soda at 2am. Most schools have no idea what that
          number is. Ghost Watt is how you find out.
        </PageHeader>
      </Reveal>

      {/* why we built it */}
      <section className="mt-20 grid gap-10 sm:mt-28 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <Reveal>
          <h2 className="font-editorial text-[2rem] leading-[1.08] text-fog sm:text-[2.6rem]">
            Why we built it.
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="space-y-4 text-[1.05rem] leading-relaxed text-mist">
            <p>
              We noticed it walking through school after the bell: rooms full of screens still glowing, lights on in empty halls, machines humming for
              nobody. Every one of them was costing money and putting carbon into the air, and nobody knew how much.
            </p>
            <p>
              Energy audits are expensive and rare, and the tools that exist assume you already speak the language of kilowatts. We wanted something anyone
              could pick up: point a phone at a room, see what&apos;s wasting power, and know exactly what to do about it, starting with what&apos;s free.
            </p>
          </div>
        </Reveal>
      </section>

      {/* what we believe */}
      <section className="mt-16 sm:mt-20">
        <Reveal>
          <h2 className="font-editorial text-[2rem] leading-[1.08] text-fog sm:text-[2.6rem]">What we believe.</h2>
        </Reveal>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BELIEFS.map((b, i) => (
            <Reveal key={b.title} delay={i * 0.05}>
              <li className="panel h-full p-6">
                <h3 className="text-[1.05rem] font-semibold text-fog">{b.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{b.body}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* the team */}
      <section className="mt-20 border-t border-line pt-14 sm:mt-28">
        <Reveal>
          <h2 className="font-editorial text-[2rem] leading-[1.08] text-fog sm:text-[2.6rem]">
            The team. <span className="italic text-cyan">Four of us.</span>
          </h2>
        </Reveal>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {TEAM.map((m, i) => (
            <Reveal key={m.name} delay={i * 0.06}>
              <li className="panel flex h-full gap-5 p-6">
                <span
                  aria-hidden
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-fog font-editorial text-[1.5rem] text-ink"
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

      {/* how it works */}
      <section className="mt-20 border-t border-line pt-14 sm:mt-28">
        <Reveal>
          <h2 className="font-editorial max-w-2xl text-[2rem] leading-[1.08] text-fog sm:text-[2.6rem]">
            A professional audit costs money and happens once a decade.{" "}
            <span className="italic text-cyan">This costs a walk.</span>
          </h2>
        </Reveal>
        <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08}>
              <li>
                <span className="font-editorial text-[3rem] leading-none text-cyan">{i + 1}</span>
                <h3 className="mt-3 text-[1.08rem] font-semibold text-fog">{s.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* notes */}
      <section className="mt-20 grid gap-12 border-t border-line pt-14 sm:mt-28 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <Reveal>
          <h2 className="font-editorial text-[2rem] leading-[1.08] text-fog sm:text-[2.6rem]">
            A few honest answers.
          </h2>
        </Reveal>
        <div className="space-y-10">
          {NOTES.map((n, i) => (
            <Reveal key={n.q} delay={i * 0.06}>
              <h3 className="text-[1.08rem] font-semibold text-fog">{n.q}</h3>
              <p className="mt-2 text-[1rem] leading-relaxed text-mist">{n.a}</p>
            </Reveal>
          ))}
          <Reveal>
            <h3 className="text-[1.08rem] font-semibold text-fog">Where do the photos go?</h3>
            <p className="mt-2 text-[1rem] leading-relaxed text-mist">
              In On-device mode, nowhere: a detector in the browser reads them and nothing is
              uploaded. In Enhanced mode a photo is sent to the cloud vision model for the scan and
              then discarded. The pill in the header always says which mode is about to run, and
              every result is labelled <span className="text-fog">Enhanced · cloud</span> or{" "}
              <span className="text-fog">On-device</span>.
            </p>
          </Reveal>
          <Reveal>
            <h3 className="text-[1.08rem] font-semibold text-fog">How accurate is it?</h3>
            <p className="mt-2 text-[1rem] leading-relaxed text-mist">
              Wattage from a photo is an estimate, and Ghost Watt never pretends otherwise. But the
              ranking of the worst offenders holds even when individual watts are fuzzy, and the
              ranking is what drives action. The{" "}
              <Link href="/methodology" className="text-cyan underline decoration-cyan/30 underline-offset-4 hover:decoration-cyan">
                methodology
              </Link>{" "}
              shows every figure and formula.
            </p>
          </Reveal>
        </div>
      </section>

      <Reveal>
        <div className="mt-20 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-line pt-10 sm:mt-28">
          <Link
            href="/scan"
            className="rounded-full bg-fog px-6 py-3 text-[0.95rem] font-medium text-ink transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Start a scan
          </Link>
          <Link href="/methodology" className="text-[0.95rem] text-mist underline decoration-mist/30 underline-offset-[6px] hover:text-fog">
            Read the methodology
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
