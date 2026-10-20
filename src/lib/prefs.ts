// Display and accessibility preferences.
//
// Ten settings, each one thing a person might need to use the app at all:
// theme, text size, contrast, motion, a colour-blind-safe palette, language,
// underlined links, bigger touch targets, wider letter spacing and an
// always-visible focus ring. They are stored on this device only, applied as
// attributes on <html> so that plain CSS does the work, and set before the
// first paint by a tiny inline script (see app/layout.tsx) so nothing flashes.

import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";
export type TextSize = "normal" | "large" | "xl";
export type Motion = "system" | "reduce";
export type Palette = "default" | "safe";
export type Lang = keyof typeof LANG_NAMES;

export type Font = "default" | "plain";

export interface Prefs {
  theme: Theme;
  text: TextSize;
  contrast: boolean;
  motion: Motion;
  palette: Palette;
  lang: Lang;
  underline: boolean;
  targets: boolean;
  spacing: boolean;
  focus: boolean;
  /** A plain sans-serif everywhere, no display serif. */
  font: Font;
  bold: boolean;
  /** Taller lines and more space between paragraphs. */
  lineheight: boolean;
  grayscale: boolean;
  /** A horizontal band that follows the pointer, for keeping one's place. */
  guide: boolean;
  /** A large pointer. */
  cursor: boolean;
  /** No 3D scenes or decorative animation; still pictures instead. */
  lite: boolean;
  /** The live view never confirms on its own; a button does it. */
  manualConfirm: boolean;
  /** A short tone when a view is confirmed or a photo is read. */
  sound: boolean;
  /** A short vibration on the shutter and on a confirmed view. */
  haptics: boolean;
  /** Space takes a photo, V records, F flips, in the scanner. */
  shortcuts: boolean;
  /** Camera controls mirrored for the left thumb. */
  leftHand: boolean;
  /** Boxes only on the live view; no labels, no sweep, no reticle. */
  minimalOverlay: boolean;
  /** Read each scan's result aloud when it finishes. */
  speak: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  text: "normal",
  contrast: false,
  motion: "system",
  palette: "default",
  lang: "en",
  underline: false,
  targets: false,
  spacing: false,
  focus: false,
  font: "default",
  bold: false,
  lineheight: false,
  grayscale: false,
  guide: false,
  cursor: false,
  lite: false,
  manualConfirm: false,
  sound: false,
  haptics: true,
  shortcuts: true,
  leftHand: false,
  minimalOverlay: false,
  speak: false,
};



import { LANG_NAMES, LANG_TAGS } from "./i18n-more";

export { PREFS_KEY } from "./prefs-boot";
import { PREFS_KEY } from "./prefs-boot";

let prefs: Prefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    const merged = { ...DEFAULT_PREFS, ...p };
    // A language this build no longer has falls back to English rather than breaking every label.
    if (!(merged.lang in LANG_NAMES)) merged.lang = "en";
    return merged;
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Mirror the stored preferences onto <html>, the same way the boot script does. */
export function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const d = document.documentElement;
  const dark = p.theme === "dark" || (p.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  d.setAttribute("data-theme", dark ? "dark" : "light");
  d.setAttribute("data-theme-pref", p.theme);
  d.setAttribute("data-text", p.text);
  d.setAttribute("data-motion", p.motion);
  d.setAttribute("data-palette", p.palette);
  d.setAttribute("data-font", p.font);
  d.lang = LANG_TAGS[p.lang] ?? "en";
  for (const k of ["contrast", "underline", "targets", "spacing", "focus", "bold", "lineheight", "grayscale", "cursor", "lite"] as const) {
    if (p[k]) d.setAttribute(`data-${k}`, "");
    else d.removeAttribute(`data-${k}`);
  }
  if (p.leftHand) d.setAttribute("data-lefthand", "");
  else d.removeAttribute("data-lefthand");
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  prefs = read();
  // Follow the system theme while the preference is "system".
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyPrefs(prefs));
}

function subscribe(fn: () => void) {
  ensureLoaded();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setPrefs(patch: Partial<Prefs>) {
  ensureLoaded();
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not remembered, still applied for this visit.
  }
  applyPrefs(prefs);
  for (const fn of listeners) fn();
}

export function resetPrefs() {
  setPrefs(DEFAULT_PREFS);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    subscribe,
    () => {
      ensureLoaded();
      return prefs;
    },
    () => DEFAULT_PREFS,
  );
}
