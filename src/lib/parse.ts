// Turn model output (or a room preset) into categorized device observations.
//
// Two paths:
//   1. parseModelOutput()  - the live path. Prefers JSON; falls back to a
//      clause-by-clause keyword scan of free text so even a chatty model is usable.
//   2. fallbackObservations() - the offline path. Representative device fixtures
//      per room type, used when Ollama is unreachable so a demo never blanks.

import { DEVICE_CATALOG, NUMBER_WORDS } from "./devices";
import type { DeviceObservation, DeviceState } from "./types";

export type CategorizedObservation = DeviceObservation & { categoryId: string };

/** Map a free-text device label to exactly one catalog category (specific wins). */
export function matchCategory(label: string): string | null {
  const text = label.toLowerCase();
  for (const cat of DEVICE_CATALOG) {
    for (const kw of cat.keywords) {
      if (text.includes(kw)) return cat.id;
    }
  }
  return null;
}

function normalizeState(raw: unknown): DeviceState {
  const s = String(raw ?? "").toLowerCase();
  if (/\boff\b|powered down|turned off|not in use|dark|unplugged/.test(s)) return "off";
  if (/standby|sleep|idle|asleep|low power|sleeping/.test(s)) return "standby";
  return "on";
}

function extractCount(fragment: string): number {
  const digit = fragment.match(/\b(\d{1,3})\b/);
  if (digit) return Math.min(500, parseInt(digit[1], 10));
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(fragment)) return n;
  }
  return 1;
}

/** Pull the first balanced JSON array out of a possibly-chatty model response. */
function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function fromJson(arr: unknown[]): CategorizedObservation[] {
  const out: CategorizedObservation[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = String(rec.device ?? rec.name ?? rec.label ?? "");
    if (!label) continue;
    const categoryId = matchCategory(label);
    if (!categoryId) continue;
    const count =
      typeof rec.count === "number"
        ? Math.max(1, Math.round(rec.count))
        : extractCount(String(rec.count ?? "1"));
    out.push({ device: label, count, state: normalizeState(rec.state), categoryId });
  }
  return out;
}

function fromFreeText(text: string): CategorizedObservation[] {
  // Split into device-sized fragments so each maps to at most one category.
  const fragments = text
    .toLowerCase()
    .split(/[\n;.,]|(?:\band\b)|(?:\bwith\b)/)
    .map((f) => f.trim())
    .filter(Boolean);

  const out: CategorizedObservation[] = [];
  for (const frag of fragments) {
    const categoryId = matchCategory(frag);
    if (!categoryId) continue;
    out.push({
      device: frag.slice(0, 60),
      count: extractCount(frag),
      state: normalizeState(frag),
      categoryId,
    });
  }
  return out;
}

export function parseModelOutput(text: string): CategorizedObservation[] {
  const arr = extractJsonArray(text);
  if (arr) {
    const fromArr = fromJson(arr);
    if (fromArr.length) return fromArr;
  }
  return fromFreeText(text);
}

// ---- room presets (offline fallback) -----------------------------------

export interface RoomType {
  id: string;
  label: string;
  fixtures: { categoryId: string; count: number; state: DeviceState }[];
}

export const ROOM_TYPES: RoomType[] = [
  {
    id: "computer_lab",
    label: "Computer lab",
    fixtures: [
      { categoryId: "monitor", count: 30, state: "on" },
      { categoryId: "desktop", count: 30, state: "on" },
      { categoryId: "ceiling_light", count: 6, state: "on" },
      { categoryId: "projector", count: 1, state: "on" },
    ],
  },
  {
    id: "classroom",
    label: "Classroom",
    fixtures: [
      { categoryId: "projector", count: 1, state: "on" },
      { categoryId: "smartboard", count: 1, state: "standby" },
      { categoryId: "monitor", count: 1, state: "on" },
      { categoryId: "desktop", count: 1, state: "on" },
      { categoryId: "ceiling_light", count: 6, state: "on" },
    ],
  },
  {
    id: "hallway",
    label: "Hallway / corridor",
    fixtures: [{ categoryId: "ceiling_light", count: 14, state: "on" }],
  },
  {
    id: "break_room",
    label: "Break room / lounge",
    fixtures: [
      { categoryId: "vending_cold", count: 1, state: "on" },
      { categoryId: "fridge", count: 1, state: "on" },
      { categoryId: "water_cooler", count: 1, state: "on" },
      { categoryId: "coffee", count: 1, state: "on" },
      { categoryId: "microwave", count: 1, state: "standby" },
      { categoryId: "ceiling_light", count: 3, state: "on" },
    ],
  },
  {
    id: "office",
    label: "Office / admin",
    fixtures: [
      { categoryId: "monitor", count: 2, state: "on" },
      { categoryId: "desktop", count: 1, state: "on" },
      { categoryId: "copier", count: 1, state: "standby" },
      { categoryId: "ceiling_light", count: 4, state: "on" },
    ],
  },
  {
    id: "library",
    label: "Library / media center",
    fixtures: [
      { categoryId: "monitor", count: 12, state: "on" },
      { categoryId: "desktop", count: 12, state: "on" },
      { categoryId: "ceiling_light", count: 16, state: "on" },
      { categoryId: "copier", count: 1, state: "standby" },
    ],
  },
  {
    id: "gym",
    label: "Gym / large hall",
    fixtures: [{ categoryId: "ceiling_light", count: 24, state: "on" }],
  },
  {
    id: "unknown",
    label: "Mixed / not sure",
    fixtures: [
      { categoryId: "monitor", count: 4, state: "on" },
      { categoryId: "desktop", count: 2, state: "on" },
      { categoryId: "ceiling_light", count: 6, state: "on" },
      { categoryId: "projector", count: 1, state: "on" },
    ],
  },
];

export const ROOM_TYPE_BY_ID = Object.fromEntries(ROOM_TYPES.map((r) => [r.id, r]));

export function fallbackObservations(roomTypeId: string): CategorizedObservation[] {
  const room = ROOM_TYPE_BY_ID[roomTypeId] ?? ROOM_TYPE_BY_ID["unknown"];
  return room.fixtures.map((f) => ({
    device: f.categoryId,
    count: f.count,
    state: f.state,
    categoryId: f.categoryId,
  }));
}
