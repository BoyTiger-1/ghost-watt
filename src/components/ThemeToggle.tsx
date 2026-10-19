"use client";

// One tap between light and dark. The full theme choice (including "follow the
// system") and every other display setting live on the settings page.

import { useSyncExternalStore } from "react";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { useT } from "@/lib/i18n";

const query = "(prefers-color-scheme: dark)";

function subscribeSystem(fn: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}

export function ThemeToggle() {
  const p = usePrefs();
  const t = useT();
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(query).matches,
    () => null,
  );

  // Until the client knows the system theme, render a placeholder of the same size.
  const dark = systemDark === null ? null : p.theme === "dark" || (p.theme === "system" && systemDark);
  const label = dark ? t("nav.theme.toLight") : t("nav.theme.toDark");

  return (
    <button
      type="button"
      onClick={() => setPrefs({ theme: dark ? "light" : "dark" })}
      aria-label={label}
      title={label}
      disabled={dark === null}
      className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:bg-fog/[0.06] hover:text-fog"
    >
      <svg viewBox="0 0 24 24" className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        {dark ? (
          // In dark mode, show the sun: tapping goes to light.
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
          </>
        ) : dark === false ? (
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        ) : null}
      </svg>
    </button>
  );
}
