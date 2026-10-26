import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "@/components/Reveal";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "About - Ghost Watt",
  description:
    "Why Ghost Watt exists and how it works: the after-hours energy map nobody has, built so anyone can hand a household, an office or a facilities team a prioritized fix list they can act on Monday.",
};

// The page reads as a story: why it exists, how it works, what it stands for,
// who made it, then the questions people ask.

const STEPS = [
  {
    title: "Walk around after hours",
    body: "Go room to room once the building is mostly empty and point your phone at anything still on. Lit labs, projectors, that one space heater under a desk.",
  },
  {
    title: "The model says what it sees",
    body: "It names each device and whether it's on, asleep or off. That's its whole job. In On-device mode this happens in your browser and the photo is never uploaded.",
  },
  {
    title: "Plain math does the rest",
    body: "Published wattages, times the hours the room sits empty, times your local electricity price. You get dollars and CO₂ for each device, worst first, with a fix and how fast it pays for itself.",
  },
];

const BELIEFS = [
  {
    title: "Nobody leaves power idle on purpose",
    body: "A projector humming at midnight is invisible. Once people can actually see it, most of it gets switched off.",
  },
  {
    title: "No jargon",
    body: "You shouldn't need to know what a kilowatt-hour is to save money. Everything is in dollars and hours.",
  },
  {
    title: "Show your work",
    body: "Every estimate comes with a range and where it came from. The wattages and formulas are public, so you can check us.",
  },
  {
    title: "Free fixes first",
    body: "A timer or a new habit often beats buying equipment. We sort fixes by what each dollar gets back, so the free ones end up on top.",
  },
  {
    title: "Your photos stay yours",
    body: "No accounts and no tracking. On-device mode never uploads a picture, and team scans only share device lists.",
  },
];

const TEAM = [
  {
    name: "Shaurya Sahdev",
    initials: "SS",
    roles: ["Live mode", "Frontend & design"],
    body: "Built live mode, the camera view that boxes and prices things as you point at them. Did a lot of the design too.",
  },
  {
    name: "Ronit Agarwal",
    initials: "RA",
    roles: ["AI models & training", "Backend"],
    body: "Trains and tunes the models that find devices in a photo, and wrote the server side that reads photos and looks up prices.",
  },
  {
    name: "Vyom Joshi",
    initials: "VJ",
    roles: ["Frontend", "Testing"],
    body: "Builds the screens people actually use, then tries to break them on real phones in real rooms.",
  },
  {
    name: "Rayan Alam",
    initials: "RA",
    roles: ["Backend & data", "Testing"],
    body: "Works on the data behind the numbers, like electricity prices and saved places, and checks that it all adds up.",
  },
];

const NOTES: { q: string; a: ReactNode }[] = [
  {
    q: "Why hasn't someone done this already?",
    a: "Honestly, we're not sure. Professional audits are expensive, so most homes, offices and schools rarely get one, and online carbon calculators make you type in your own guesses. Nobody had put a vision model, a wattage table and a to-do list on the phones of the people who actually walk the halls.",
  },
  {
    q: "What does it look like in practice?",
    a: "Point it at an empty computer lab with thirty monitors still on and it'll tell you something like: about $800 a year here. Smart power strips fix most of it for $60, and they pay for themselves in about a month.",
  },
  {
    q: "What do you get at the end?",
    a: "A ranked list facilities can start on Monday (timers, motion sensors, power strips, a shutdown routine), a one-page report for whoever approves spending, and stickers for the doors.",
  },
  {
    q: "Where do the photos go?",
    a: (
      <>
        In On-device mode, nowhere. The detector runs in your browser. Enhanced mode sends the photo to a cloud vision model for the scan, and then it&apos;s
        thrown away. The pill in the header always says which one is about to run, and every result is labelled{" "}
        <span className="text-fog">Enhanced · cloud</span> or <span className="text-fog">On-device</span>.
      </>
    ),
  },
  {
    q: "How accurate is it?",
    a: (
      <>
        Watts from a photo are an estimate, and we say so. The ranking holds up even when individual numbers are a bit off, though, and the ranking is
        what tells you what to fix first. Every figure and formula is on the{" "}
        <Link href="/methodology" className="text-cyan underline decoration-cyan/30 underline-offset-4 hover:decoration-cyan">
          methodology
        </Link>{" "}
        page.
      </>
    ),
  },
  {
    q: "Do team scans need accounts?",
    a: "No. Whoever starts one gets a six-character code and a QR code to put on the board. Everyone scans their own rooms on their own phone, and only the device lists get shared.",
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
          <PageHeader eyebrow="About" title="We kept walking past empty rooms" accent="with the lights on.">
            Ghost Watt started with a simple question: how much does our building pay to keep things running after everyone goes home? Nobody we asked
            knew. There&apos;s no meter for &quot;the projector in 214 that&apos;s been on since Tuesday.&quot; So we built a way to count it with a phone.
          </PageHeader>
        </Reveal>

        {/* 1. why we built it */}
        <section className="mt-20 grid gap-10 sm:mt-24 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <SectionHead eyebrow="Our story" title="Why we built it." />
          <Reveal delay={0.06}>
            <div className="space-y-4 text-[1.05rem] leading-relaxed text-mist">
              <p>
                Stay late and you see it. A computer lab or office glowing with nobody in it, hallway lights on over empty floors, a vending machine
                humming to itself. All of that costs money, and most of it could just be switched off.
              </p>
              <p>
                A real energy audit is expensive, so most buildings rarely get one. The calculators online assume you already know what a kilowatt-hour
                is and want you to type in your own guesses. We wanted something you could just point at a room.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {[
                ["$221", "one projector left on after hours, for a year"],
                ["6,800", "hours a year a typical building stands empty"],
                ["10 min", "for a team of thirty scanning three or four rooms each"],
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
          <SectionHead eyebrow="How it works" title="An audit costs money." accent="This costs a walk." />
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
          <SectionHead eyebrow="What we care about" title="How we decide" accent="what goes in." />
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
          <SectionHead eyebrow="The team" title="Four students," accent="one very lit building." />
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
          <SectionHead eyebrow="FAQ" title="Questions people ask us." />
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
                Go scan a room <span className="italic text-sodium">tonight.</span>
              </h2>
              <p className="mt-2 text-[0.98rem] text-ink/70">It takes about a minute, and it&apos;s free.</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/scan"
                className="rounded-full bg-sodium px-6 py-3 text-[0.95rem] font-medium text-[#1c1b18] transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                Start a scan
              </Link>
              <Link href="/methodology" className="text-[0.95rem] text-ink/80 underline decoration-ink/30 underline-offset-[6px] hover:decoration-ink">
                How the math works
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
