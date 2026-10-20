// Minimal local Ollama client. No SDK, no API key - just a fetch to the local
// daemon. Vision model does perception only; energy math lives in energy.ts.

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
export const VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? "moondream";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000);

import { FULL_FRAME, SQUARE, type Frame } from "./boxes";

const DEVICE_NAMES =
  "computer monitor, all-in-one computer, desktop computer, laptop, projector, smartboard, TV, overhead lights (troffers and tube fixtures), recessed downlight, pendant light, vending machine, refrigerator, water cooler, printer, copier, server rack, window AC unit, space heater, coffee maker, microwave";

/** What the client knows about a capture, passed to the model as context. */
export interface PromptContext {
  /** "photo" (default) or "video": several frames of one walkthrough. */
  kind?: "photo" | "video";
  /** Number of frames, for video. */
  frames?: number;
  /** e.g. "9:42 PM on a Wednesday, outside the building's open hours". */
  when?: string;
  /** e.g. "Austin, Texas". */
  place?: string;
  /** What the person scanning said about it. */
  note?: string;
  /** On-device reads, offered as hints to verify, e.g. "3 lit light fixtures". */
  hints?: string[];
}

/**
 * The shape every engine is held to.
 *
 * Asking nicely for JSON gets JSON most of the time; a schema gets it every
 * time, with the fields typed. Anthropic enforces it as a forced tool call, the
 * OpenAI-shaped APIs as response_format, Ollama as `format`. Two fields exist
 * purely to fight invention: "visible" (the model must assert it can see the
 * thing) and "confidence" (so a hedge is a number the app can act on, not a
 * silently counted device).
 */
export const VISION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "One entry per kind of electrical device actually visible in the picture. Empty if none.",
      items: {
        type: "object",
        properties: {
          device: { type: "string", description: "Device name, e.g. computer monitor, projector, overhead lights, refrigerator." },
          count: { type: "integer", minimum: 1, description: "How many of this device are visible." },
          state: { type: "string", enum: ["on", "standby", "off"] },
          confidence: { type: "number", minimum: 0, maximum: 1, description: "How sure you are this is what it is and that the count is right." },
          visible: { type: "boolean", description: "True only if the device itself is in the picture, not inferred from context." },
          watts: { type: "number", description: "Best estimate of one unit's draw while running, W." },
          technology: { type: "string", description: "e.g. LED, CFL, T8 fluorescent, halogen, CRT, laser projector. Omit if unsure." },
          evidence: { type: "string", description: "A few words on what decided the state and wattage." },
          where: { type: "string", description: "Where in the picture these units are, in a few words: 'ceiling, left half', 'desk under the window', 'far wall'." },
          boxes: {
            type: "array",
            maxItems: 8,
            description: "Where the clearly visible units are, as [x1, y1, x2, y2] pixel coordinates in the square image.",
            items: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
          },
        },
        required: ["device", "count", "state", "confidence", "visible"],
      },
    },
  },
  required: ["items"],
} as const;

const WATT_GUIDE =
  "smartphone charging ~5, tablet ~8, 55-inch LED TV ~80, space heater ~1500, kettle or air fryer ~1500, toaster ~900, desk lamp ~10, game console ~150, 24-inch LED monitor ~20, 27-inch ~30, old CCFL monitor ~45, CRT ~80, desktop tower idle ~60, laptop charging ~30, lamp projector ~280, laser projector ~160, 75-inch interactive panel ~200, LED troffer ~35, 4-lamp T8 fluorescent troffer ~110, LED recessed downlight ~10, LED pendant ~15, CFL/LED bulb ~10, 27-inch all-in-one computer ~70, vending machine ~400, mini fridge ~70";

/**
 * The perception prompt, told exactly how much of the square is photo.
 *
 * Box instructions are written against what went wrong in live tests: asked for
 * "every" unit, models invent a tidy row of boxes until they hit the frame edge,
 * pad with zeros, and box chairs and keyboards. Each line below closes one of
 * those. The cap of 8 is deliberately under the parser's 10, so a model that
 * overshoots still gets trimmed rather than trusted.
 *
 * The model is also asked to read each unit's wattage off what it can see -
 * size, age, lamp or LED - because that is the single biggest lever on the
 * money: "projector" spans 150 W to 400 W. lib/estimate.ts blends that read
 * with the catalog band rather than trusting it outright.
 */
