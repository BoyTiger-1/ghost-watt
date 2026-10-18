"use client";

// One paragraph, read as you scroll. Each word comes up out of the dark the way
// a room does when someone finally walks past and notices the light.

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";

type Token = { t: string; em?: boolean };

const TEXT: Token[][] = [
  [{ t: "A school sits empty for about" }, { t: "6,800 hours", em: true }, { t: "a year." }],
  [{ t: "In that time one projector left on can quietly burn" }, { t: "$255.", em: true }],
  [{ t: "A lab of monitors, another" }, { t: "$486.", em: true }],
  [{ t: "None of it shows up anywhere, because nobody is there to see it." }],
  [{ t: "Ghost Watt is how you see it." }],
];

export function Manifesto() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.6"] });

  const words = TEXT.flatMap((sentence, si) =>
    sentence.flatMap((tok) =>
      tok.em ? [{ w: tok.t, em: true, si }] : tok.t.split(" ").map((w) => ({ w, em: false, si })),
    ),
  );

  return (
    <section className="relative px-5 pb-6 pt-16 sm:px-8 sm:pb-12 sm:pt-32">
      <div ref={ref} className="mx-auto max-w-[62rem]">
        <p className="font-editorial text-[clamp(2rem,4.3vw,3.65rem)] leading-[1.14] text-graphite">
          {words.map((w, i) => (
            <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1.6) / words.length]} em={w.em}>
              {w.w}
            </Word>
          ))}
        </p>
      </div>
    </section>
  );
}

function Word({
  children,
  progress,
  range,
  em,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
  em: boolean;
}) {
  const opacity = useTransform(progress, range, [0.13, 1]);
  return (
    <motion.span
      style={{ opacity }}
      className={`${em ? "italic text-sodium-deep" : ""} inline`}
    >
      {children}{" "}
    </motion.span>
  );
}
