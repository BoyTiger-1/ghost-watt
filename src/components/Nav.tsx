"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StatusPill } from "./StatusPill";

const TABS = [
  { href: "/", label: "Scanner" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative grid h-7 w-7 place-items-center border border-line2 bg-surface">
            <span className="h-2.5 w-2.5 grad-energy-bg" />
            <span className="absolute inset-0 ticked" />
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.2em] text-fog">
            GHOST<span className="text-cyan">{"//"}</span>WATT
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative px-2.5 py-1.5 font-mono text-[0.7rem] tracking-[0.14em] uppercase transition-colors sm:px-3.5 sm:text-xs ${
                  active ? "text-fog" : "text-dim hover:text-mist"
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-cyan to-lime" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden sm:block">
          <StatusPill />
        </div>
        <div className="sm:hidden">
          <StatusPill compact />
        </div>
      </div>
    </header>
  );
}