export function buildVisionPrompt(frame: Frame = FULL_FRAME, ctx: PromptContext = {}): string {
  const video = ctx.kind === "video" && (ctx.frames ?? 0) > 1;
  const w = Math.round(frame.w);
  const h = Math.round(frame.h);
  const layout = video
    ? `You are given ${ctx.frames} frames, in order, from ONE continuous walkthrough video of the same space. The same device often appears in several frames: count each physical device ONCE across all frames. Do not give boxes.`
    : w >= SQUARE && h >= SQUARE
      ? `The image is ${SQUARE} x ${SQUARE} pixels.`
      : `The image is a ${SQUARE} x ${SQUARE} square. The photo fills the top-left ${w} x ${h} region; everything outside it is plain grey padding with nothing in it.`;

  const context = [
    ctx.when && `Captured: ${ctx.when}.`,
    ctx.place && `Location: ${ctx.place}.`,
    ctx.note && `The person scanning says: "${ctx.note.slice(0, 200).replace(/"/g, "'")}".`,
    ctx.hints?.length && `An on-device detector suggests (verify, do not copy): ${ctx.hints.join("; ")}.`,
  ].filter(Boolean);

  const boxRules = video
    ? ""
    : `
Also give "boxes": where each unit is, as [x1, y1, x2, y2] pixel coordinates in the ${SQUARE} x ${SQUARE} image (top-left corner, bottom-right corner). Rules for boxes:
- At most 8 boxes per device type, for the most clearly visible units. The count may be higher than the number of boxes.
- Only box a unit you can actually see. Never guess, never continue a pattern along a row, never pad with zeros.
- Ignore things that do not use power: chairs, desks, tables, keyboards, mice, cables.
`;

  const example = video
    ? `[{"device":"computer monitor","count":24,"state":"on","confidence":0.8,"visible":true,"watts":22,"evidence":"screens lit, login page"},{"device":"overhead lights","count":12,"state":"on","confidence":0.9,"visible":true,"watts":35,"evidence":"LED panels lit"}]`
    : `[{"device":"computer monitor","count":12,"state":"on","confidence":0.85,"visible":true,"watts":22,"technology":"LED","evidence":"screens lit, 24-inch LED","where":"two rows of desks, centre","boxes":[[112,388,201,470],[236,392,318,468]]},{"device":"overhead lights","count":6,"state":"on","confidence":0.9,"visible":true,"watts":35,"technology":"LED","evidence":"LED troffers lit","where":"ceiling, whole room","boxes":[[300,20,420,60]]},{"device":"projector","count":1,"state":"standby","confidence":0.5,"visible":true,"watts":250,"evidence":"amber standby light, partly hidden","where":"ceiling mount, front","boxes":[[480,90,560,140]]}]`;

  return `You are auditing ${video ? "a video walkthrough" : "a photo"} of a room in a school, office, home or other building, ideally taken after hours. Your job is to spot electrical devices and appliances that are left running or drawing power, and to judge how much each draws.

${layout}
${context.length ? "\n" + context.join("\n") + "\n" : ""}
List every electrical device or appliance you can see in the picture - lights included - and nothing you cannot see. For each give:
- "device": be specific. Use these names where they fit: ${DEVICE_NAMES}. For anything else, name the exact appliance the way a person would ("air fryer", "label maker", "electric kettle", "phone"), never a vague word like "appliance", "device" or "electronics". Anything with a plug, a battery charger or a power cord counts. Say which kind of light (recessed downlights, globe pendant lights, LED panels, track lights, a desk lamp) rather than just "lights". Each distinct kind gets its own entry, even when two kinds sit side by side.
- "count": how many you can see.
- "state": ON (lit, running, display showing something), STANDBY (dark but with an indicator light or clock), or OFF.
- "confidence": 0 to 1, how sure you are of the device and the count.
- "visible": true for everything you list.
- "watts": your best estimate of ONE unit's power draw in watts while running, judged from its visible size, age and technology. Reference points: ${WATT_GUIDE}.
- "technology": the kind of unit if you can tell, e.g. "LED", "halogen", "incandescent", "CFL", "T8 fluorescent", "T12 fluorescent", "CRT", "CCFL LCD", "plasma", "lamp projector", "laser projector". Omit if unsure.
- "evidence": a few words on what you saw that decided the state and wattage.
- "where": where in the picture the units are, in a few words ("ceiling, left half", "desk under the window"), so a person can walk to them.

Identity rules - these are the mistakes models make most:
- A phone, tablet, laptop, TV or monitor with a bright screen is that device, NEVER a lamp or a light. Only call something a lamp or light if it is a light fixture or bulb.
- A screen's reflection, a lit doorway and a bright window are not devices.
- An object you cannot identify confidently still gets your best specific guess with a low confidence, so a person can correct it. Never invent objects that are not there.

Counting rules - these are where audits go wrong:
- Count every light fixture individually, including small recessed downlights far down a corridor, pendant globes hanging from the ceiling and lamps on desks. Report each kind of light as its own entry (troffers, downlights, pendants), never lumped together. A light that is visibly lit is ON; a fixture that is clearly dark is OFF.
- Daylight through a window, a reflection in glass or a glossy floor, and a white wall or grille are NOT lights. Only count a fixture you can see.
- Count computers and monitors even when seen from behind or at an angle; an all-in-one (like an iMac) is one device, not a monitor plus a computer. If you cannot see the screen, use STANDBY.
- Look across the whole image, edges and background included, before answering.
${boxRules}
Respond ONLY with JSON of the form {"items": [...]}, no other text. Example of the items array:
${example}`;
}

