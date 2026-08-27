"use client";

// Honour the operating system's "reduce motion" setting across every Framer Motion
// animation in the app in one place.
//
// The CSS animations already respect prefers-reduced-motion via a media query in
// globals.css, but Framer Motion runs in JavaScript and does not see that query
// unless it is told to. Without this, a user who has asked their machine to stop
// moving things still gets every card sliding in, every number counting up and
// every panel expanding - which for a vestibular-sensitive user is the difference
// between a usable page and one they have to close.
//
// "user" means: follow the system setting, and animate normally when it is off.

import { MotionConfig } from "framer-motion";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
