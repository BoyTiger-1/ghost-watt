"use client";

// The site's motion vocabulary, shared by the landing page and About.
//
// Each piece answers to "reduce motion" (the OS setting or the in-app one):
// Framer's MotionConfig stills the transforms, and the pointer-driven pieces
// check useReducedMotion themselves and simply stay put.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Lines that rise out of their own slots, one after another. */
export function SplitLines({
  lines,
  className = "",
  delay = 0,
  stagger = 0.11,
  inView = false,
}: {
  lines: ReactNode[];
  className?: string;
  delay?: number;
  stagger?: number;
  /** Wait until scrolled into view rather than playing on load. */
  inView?: boolean;
}) {
  const trigger = inView
    ? { whileInView: "show" as const, viewport: { once: true, margin: "-60px" } }
    : { animate: "show" as const };
  return (
    <motion.span className={className} initial="hidden" {...trigger}>
      {lines.map((line, i) => (
        <span key={i} className="line-mask">
          <motion.span
            className="block"
            variants={{
              hidden: { y: "105%", rotate: 2.5 },
              show: { y: "0%", rotate: 0, transition: { duration: 1.05, delay: delay + i * stagger, ease: EASE } },
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** Pulls its child a little toward the pointer, and springs back when it leaves. */
export function Magnetic({ children, strength = 0.35, className = "" }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 260, damping: 18, mass: 0.6 });
  const y = useSpring(0, { stiffness: 260, damping: 18, mass: 0.6 });

  return (
    <motion.span
      ref={ref}
      style={{ x, y }}
      className={`inline-block ${className}`}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse" || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

/**
 * A flashlight in an empty building: a soft warm pool that follows the pointer
 * across its parent. Mouse only; touch screens never see it.
 */
export function Flashlight({ size = 520, className = "" }: { size?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(-1000);
  const my = useMotionValue(-1000);
  const sx = useSpring(mx, { stiffness: 120, damping: 22, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 120, damping: 22, mass: 0.6 });
  const [on, setOn] = useState(false);
  const bg = useMotionTemplate`radial-gradient(${size}px circle at ${sx}px ${sy}px, var(--flashlight, rgba(255,190,110,0.16)), transparent 62%)`;

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || reduce || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      mx.set(e.clientX - r.left);
      my.set(e.clientY - r.top);
      setOn(true);
    };
    const leave = () => setOn(false);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [reduce, mx, my]);

  return (
    <motion.div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${on ? "opacity-100" : "opacity-0"} ${className}`}
      style={{ background: bg }}
    />
  );
}

/** A paragraph whose words come up out of the dark as it scrolls past. */
export function ScrollWords({
  text,
  className = "",
  emClass = "italic text-sodium-deep",
}: {
  /** Wrap a phrase in *asterisks* to set it as an accent. */
  text: string;
  className?: string;
  emClass?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.55"] });
  const words = text
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .flatMap((part) => (part.startsWith("*") ? [{ w: part.slice(1, -1), em: true }] : part.trim().split(/\s+/).map((w) => ({ w, em: false }))));
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1.6) / words.length]} className={w.em ? emClass : ""}>
          {w.w}
        </Word>
      ))}
    </p>
  );
}

function Word({ children, progress, range, className }: { children: string; progress: MotionValue<number>; range: [number, number]; className: string }) {
  const opacity = useTransform(progress, range, [0.13, 1]);
  return (
    <motion.span style={{ opacity }} className={`inline ${className}`}>
      {children}{" "}
    </motion.span>
  );
}

/** Counts up to a number the first time it scrolls into view. */
export function CountTo({
  to,
  prefix = "",
  suffix = "",
  duration = 1.6,
  decimals = 0,
  className = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduce) {
      const t = setTimeout(() => setV(to), 0);
      return () => clearTimeout(t);
    }
    const a = animate(0, to, { duration, ease: EASE, onUpdate: (n) => setV(n) });
    return () => a.stop();
  }, [seen, to, duration, reduce]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {prefix}
      {v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** Lifts and tilts a card toward the pointer, like picking it up off a desk. */
export function Tilt({ children, className = "", max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const rx = useSpring(0, { stiffness: 200, damping: 20 });
  const ry = useSpring(0, { stiffness: 200, damping: 20 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glareOn = useSpring(0, { stiffness: 200, damping: 30 });
  const glare = useMotionTemplate`radial-gradient(420px circle at ${gx}% ${gy}%, rgba(255,200,130,0.14), transparent 55%)`;
  return (
    <motion.div
      ref={ref}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className={`relative ${className}`}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse" || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        ry.set((px - 0.5) * max * 2);
        rx.set(-(py - 0.5) * max * 2);
        gx.set(px * 100);
        gy.set(py * 100);
        glareOn.set(1);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
        glareOn.set(0);
      }}
    >
      {children}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glare, opacity: glareOn }} />
    </motion.div>
  );
}
