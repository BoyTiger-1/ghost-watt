"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "#see", label: "How it works" },
  { href: "#count", label: "The math" },
  { href: "#everywhere", label: "Devices" },
  { href: "#class", label: "Classrooms" },
  { href: "#method", label: "Methodology" },
];

/** A window with the light left on. */
export function Mark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="8" fill="#1c1b18" />
      <rect x="7" y="7" width="6" height="6" rx="1.6" fill="#3a4462" />
      <rect x="15" y="7" width="6" height="6" rx="1.6" fill="#3a4462" />
      <rect x="7" y="15" width="6" height="6" rx="1.6" fill="#3a4462" />
      <rect x="15" y="15" width="6" height="6" rx="1.6" fill="#ffb54a" />
      <rect x="15" y="15" width="6" height="6" rx="1.6" fill="#ffb54a" opacity="0.5" filter="url(#mk)" />
      <defs>
        <filter id="mk" x="-1" y="-1" width="3" height="3">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
    </svg>
  );
}

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
