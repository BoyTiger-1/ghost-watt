"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches. False on the server and on first paint, so
 * anything gated on it (the WebGL scene, chiefly) is simply never mounted on a
 * phone, rather than mounted and hidden: three.js is never even downloaded there.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
