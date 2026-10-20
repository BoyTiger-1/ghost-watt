"use client";

import { Reveal } from "@/components/Reveal";

const POINTS = [
  {
    lead: "It never decides for you.",
    body: "Ghost Watt ranks what it found and prices the fixes. Whether to buy anything is a call for a teacher or a facilities manager, who knows the budget and the building.",
  },
  {
    lead: "It says where every number came from.",
    body: "Each result is tagged as read by the model or estimated from a room profile, with a confidence level, so a guess is never dressed up as a measurement.",
  },
  {
    lead: "It lets you keep your photos.",
    body: "In On-device mode the picture is read in your browser and never uploaded. Enhanced mode sends it to a cloud model for the scan and discards it, and the header always says which is about to run. No accounts, no tracking, and the code is open source.",
  },
];

export function TrustSection() {
  return (
    <section className="relative px-5 pb-16 pt-6 sm:px-8 sm:pb-32 sm:pt-10">
      <div className="mx-auto grid max-w-[84rem] gap-14 border-t border-hair pt-16 lg:grid-cols-[1fr_1fr] lg:gap-24 lg:pt-24">
        <Reveal>
          <h2 className="font-editorial text-[clamp(2.4rem,4.6vw,4rem)] leading-[1.02] text-graphite lg:sticky lg:top-28">
            The model advises.
            <br />
            <span className="italic text-dusk">A person decides.</span>
          </h2>
        </Reveal>
        <div className="space-y-12">
          {POINTS.map((p, i) => (
            <Reveal key={p.lead} delay={i * 0.08}>
              <p className="text-[1.08rem] leading-[1.7] text-stone">
                <span className="font-medium text-graphite">{p.lead}</span> {p.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
