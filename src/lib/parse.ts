// Turn model output into categorized device observations.
//
// parseModelOutput() prefers JSON and falls back to a clause-by-clause keyword
// scan of free text, so a chatty model is still usable. There is deliberately no
// "typical room" preset path: a reading either comes from a picture or it does
// not exist.

import { DEVICE_CATALOG, NUMBER_WORDS } from "./devices";
import { OTHER_DEVICE } from "./appliances";
import type { DeviceObservation, DeviceState } from "./types";
import { cleanBoxes, FULL_FRAME, type Frame } from "./boxes";

export type CategorizedObservation = DeviceObservation & { categoryId: string };

/**
 * Map a free-text device label to exactly one catalog category.
 *
 * The longest matching keyword wins, which is what "specific beats general" has to
 * mean once two categories legitimately share a word. Catalog order used to decide
 * it, and that silently mispriced anything whose name contained a more general
 * category's keyword: "water cooler" matched the fridge entry on "cooler" and was
 * costed as a refrigerator, because fridge happens to be declared first. Length is
 * the right tiebreak because a keyword that is a superstring of another is by
 * definition the more specific description of the same object.
 *
 * Ties fall back to catalog order, which keeps the function deterministic.
 */
export function matchCategory(label: string): string | null {
  const text = label.toLowerCase();
  let bestId: string | null = null;
  let bestLen = 0;

  for (const cat of DEVICE_CATALOG) {
    for (const kw of cat.keywords) {
      if (kw.length > bestLen && text.includes(kw)) {
        bestId = cat.id;
        bestLen = kw.length;
      }
    }
  }
  return bestId;
}

// "Lamp" is the word vision models reach for when they see a light, and it is
// wrong both ways. Fixtures on the ceiling get called lamps, and the bare word
// matched the overhead-lighting entry, so a real 10 W desk lamp was priced as a
// 120 W bank of troffers. So a lamp is placed by what the model said about it.
const CEILING = /\b(ceiling|overhead|recessed|mounted|hanging|suspended|pendants?|troffers?|tubes?|fluorescent|panels?|track|high bay|chandeliers?)\b/;
const COMPACT = /\b(recessed|pendants?|hanging|can|pot|bulbs?|globes?|track|spots?|downlights?|chandeliers?)\b/;
const FREESTANDING = /\b(desk|table|floor|reading|bedside|nightstand|gooseneck|standing|shelf)\b/;

/**
 * Where a "lamp" really belongs. Only touches a label that landed on the
 * overhead-lighting entry through the bare word "lamp"; a named lamp the
 * catalog knows (desk lamp, lava lamp, heat lamp) keeps its own match.
 */
export function resolveLight(label: string, context: string, categoryId: string): { categoryId: string; device: string } {
  const l = label.toLowerCase();
  if (categoryId !== "ceiling_light" || !/\blamps?\b/.test(l)) return { categoryId, device: label };
  const ctx = `${l} ${context.toLowerCase()}`;
  if (CEILING.test(ctx) && !FREESTANDING.test(l)) {
    return COMPACT.test(ctx) ? { categoryId: "downlight", device: "ceiling downlights" } : { categoryId: "ceiling_light", device: "overhead lights" };
  }
  if (/\bfloor\b/.test(ctx)) return { categoryId: "x_floor_lamp", device: label };
  // Nothing says ceiling: a lamp is a lamp, on a desk, a table or a shelf.
  return { categoryId: "x_desk_lamp", device: label };
}

/** Labels a model sometimes lists that draw no power: furniture, people, paper. */
const NOT_ELECTRIC =
  /(?:^|\s)(?:chairs?|desks?|tables?|people|persons?|students?|books?|papers?|plants?|windows?|doors?|walls?|bags?|backpacks?|boxes?|shelves?|cabinets?|whiteboards?|chalkboards?|posters?|cups?|bottles?|pens?|pencils?|curtains?|rugs?|carpets?|sofas?|couch(?:es)?|beds?|pillows?|mirrors?|clothes|shoes?|trash cans?|bins?|crowd)$/i;

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
function extractJsonArray(raw: string): unknown[] | null {
  // Reasoning models may think out loud in <think> tags before the answer.
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "").trim();
  // The schema answer is {"items": [...]}; take the array inside it, whether the
  // object is the whole reply or sits after a sentence of prose.
  const objStart = text.startsWith("{") ? 0 : text.search(/\{\s*"items"/);
  if (objStart !== -1) {
    let depth = 0;
    let inString = false;
    for (let i = objStart; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            const obj = JSON.parse(text.slice(objStart, i + 1)) as { items?: unknown };
            if (Array.isArray(obj.items)) return obj.items;
          } catch {
            // Not a clean object: fall through to the array scan.
          }
          break;
        }
      }
    }
  }
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

function fromJson(arr: unknown[], frame: Frame): CategorizedObservation[] {
  const out: CategorizedObservation[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = String(rec.device ?? rec.name ?? rec.label ?? "");
    if (!label) continue;
    // The model was asked to assert it can see the thing. "visible": false is an
    // inference about the room, not a reading of the picture, and is dropped.
    if (rec.visible === false) continue;
    // Something powered the catalog has no name for is still a reading: it is
    // filed as "other powered device", priced from the model's own watt reading
    // inside a very wide band, and marked low confidence. Things that are not
    // electrical at all are left out.
    const matched = matchCategory(label);
    if (!matched && NOT_ELECTRIC.test(label)) continue;
    const contextText = [rec.where, rec.evidence, rec.technology].filter((v) => typeof v === "string").join(" ");
    const placed = resolveLight(label, contextText, matched ?? OTHER_DEVICE.id);
    const categoryId = placed.categoryId;
    const count =
      typeof rec.count === "number"
        ? Math.max(1, Math.round(rec.count))
        : extractCount(String(rec.count ?? "1"));
    const boxes = cleanBoxes(rec, frame);
    const watts = Number(rec.watts ?? rec.wattage ?? rec.power_w ?? rec.power);
    const where = typeof rec.where === "string" ? rec.where.trim().slice(0, 60) : "";
    const said = typeof rec.evidence === "string" ? rec.evidence.trim().slice(0, 120) : "";
    // Where it is comes first: that is what a person walks to.
    const evidence = [where, said].filter(Boolean).join(" · ");
    const techRaw = rec.technology ?? rec.tech ?? rec.type;
    const tech = typeof techRaw === "string" ? techRaw.trim().slice(0, 40) : "";
    const confRaw = Number(rec.confidence);
    const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw > 1 ? confRaw / 100 : confRaw)) : undefined;
    out.push({
      device: placed.device,
      // A model that boxed more units than it counted has told us its count was low.
      count: Math.max(count, boxes.length),
      state: normalizeState(rec.state),
      categoryId,
      ...(boxes.length ? { boxes } : {}),
      ...(Number.isFinite(watts) && watts > 0 ? { wattsHint: watts } : {}),
      ...(evidence ? { evidence } : {}),
      ...(tech ? { tech } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
    });
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
    const matched = matchCategory(frag);
    if (!matched) continue;
    const { categoryId, device } = resolveLight(frag, frag, matched);
    out.push({
      device: device.slice(0, 60),
      count: extractCount(frag),
      state: normalizeState(frag),
      categoryId,
    });
  }
  return out;
}

export function parseModelOutput(
  text: string,
  frame: Frame = FULL_FRAME,
): CategorizedObservation[] {
  const arr = extractJsonArray(text);
  if (arr) {
    const fromArr = fromJson(arr, frame);
    if (fromArr.length) return fromArr;
  }
  return fromFreeText(text);
}
