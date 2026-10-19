"use client";

import { useId } from "react";

// The mark: a ghost with a bolt in it, the thing left running after everyone
// has gone. The body takes the text colour so it follows the theme; the bolt
// stays amber, with a thin gap cut around it so it reads at any size.
export function Mark({ className = "h-7 w-[1.33rem]", tint = "text-fog" }: { className?: string; tint?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="7.5 5.5 17 22.5" className={`${className} ${tint}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc35a" />
          <stop offset="1" stopColor="#f28a1d" />
        </linearGradient>
        <mask id={`${id}m`}>
          <rect x="0" y="0" width="32" height="32" fill="#fff" />
          <path d={BOLT} fill="#000" stroke="#000" strokeWidth="2.2" strokeLinejoin="round" />
        </mask>
      </defs>
      <path d={GHOST} fill="currentColor" mask={`url(#${id}m)`} />
      <path d={BOLT} fill={`url(#${id}g)`} stroke={`url(#${id}g)`} strokeWidth="0.6" strokeLinejoin="round" />
    </svg>
  );
}

const GHOST = "M8.5 24.6V14a7.5 7.5 0 0 1 15 0v10.6a2.5 2.1 0 0 1-5 0a2.5 2.1 0 0 1-5 0a2.5 2.1 0 0 1-5 0Z";
const BOLT = "M17.2 9.6 12.6 16.3h3.6l-1.4 5.5 4.8-6.9h-3.6Z";

export function Arrow({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
      <path d="M2.5 6h7M6.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
