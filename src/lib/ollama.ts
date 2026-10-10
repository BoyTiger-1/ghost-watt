// Minimal local Ollama client. No SDK, no API key - just a fetch to the local
// daemon. Vision model does perception only; energy math lives in energy.ts.

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
export const VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? "moondream";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000);

import { FULL_FRAME, SQUARE, type Frame } from "./boxes";

const DEVICE_NAMES =
  "computer monitor, desktop computer, laptop, projector, smartboard, TV, overhead lights, vending machine, refrigerator, water cooler, printer, copier, server rack, window AC unit, space heater, coffee maker, microwave";

/**
 * The perception prompt, told exactly how much of the square is photo.
 *
 * Box instructions are written against what went wrong in live tests: asked for
 * "every" unit, models invent a tidy row of boxes until they hit the frame edge,
 * pad with zeros, and box chairs and keyboards. Each line below closes one of
 * those. The cap of 8 is deliberately under the parser's 10, so a model that
 * overshoots still gets trimmed rather than trusted.
 */
export function buildVisionPrompt(frame: Frame = FULL_FRAME): string {
  const w = Math.round(frame.w);
  const h = Math.round(frame.h);
  const layout =
    w >= SQUARE && h >= SQUARE
      ? `The image is ${SQUARE} x ${SQUARE} pixels.`
      : `The image is a ${SQUARE} x ${SQUARE} square. The photo fills the top-left ${w} x ${h} region; everything outside it is plain grey padding with nothing in it.`;

  return `You are auditing a photo of a room in a school, taken after hours or when the room is empty. Your job is to spot electrical devices and appliances that appear to be left running or drawing power.

${layout}

List every electrical device or appliance you can see. For each, note whether it appears ON, in STANDBY (a small light or clock but not in active use), or OFF. Use these names where they fit: ${DEVICE_NAMES}. Give the count of each.

Also give "boxes": where each unit is, as [x1, y1, x2, y2] pixel coordinates in the ${SQUARE} x ${SQUARE} image (top-left corner, bottom-right corner). Rules for boxes:
- At most 8 boxes per device type, for the most clearly visible units. The count may be higher than the number of boxes.
- Only box a unit you can actually see. Never guess, never continue a pattern along a row, never pad with zeros.
- Ignore things that do not use power: chairs, desks, tables, keyboards, mice, cables.

Respond ONLY with a JSON array, no other text. Example:
[{"device":"computer monitor","count":12,"state":"on","boxes":[[112,388,201,470],[236,392,318,468]]},{"device":"overhead lights","count":6,"state":"on","boxes":[[300,20,420,60]]},{"device":"projector","count":1,"state":"standby","boxes":[[480,90,560,140]]}]`;
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
  imageBase64: string,
  prompt: string = VISION_PROMPT,
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
        images: [toBareBase64(imageBase64)],
        stream: false,
        options: { temperature: 0.1 },
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
