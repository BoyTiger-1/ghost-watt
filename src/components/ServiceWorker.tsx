"use client";

// Registers the service worker, and nothing else.
//
// Kept deliberately quiet: no update toast, no "new version available" banner. The
// worker takes over on the next navigation, which for a page a user visits between
// corridors is soon enough, and a modal interrupting someone mid-audit to announce
// a cache change would be worse than the staleness it fixes.

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const t = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A blocked or unsupported worker costs the offline fallback and nothing
        // else, so there is nothing worth telling the user here.
      });
    }, 1200); // after first paint; registration is not on the critical path
    return () => clearTimeout(t);
  }, []);

  return null;
}
