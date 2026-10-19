"use client";

// A word with its explanation one tap away: dotted underline, and a short
// definition on hover, focus or tap. Used for every unit and every bit of
// jargon the results can't avoid.

import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "./plain";

export function Term({ k, children }: { k: GlossaryKey; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span ref={ref} className="relative inline" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="cursor-help underline decoration-current/40 decoration-dotted underline-offset-[3px]"
      >
        {children}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-40 mt-1.5 block w-[min(17rem,80vw)] -translate-x-1/2 rounded-xl bg-fog px-3 py-2.5 text-left text-[0.78rem] font-normal normal-case leading-relaxed tracking-normal text-ink shadow-lg"
        >
          {GLOSSARY[k]}
        </span>
      )}
    </span>
  );
}
