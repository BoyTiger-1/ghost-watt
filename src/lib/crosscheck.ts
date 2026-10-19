// Two readers, one picture: when they disagree, say so instead of counting.
//
// The cloud model recognises far more than the on-device detector and is
// usually right, but it can invent a device a room "should" have or round a
// count up to a tidy number. The on-device detector sees fewer kinds of thing
// but it only reports what is in the pixels. So for the classes both can see,
// a cloud claim the detector cannot back at all is marked unverified: still
// shown, still editable, but not in the totals until the user confirms it.
//
// Calibrated against the detector's measured recall (about half of screens in
// ordinary photos, docs/live-detector-benchmark.md): the detector missing some
// of what the model saw is normal and is not a disagreement; the model seeing
// several where the detector saw none, or far more than it saw, is.

import type { CategorizedObservation } from "./parse";

/** Catalog categories the on-device detector can report, by what it calls them. */
const COMPARABLE: Record<string, string[]> = {
  monitor: ["monitor", "tv", "smartboard", "digital_signage"],
  tv: ["monitor", "tv", "smartboard", "digital_signage"],
  smartboard: ["monitor", "tv", "smartboard", "digital_signage"],
  digital_signage: ["monitor", "tv", "smartboard", "digital_signage"],
  laptop: ["laptop", "monitor"],
  fridge: ["fridge", "vending_cold", "reach_in_cooler"],
  vending_cold: ["fridge", "vending_cold", "reach_in_cooler"],
  microwave: ["microwave"],
  ceiling_light: ["ceiling_light", "downlight"],
  downlight: ["ceiling_light", "downlight"],
};

/** Below this the model itself was hedging, whatever the detector saw. */
export const LOW_CONFIDENCE = 0.5;

export interface CrossCheckOptions {
  /** The detector saw nothing of a comparable kind and the model claims at least this many. */
  noneSeenMin?: number;
  /** The model's count exceeds this multiple of the detector's (plus `slack`). */
  ratio?: number;
  slack?: number;
}

const DEFAULTS: Required<CrossCheckOptions> = { noneSeenMin: 3, ratio: 2.5, slack: 1 };

/**
 * Mark cloud observations the on-device reading cannot back.
 *
 * `local` is the detector's reading of the same picture. When it is missing
 * (the detector failed to load, say), only the model's own confidence is used.
 */
export function crossCheck(
  cloud: readonly CategorizedObservation[],
  local: readonly CategorizedObservation[] | undefined,
  opts: CrossCheckOptions = {},
): CategorizedObservation[] {
  const o = { ...DEFAULTS, ...opts };
  const localCount = (ids: string[]) =>
    local!.filter((l) => ids.includes(l.categoryId) && l.state !== "off").reduce((s, l) => s + l.count, 0);

  return cloud.map((c) => {
    if (c.verification === "confirmed") return c;
    if (c.state === "off") return c;
    let unverified = c.confidence !== undefined && c.confidence < LOW_CONFIDENCE;
    const ids = COMPARABLE[c.categoryId];
    if (!unverified && local && ids) {
      const seen = localCount(ids);
      if (seen === 0 && c.count >= o.noneSeenMin) unverified = true;
      else if (seen > 0 && c.count > seen * o.ratio + o.slack) unverified = true;
    }
    return { ...c, verification: unverified ? "unverified" : "verified" };
  });
}
