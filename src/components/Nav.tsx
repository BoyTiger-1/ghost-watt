"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StatusPill } from "./StatusPill";

const TABS = [
  { href: "/scan", label: "Scanner" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/report", label: "Brief" },
  { href: "/class", label: "Class" },
  { href: "/methodology", label: "Method" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="site-header fixed inset-x-0 top-0 z-50 border-b border-line bg-ink/70 backdrop-blur-xl">
      {/* Three columns rather than justify-between, because the two side items are
          different widths and justify-between therefore centres nothing - it just
          parks the tabs wherever the logo happens to end. Equal fr tracks either
          side put the tab strip on the page's centre line and keep it there when
          the wordmark or the status pill changes size. */}
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <span className="relative grid h-7 w-7 place-items-center border border-line2 bg-surface">
            <span className="h-2.5 w-2.5 grad-energy-bg" />
            <span className="absolute inset-0 ticked" />
          </span>
          {/* The wordmark is the one thing here that can be given up on a narrow
              screen. The mark still carries the brand, and the space it frees is
              what lets the last two tabs be reachable on a phone. */}
          <span className="hidden font-mono text-sm font-bold tracking-[0.2em] text-fog sm:inline">
            GHOST<span className="text-cyan">{"//"}</span>WATT
          </span>
        </Link>

        {/* Six tabs, a wordmark and a status pill do not fit across 390px. This
            row used to simply overflow, and because the body clips horizontal
            overflow the last two tabs - Method and Settings - were invisible and
            unreachable on every phone. Letting the strip shrink and scroll keeps
            all six reachable without costing the desktop layout anything. */}
        <nav className="no-scrollbar flex min-w-0 items-center justify-center gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative shrink-0 whitespace-nowrap px-2.5 py-1.5 font-mono text-[0.7rem] tracking-[0.14em] uppercase transition-colors sm:px-3.5 sm:text-xs ${
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

        <div className="hidden shrink-0 justify-self-end sm:block">
          <StatusPill />
        </div>
        <div className="shrink-0 justify-self-end sm:hidden">
          <StatusPill compact />
        </div>
      </div>
    </header>
  );
}
