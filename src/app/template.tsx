"use client";

// A soft fade on every route change, so moving from the landing page
// into the app, or between tabs, reads as one continuous place rather than a
// page swap. Framer Motion's reduced-motion setting (MotionProvider) turns the
// movement off; the in-app "reduce motion" preference does the same.

import { motion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    // Opacity only: a transform here would become the containing block for the
    // camera's full-screen view and the brief's sticky rail.
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
