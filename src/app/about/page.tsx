import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/Hero";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "About - Ghost Watt",
  description:
    "Why Ghost Watt exists and how it works: the after-hours energy map nobody has, built so students can hand facilities a prioritized fix list they can act on Monday.",
};

const STEPS = [
  {
    n: "01",
    title: "Photo-walk after hours",
    body: "Students sweep the building at 4pm or after close and snap anything still drawing power - lit labs, idling projectors, the humming vending machine.",
  },
  {
    n: "02",
    title: "A local model sees the devices",
    body: "An on-device vision model identifies each device and whether it's on or in standby. Nothing is uploaded - inference runs on your own machine.",
  },
  {
    n: "03",
    title: "Deterministic energy math ranks them",
    body: "Known device wattages × realistic empty-hours give a defensible dollar and CO₂ figure per device - sorted worst-first, each with a costed fix.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Hero />

      {/* how it works */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <Reveal>
          <div className="mono-label text-cyan">how it works</div>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-fog sm:text-4xl">
            A commercial energy audit costs money and happens once a decade. This costs a walk.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="h-full bg-surface p-6">
                <div className="font-mono text-3xl font-bold text-line2">{s.n}</div>
                <h3 className="mt-4 text-lg font-semibold text-fog">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-dim">
            <span className="text-mist">Honest about precision:</span> wattage-from-a-photo is an
            estimate, so we don&apos;t oversell the absolute numbers. But the{" "}
            <span className="text-cyan">ranking</span> of worst offenders is robust even when the
            watts are fuzzy - and the ranking is what drives action.
          </p>
        </Reveal>
      </section>

      {/* the story */}
      <div className="mx-auto max-w-4xl px-4 pb-12 sm:px-6">
        <Reveal>
          <div className="mono-label text-cyan">about</div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-fog sm:text-4xl">
            The single biggest easy energy win is the one nobody measures.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-mist">
            Everyone measures a building&apos;s daytime footprint. Almost no one measures what a
            school burns when it&apos;s empty - computer labs left on overnight, projectors in
            standby, hallway lights all weekend, the vending machine chilling soda at 2am. That
            phantom load is often the biggest easy win in a building, and most schools have no idea
            what their number is.
          </p>
        </Reveal>

        <div className="mt-12 space-y-px overflow-hidden border border-line bg-line">
          <Block
            k="The niche"
            v="A tool where students crowdsource a photo-audit and a model turns it into a ranked map of what's bleeding money while the building sleeps. Not a generic carbon calculator you type guesses into - a concrete, room-by-room offender list."
            delay={0}
          />
          <Block
            k="Why it hasn't really been done"
            v="Commercial energy audits cost money and happen once a decade. Generic carbon apps ask you to type in estimates. Nobody put a vision model, a wattage table, and a clean ranked output in the hands of the students who actually walk the halls."
            delay={0.05}
          />
          <Block
            k="The demo moment"
            v="Point a phone at a lit, empty computer lab → “~$340/yr and 1.2 tons CO₂ wasted here. Fix: smart power strips, ~$60, pays back in 2 months.” That lands in a pitch - and it's an action, not a guilt trip."
            delay={0.1}
          />
          <Block
            k="Real impact"
            v="You hand facilities a prioritized action list they can act on Monday: timers, occupancy sensors, power strips, a shutdown policy. A tangible, defensible outcome - the kind judges and principals both like."
            delay={0.15}
          />
        </div>

        {/* privacy / local */}
        <Reveal delay={0.1}>
          <div className="mt-12 panel ticked p-6">
            <div className="mono-label text-cyan">runs entirely on your machine</div>
            <p className="mt-3 text-sm leading-relaxed text-mist">
              Ghost Watt uses a <span className="text-fog">local</span> vision model through Ollama -
              no external paid APIs, no accounts, no early-access list. Photos are downscaled in your
              browser and sent only to the model running on your own computer. If that model
              isn&apos;t available, the app falls back to a transparent room-profile estimate and{" "}
              <span className="text-fog">labels every result</span> as either{" "}
              <span className="text-cyan">live model</span> or{" "}
              <span className="text-amber">estimated</span>, so you always know what you&apos;re
              looking at.
            </p>
          </div>
        </Reveal>

        {/* honesty */}
        <Reveal delay={0.1}>
          <div className="mt-8">
            <h2 className="text-xl font-bold text-fog">Honest about the numbers</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mist">
              Wattage-from-a-photo is an estimate, and we don&apos;t pretend otherwise. But the
              ranking of worst offenders is robust even when the absolute watts are fuzzy - and the
              ranking is what drives action. Lean into that and the tool reads as rigorous, not
              hand-wavy. The{" "}
              <Link href="/methodology" className="text-cyan underline-offset-4 hover:underline">
                methodology
              </Link>{" "}
              shows every figure and formula.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="border border-cyan bg-cyan/10 px-6 py-3 font-mono text-sm font-bold tracking-[0.16em] uppercase text-cyan transition-colors hover:bg-cyan/20"
            >
              Run an audit →
            </Link>
            <Link
              href="/methodology"
              className="px-2 font-mono text-sm tracking-[0.12em] uppercase text-mist transition-colors hover:text-fog"
            >
              Read the methodology
            </Link>
          </div>
        </Reveal>
      </div>
    </>
  );
}

function Block({ k, v, delay }: { k: string; v: string; delay: number }) {
  return (
    <Reveal delay={delay}>
      <div className="grid gap-2 bg-surface p-6 sm:grid-cols-[200px_1fr] sm:gap-6">
        <div className="mono-label pt-1 text-cyan">{k}</div>
        <p className="text-sm leading-relaxed text-mist">{v}</p>
      </div>
    </Reveal>
  );
}
