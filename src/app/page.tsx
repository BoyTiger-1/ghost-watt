import Link from "next/link";
import { Hero } from "@/components/Hero";
import { Reveal } from "@/components/Reveal";
import { DeviceGlyph } from "@/components/DeviceGlyph";

export default function Home() {
  return (
    <>
      <Hero />
      <ProblemBand />
      <HowItWorks />
      <SampleAudit />
      <WhyDifferent />
      <ResponsibleAI />
      <FinalCta />
    </>
  );
}

/* ---- the cost of the dark ---------------------------------------------- */

function ProblemBand() {
  return (
    <section id="how" className="relative border-y border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <p className="mono-label text-cyan">The waste nobody sees</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-fog sm:text-5xl">
            A building does its loudest spending{" "}
            <span className="grad-energy">when it&apos;s empty.</span>
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
            Daytime energy gets measured to death. The hours that actually leak money go
            unwatched: the lab left on overnight, the projector idling in standby, the vending
            machine chilling soda at 2am. You can&apos;t fix what you can&apos;t see, so it
            never gets fixed.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3">
          <BigStat
            value="~6,800 hrs"
            label="a school sits empty each year"
            note="≈ 78% of the calendar, drawing power with nobody there"
          />
          <BigStat
            value="$1,000s"
            label="of phantom load, per building"
            note="monitors, projectors, coolers, lights left running"
          />
          <BigStat
            value="10 min"
            label="and a phone to map all of it"
            note="no meters, no consultant, no special hardware"
          />
        </div>
      </div>
    </section>
  );
}

function BigStat({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="panel panel-hover bg-ink p-7">
      <div className="grad-energy text-3xl font-bold tracking-tight sm:text-4xl">{value}</div>
      <div className="mt-2 text-sm font-medium text-fog">{label}</div>
      <div className="mt-2 text-xs leading-relaxed text-dim">{note}</div>
    </div>
  );
}

/* ---- how it works ------------------------------------------------------ */

const STEPS = [
  {
    no: "01",
    title: "See",
    tag: "local vision model",
    body: "Walk an empty school and photograph each room. A vision model running on your own machine reads each photo and reports just one thing: the devices it sees and whether each is on, in standby, or off.",
  },
  {
    no: "02",
    title: "Count",
    tag: "deterministic math",
    body: "Every device is matched to a wattage table and run through one transparent formula: effective watts, times the hours the building is empty, times your electricity rate and grid carbon factor. No black box decides your numbers.",
  },
  {
    no: "03",
    title: "Rank",
    tag: "worst-first, costed",
    body: "Offenders are sorted by yearly cost, each with a concrete fix and its payback. Even when a single reading is rough, the order holds, and the order is what tells you where to start.",
  },
];

function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <p className="mono-label text-cyan">How it works</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-fog sm:text-5xl">
          Photo in. <span className="grad-energy">Action out.</span>
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-mist">
          The whole design keeps the fuzzy part and the exact part apart. The model guesses
          what&apos;s in the room. Plain code does the money and the carbon. So the figures you
          act on are always something you can check by hand.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.no} delay={i * 0.08}>
            <div className="ticked panel panel-hover group h-full p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-5xl font-bold text-line2 transition-colors group-hover:text-cyan/40">
                  {s.no}
                </span>
                <span className="mono-label text-dim">{s.tag}</span>
              </div>
              <h3 className="mt-6 text-2xl font-bold text-fog">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-mist">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---- sample audit preview ---------------------------------------------- */

const SAMPLE = [
  { icon: "monitor", label: "Computer monitors", count: "30 on", cost: "$486/yr", co2: "1.2 t CO₂", fix: "Master power strip · $45", pay: "1 mo", w: "94%" },
  { icon: "projector", label: "Projector", count: "1 on", cost: "$163/yr", co2: "419 kg CO₂", fix: "Auto-off timer · $40", pay: "3 mo", w: "55%" },
  { icon: "vending", label: "Cold vending machine", count: "1 on", cost: "$132/yr", co2: "338 kg CO₂", fix: "Night-setback device · $90", pay: "8 mo", w: "44%" },
  { icon: "light", label: "Overhead lights", count: "6 on", cost: "$88/yr", co2: "226 kg CO₂", fix: "Occupancy sensor · $30", pay: "4 mo", w: "28%" },
];

