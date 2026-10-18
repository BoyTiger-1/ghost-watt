"use client";

// The app's chrome.
//
// On a wide screen: one quiet bar, with the sections as a segmented control.
// On a phone the sections move to a tab bar under the thumb, the way a native
// app puts them, and the header keeps only the brand and the engine status.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EngineIndicator } from "./EngineIndicator";
import { Mark } from "./home/HomeNav";

const TABS = [
  { href: "/scan", label: "Scanner", short: "Scan", icon: "scan" },
  { href: "/portfolio", label: "Rooms", short: "Rooms", icon: "rooms" },
  { href: "/report", label: "Brief", short: "Brief", icon: "doc" },
  { href: "/buildings", label: "Buildings", short: "Buildings", icon: "building" },
  { href: "/methodology", label: "Method", short: "Method", icon: "book" },
] as const;

export function Nav() {
  const pathname = usePathname();

  // The landing page brings its own header (components/home).
  if (pathname === "/") return null;

  return (
    <>
      <header className="site-header fixed inset-x-0 top-0 z-50 border-b border-line/80 bg-ink/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto grid h-14 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 md:h-16">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Ghost Watt home">
            <Mark />
            <span className="text-[1rem] font-semibold tracking-[-0.02em] text-fog">Ghost Watt</span>
          </Link>

          <nav className="hidden items-center gap-0.5 rounded-full bg-fog/[0.045] p-1 md:flex" aria-label="Sections">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-[0.86rem] transition-all ${
                    active
                      ? "bg-surface text-fog shadow-[0_1px_2px_rgba(28,27,24,0.08),0_4px_12px_-6px_rgba(28,27,24,0.2)]"
                      : "text-mist hover:text-fog"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <span className="md:hidden" />

          <div className="flex shrink-0 items-center gap-2 justify-self-end">
            <div className="hidden sm:block">
              <EngineIndicator />
            </div>
            <div className="sm:hidden">
              <EngineIndicator compact />
            </div>
            <Link
              href="/settings"
              aria-label="Settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
                pathname === "/settings" ? "bg-fog text-ink" : "text-mist hover:bg-fog/[0.06] hover:text-fog"
              }`}
            >
              <Icon name="gear" className="h-[1.15rem] w-[1.15rem]" />
            </Link>
          </div>
        </div>
      </header>

      {/* the phone's tab bar */}
      <nav
        aria-label="Sections"
        className="app-tabbar no-print fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-ink/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-[0.68rem] font-medium transition-colors ${
                    active ? "text-fog" : "text-dim"
                  }`}
                >
                  <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-fog/[0.07]" : ""}`}>
                    <Icon name={tab.icon} className="h-[1.3rem] w-[1.3rem]" />
                  </span>
                  {tab.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {name === "scan" && (
        <>
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" {...P} />
          <rect x="8.5" y="9" width="7" height="6" rx="1.2" {...P} />
        </>
      )}
      {name === "building" && (
        <>
          <path d="M4 20V8l8-4 8 4v12" {...P} />
          <path d="M9 20v-5h6v5M8 10h1M11.5 10h1M15 10h1" {...P} />
        </>
      )}
      {name === "rooms" && (
        <>
          <rect x="3.5" y="4" width="7" height="7" rx="1.2" {...P} />
          <rect x="13.5" y="4" width="7" height="7" rx="1.2" {...P} />
          <rect x="3.5" y="13" width="7" height="7" rx="1.2" {...P} />
          <rect x="13.5" y="13" width="7" height="7" rx="1.2" {...P} />
        </>
      )}
      {name === "doc" && (
        <>
          <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5z" {...P} />
          <path d="M14 3.5V8h4M9 12h6M9 15.5h4" {...P} />
        </>
      )}
      {name === "people" && (
        <>
          <circle cx="9" cy="9" r="3" {...P} />
          <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" {...P} />
          <path d="M15.5 6.3a3 3 0 0 1 0 5.4M17 14.7c1.8.5 3 1.9 3.5 4.3" {...P} />
        </>
      )}
      {name === "book" && (
        <>
          <path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z" {...P} />
          <path d="M12 6v13" {...P} />
        </>
      )}
      {name === "gear" && (
        <>
          <circle cx="12" cy="12" r="3" {...P} />
          <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" {...P} />
        </>
      )}
    </svg>
  );
}
