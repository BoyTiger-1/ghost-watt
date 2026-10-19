"use client";

import Link from "next/link";
import { useEffect, useState, useId } from "react";

const LINKS = [
  { href: "#see", label: "How it works" },
  { href: "#count", label: "The math" },
  { href: "#everywhere", label: "Devices" },
  { href: "#class", label: "Team scan" },
  { href: "#method", label: "Methodology" },
];

// The mark: a ghost with a bolt in it, the thing left running after everyone
// has gone. The body takes the text colour so it follows the theme; the bolt
// stays amber, with a thin gap cut around it so it reads at any size.
export function Mark({ className = "h-7 w-[1.33rem]" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="7.5 5.5 17 22.5" className={`${className} text-fog`} aria-hidden="true">
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

export function HomeNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-500 ${
        scrolled
          ? "bg-paper/75 shadow-[0_1px_0_rgba(28,27,24,0.08)] backdrop-blur-xl backdrop-saturate-150"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[84rem] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Ghost Watt home">
          <Mark />
          <span className="text-[1.02rem] font-semibold tracking-[-0.02em] text-graphite">Ghost Watt</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Homepage">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-[0.88rem] text-stone transition-colors hover:bg-graphite/[0.05] hover:text-graphite"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/about"
            className="hidden rounded-full px-3.5 py-2 text-[0.88rem] text-stone transition-colors hover:text-graphite sm:block"
          >
            About
          </Link>
          <Link
            href="/scan"
            className="group inline-flex items-center gap-2 rounded-full bg-graphite py-2 pl-4 pr-3 text-[0.88rem] font-medium text-paper transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Open the app
            <span className="grid h-5 w-5 place-items-center rounded-full bg-paper/15 transition-transform group-hover:translate-x-0.5">
              <Arrow />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Arrow({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
      <path d="M2.5 6h7M6.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