/** The prompt for an unpadded square, kept for callers that have no frame. */
export const VISION_PROMPT = buildVisionPrompt(FULL_FRAME);

export interface OllamaVisionResult {
  ok: boolean;
  text: string;
  model: string;
  error?: string;
}

/** Strip a data: URL prefix if present - Ollama wants bare base64. */
function toBareBase64(image: string): string {
  const comma = image.indexOf(",");
  return image.startsWith("data:") && comma !== -1 ? image.slice(comma + 1) : image;
}

export async function describeImage(
  images: string | string[],
  prompt: string = VISION_PROMPT,
  schema: object = VISION_SCHEMA,
): Promise<OllamaVisionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: VISION_MODEL,
        prompt,
        images: (Array.isArray(images) ? images : [images]).map(toBareBase64),
        stream: false,
        format: schema,
        options: { temperature: 0 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        text: "",
        model: VISION_MODEL,
        error: `Ollama responded ${res.status}. ${detail.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as { response?: string };
    return { ok: true, text: data.response ?? "", model: VISION_MODEL };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Vision model timed out after ${Math.round(TIMEOUT_MS / 1000)}s.`
        : err instanceof Error
          ? err.message
          : "Unknown error contacting Ollama.";
    return { ok: false, text: "", model: VISION_MODEL, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Quick reachability + model-availability probe for the status indicator. */
export async function probeOllama(): Promise<{
  reachable: boolean;
  hasModel: boolean;
  model: string;
  host: string;
  models: string[];
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { reachable: false, hasModel: false, model: VISION_MODEL, host: OLLAMA_HOST, models: [] };
    const data = (await res.json()) as { models?: { name?: string }[] };
    const models = (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
    const base = VISION_MODEL.split(":")[0];
    const hasModel = models.some((m) => m === VISION_MODEL || m.split(":")[0] === base);
    return { reachable: true, hasModel, model: VISION_MODEL, host: OLLAMA_HOST, models };
  } catch {
    return { reachable: false, hasModel: false, model: VISION_MODEL, host: OLLAMA_HOST, models: [] };
  } finally {
    clearTimeout(timer);
  }
}
