"use client";

// Honour "reduce motion" across every Framer Motion animation in one place.
//
// The CSS animations respect prefers-reduced-motion through media queries in
// globals.css, and the in-app preference through [data-motion="reduce"]. Framer
// Motion runs in JavaScript and sees neither unless told, so this reads both:
// the OS setting ("user") or, when the person has chosen it in the app, always.

import { MotionConfig } from "framer-motion";
import { usePrefs } from "@/lib/prefs";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const { motion } = usePrefs();
  return <MotionConfig reducedMotion={motion === "reduce" ? "always" : "user"}>{children}</MotionConfig>;
}