function SampleAudit() {
  return (
    <section className="relative border-y border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <Reveal>
            <p className="mono-label text-cyan">What you get back</p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-fog sm:text-5xl">
              A ranked hit-list, <span className="grad-energy">not a dashboard.</span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-mist">
              Every offender is costed in dollars and CO₂, paired with a concrete fix and its
              payback, and tagged so you always know whether a number came from the model or a
              transparent estimate.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Badge tone="cyan">live model</Badge>
              <Badge tone="amber">estimated</Badge>
              <Badge tone="line">assumptions you control</Badge>
            </div>
            <Link
              href="/scan"
              className="mt-9 inline-flex border border-cyan bg-cyan/10 px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.16em] text-cyan transition-colors hover:bg-cyan/20"
            >
              Run a scan →
            </Link>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="panel ticked p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="mono-label text-mist">audit · computer lab</span>
                <span className="font-mono text-xs text-dim">4 offenders · ranked</span>
              </div>
              <ul className="mt-2 divide-y divide-line">
                {SAMPLE.map((o, i) => (
                  <li key={o.label} className="flex items-center gap-4 py-4">
                    <span className="font-mono text-xs text-dim">{`0${i + 1}`}</span>
                    <span className="grid h-10 w-10 shrink-0 place-items-center border border-line2 bg-surface2 text-cyan">
                      <DeviceGlyph icon={o.icon} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-fog">{o.label}</span>
                        <span className="font-mono text-sm font-bold text-lime">{o.cost}</span>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden bg-surface2">
                        <span className="block h-full grad-energy-bg" style={{ width: o.w }} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[0.68rem] text-dim">
                        <span>{o.count}</span>
                        <span className="text-line2">·</span>
                        <span>{o.co2}</span>
                        <span className="text-line2">·</span>
                        <span className="text-mist">{o.fix}</span>
                        <span className="text-line2">·</span>
                        <span className="text-cyan">payback {o.pay}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-line pt-3 font-mono text-[0.66rem] uppercase tracking-[0.16em] text-dim">
                illustrative figures · your audit recomputes from your rates
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "cyan" | "amber" | "line" }) {
  const cls =
    tone === "cyan"
      ? "border-cyan/40 text-cyan"
      : tone === "amber"
        ? "border-amber/40 text-amber"
        : "border-line2 text-mist";
  return (
    <span className={`border ${cls} px-3 py-1.5 font-mono text-[0.66rem] uppercase tracking-[0.16em]`}>
      {children}
    </span>
  );
}

/* ---- why it's different ------------------------------------------------ */

const FEATURES = [
  { k: "Runs on your machine", v: "The vision model runs locally through Ollama. No accounts, no cloud, no paid APIs, no API keys. Your photos never leave the building." },
  { k: "Transparent by design", v: "Every dollar and kilogram traces back to an assumption you can see and change. The full wattage table and formula are spelled out in the app." },
  { k: "Honest about estimates", v: "Reading watts off a photo is an estimate, not a meter reading. Each card is labelled live or estimated so the two are never confused." },
  { k: "Costed, not just counted", v: "Awareness changes nothing. Every offender ships with a concrete fix, what it costs, and how fast it pays for itself." },
  { k: "Robust ranking", v: "The worst-first order survives noisy readings, because the ranking, not the exact wattage, is what drives the decision." },
  { k: "Works with no data", v: "No real or private school data required. A transparent room-profile fallback keeps the audit running even with no model available." },
];

function WhyDifferent() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <p className="mono-label text-cyan">Why it&apos;s built this way</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-fog sm:text-5xl">
          Useful beats <span className="grad-energy">impressive.</span>
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.k} delay={(i % 3) * 0.06}>
            <div className="panel-hover h-full bg-ink p-7">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 grad-energy-bg" />
                <h3 className="text-base font-bold text-fog">{f.k}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-mist">{f.v}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---- responsible AI ---------------------------------------------------- */

function ResponsibleAI() {
  return (
    <section className="relative border-y border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <p className="mono-label text-cyan">Responsible by default</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-fog sm:text-5xl">
            The AI advises. <span className="grad-energy">A human decides.</span>
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Reveal>
            <div className="ticked panel h-full p-7">
              <p className="mono-label text-mist">Human in the loop</p>
              <p className="mt-4 text-base leading-relaxed text-fog">
                Ghost Watt never decides what to fix, buy, or change. It surfaces and ranks
                opportunities; a facilities manager or teacher makes the call. One photo and a
                budget decision are not the same thing, so the person stays in control.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="ticked panel h-full p-7">
              <p className="mono-label text-mist">The guardrail</p>
              <p className="mt-4 text-base leading-relaxed text-fog">
                The real risk is over-trusting a misread. So perception and accounting are kept
                separate, every figure shows its assumptions and a confidence level, estimates
                are labelled, and ranking by cost keeps the action order right even when an
                individual watt reading is fuzzy.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---- final CTA --------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(50vw_40vw_at_50%_120%,rgba(47,230,207,0.16),transparent_70%)]" />
      <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:px-6 sm:py-32">
        <Reveal>
          <h2 className="text-4xl font-bold leading-[1.05] tracking-tight text-fog sm:text-6xl">
            Turn &ldquo;be mindful of energy&rdquo;
            <br />
            <span className="grad-energy text-glow">into fix these three things.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-mist sm:text-lg">
            Photo-walk a building, get a ranked and costed map of what it burns in the dark.
            Everything runs on your own machine.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/scan"
              className="border border-cyan bg-cyan/10 px-8 py-3.5 font-mono text-sm font-bold uppercase tracking-[0.16em] text-cyan transition-colors hover:bg-cyan/20"
            >
              Open the scanner →
            </Link>
            <Link
              href="/methodology"
              className="px-4 py-3.5 font-mono text-sm uppercase tracking-[0.12em] text-mist transition-colors hover:text-fog"
            >
              See the methodology
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
