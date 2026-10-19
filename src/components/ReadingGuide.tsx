"use client";

// A horizontal band that follows the pointer or a touch, for readers who lose
// their line. Pure overlay: it never takes a click.

import { useEffect, useState } from "react";
import { usePrefs } from "@/lib/prefs";

export function ReadingGuide() {
  const { guide } = usePrefs();
  const [y, setY] = useState<number | null>(null);
  useEffect(() => {
    if (!guide) return;
    const onMove = (e: PointerEvent) => setY(e.clientY);
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) setY(t.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("touchmove", onTouch);
    };
  }, [guide]);
  if (!guide || y === null) return null;
  return <div className="reading-guide" style={{ top: y }} aria-hidden="true" />;
}
