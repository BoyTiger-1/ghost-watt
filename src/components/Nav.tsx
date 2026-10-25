"use client";

// The site's one header, the same on the landing page and in the app.
//
// On a wide screen: one bar, with the sections as a segmented control. A dark
// pill marks where you are and springs to the next section when you move; a
// lighter one follows the pointer, so you can see where a click will land.
// On a phone the sections move to a tab bar under the thumb, the way a native
// app puts them, and the header keeps only the brand and the controls.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { EngineIndicator } from "./EngineIndicator";
import { Arrow, Mark } from "./home/HomeNav";
import { useT, type Key } from "@/lib/i18n";
import { ThemeToggle } from "./ThemeToggle";
import { GitHubMark } from "./GitHubMark";
import { GITHUB_URL } from "@/lib/site";

const TABS = [
  { href: "/scan", key: "nav.scanner", icon: "scan" },
  { href: "/places", key: "nav.places", icon: "building" },
  { href: "/team", key: "nav.team", icon: "people" },
  { href: "/methodology", key: "nav.method", icon: "book" },
  { href: "/about", key: "nav.about", icon: "info" },
] as const satisfies readonly { href: string; key: Key; icon: string }[];

export function Nav() {
  const pathname = usePathname();
  const t = useT();
  const home = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [pathname]);

  // Over the landing page's sky the bar starts clear and frosts once you scroll.
  const clear = home && !scrolled;

  return (
    <>
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`site-header fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-500 ${
          clear ? "border-transparent bg-transparent" : "border-line/80 bg-ink/75 backdrop-blur-xl backdrop-saturate-150"
        }`}
      >
        <div
          className={`mx-auto grid max-w-[84rem] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 transition-[height] duration-500 sm:px-6 lg:px-8 ${
            scrolled ? "h-14" : "h-14 md:h-[4.25rem]"
          }`}
        >
          <Link href="/" className="nav-brand group flex shrink-0 items-center gap-2.5" aria-label={t("nav.home")}>
            <Mark />
            <span className="text-[1rem] font-semibold tracking-[-0.02em] text-fog">Ghost Watt</span>
          </Link>

          <nav
            className="hidden items-center gap-0.5 rounded-full border border-line/70 bg-surface/60 p-1 shadow-[0_1px_2px_rgba(28,27,24,0.04)] backdrop-blur-md md:flex"
            aria-label="Sections"
            onMouseLeave={() => setHover(null)}
          >
            {TABS.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  data-tour={tab.href === "/places" ? "places" : undefined}
                  aria-current={active ? "page" : undefined}
                  onMouseEnter={() => setHover(tab.href)}
                  onFocus={() => setHover(tab.href)}
                  className={`relative rounded-full px-3.5 py-1.5 text-[0.86rem] font-medium transition-colors duration-300 lg:px-4 ${
                    active ? "text-ink" : "text-mist hover:text-fog"
                  }`}
                >
                  {hover === tab.href && !active && (
                    <motion.span
                      layoutId="nav-hover"
                      className="absolute inset-0 rounded-full bg-fog/[0.07]"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="nav-pill absolute inset-0 rounded-full bg-fog"
                      transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.9 }}
                    />
                  )}
                  <span className="relative">{t(tab.key)}</span>
                </Link>
              );
            })}
          </nav>
          <span className="md:hidden" />

          <div className="flex shrink-0 items-center gap-1.5 justify-self-end sm:gap-2">
            {home ? (
              <Link
                href="/scan"
                className="group hidden items-center gap-2 rounded-full bg-fog py-2 pl-4 pr-2.5 text-[0.86rem] font-medium text-ink transition-transform hover:scale-[1.03] active:scale-[0.98] sm:inline-flex"
              >
                {t("nav.open")}
                <span className="grid h-5 w-5 place-items-center rounded-full bg-sodium text-graphite transition-transform group-hover:translate-x-0.5">
                  <Arrow />
                </span>
              </Link>
            ) : (
              <>
                <div className="hidden sm:block">
                  <EngineIndicator />
                </div>
                <div className="sm:hidden">
                  <EngineIndicator compact />
                </div>
              </>
            )}
            <ThemeToggle />
            {/* The source code, one tap away. Desktop only: the phone's header is left as it is. */}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Ghost Watt on GitHub"
              title="Ghost Watt on GitHub"
              className="hidden h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:bg-fog/[0.06] hover:text-fog md:grid"
            >
              <GitHubMark />
            </a>
            <Link
              href="/settings"
              aria-label={t("nav.settings")}
              title={t("nav.settings")}
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
                pathname === "/settings" ? "bg-fog text-ink" : "text-mist hover:bg-fog/[0.06] hover:text-fog"
              }`}
            >
              <Icon name="gear" className="h-[1.15rem] w-[1.15rem] transition-transform duration-500 hover:rotate-90" />
            </Link>
          </div>
        </div>
      </motion.header>

      {/* the phone's tab bar */}
      <nav
        aria-label="Sections"
        className="app-tabbar no-print fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-ink/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  data-tour={tab.href === "/places" ? "places" : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-[0.66rem] font-medium transition-colors ${
                    active ? "text-fog" : "text-dim"
                  }`}
                >
                  <span className="relative grid h-7 w-12 place-items-center rounded-full">
                    {active && (
                      <motion.span
                        layoutId="tab-pill-phone"
                        className="absolute inset-0 rounded-full bg-fog"
                        transition={{ type: "spring", stiffness: 380, damping: 28 }}
                      />
                    )}
                    <Icon name={tab.icon} className={`relative h-[1.3rem] w-[1.3rem] transition-colors ${active ? "text-ink" : ""}`} />
                  </span>
                  {t(tab.key)}
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
      {name === "info" && (
        <>
          <circle cx="12" cy="12" r="8.5" {...P} />
          <path d="M12 11v5.5M12 7.6v.1" {...P} />
        </>
      )}
      {name === "gear" && (
        <>
          <circle cx="12" cy="12" r="3" {...P} />
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" {...P} />
        </>
      )}
    </svg>
  );
}
