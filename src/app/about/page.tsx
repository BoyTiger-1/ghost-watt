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

      {/* how it works */}
      <section className="mt-20 sm:mt-28">
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
              With Ollama running, nowhere: the model reads them on your own computer. Without it,
              a deployment with a vision key can send a photo to that provider for the scan, and the
              badge in the header always says which engine is about to run before you upload
              anything. Every result is labelled <span className="text-fog">live model</span> or{" "}
              <span className="text-fog">estimated</span>, so you always know what you&apos;re looking at.
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
