"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";

const Scene3D = dynamic(() => import("./Scene3D").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => <div className="absolute inset-0" />,
});

export function Hero() {
  return (
    <section className="relative flex min-h-[92dvh] items-center overflow-hidden pt-14">
      {/* 3D orb */}
      <div className="pointer-events-none absolute inset-0 opacity-90 [mask-image:radial-gradient(circle_at_center,#000_55%,transparent_85%)]">
        <Scene3D />
      </div>
      {/* legibility veil */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/30 via-ink/10 to-ink" />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <div className="inline-flex items-center gap-2 border border-line bg-surface/60 px-3 py-1.5 backdrop-blur">
            <span className="h-1.5 w-1.5 grad-energy-bg pulse-dot" />
            <span className="font-mono text-[0.68rem] tracking-[0.2em] uppercase text-mist">
              phantom-load audit · runs on-device
            </span>
          </div>

          <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-fog sm:text-6xl">
            Map what your school burns
            <br />
            <span className="grad-energy text-glow">while it sleeps.</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-mist sm:text-lg">
            Everyone measures the daytime footprint. Almost no one measures the labs left on
            overnight, the projectors in standby, the vending machine chilling soda at 2am.
            Ghost Watt turns a student photo-walk into a ranked map of what&apos;s bleeding money
            in the dark - with a costed, one-tap fix for each.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/scan"
              className="group border border-cyan bg-cyan/10 px-6 py-3 font-mono text-sm font-bold tracking-[0.16em] uppercase text-cyan transition-colors hover:bg-cyan/20"
            >
              Open the scanner →
            </Link>
            <Link
              href="/methodology"
              className="px-2 font-mono text-sm tracking-[0.12em] uppercase text-mist transition-colors hover:text-fog"
            >
              How the numbers work
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
            <Metric value="~$340/yr" label="a single lab of monitors" />
            <Metric value="1.2 t CO₂" label="wasted, ranked & costed" />
            <Metric value="$60 · 2 mo" label="typical fix & payback" />
          </div>
        </motion.div>
      </div>

      <Link
        href="#how"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[0.62rem] tracking-[0.3em] uppercase text-dim transition-colors hover:text-cyan"
      >
        <span className="flex flex-col items-center gap-1">
          scroll
          <span className="h-6 w-px bg-gradient-to-b from-cyan to-transparent" />
        </span>
      </Link>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-lg font-bold text-fog">{value}</div>
      <div className="mono-label mt-0.5">{label}</div>
    </div>
  );
}
