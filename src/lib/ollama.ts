// Minimal local Ollama client. No SDK, no API key - just a fetch to the local
// daemon. Vision model does perception only; energy math lives in energy.ts.

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
export const VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? "moondream";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000);

export const VISION_PROMPT = `You are auditing a photo of a room in a school, taken after hours or when the room is empty. Your job is to spot electrical devices and appliances that appear to be left running or drawing power.

List every electrical device or appliance you can see. For each, note whether it appears ON, in STANDBY (a small light or clock but not in active use), or OFF. Be specific and use these names where they fit: computer monitor, desktop computer, laptop, projector, smartboard, TV, overhead lights, vending machine, refrigerator, water cooler, printer, copier, server rack, window AC unit, space heater, coffee maker, microwave. If you can count how many of something there are, give the number.

Respond ONLY with a JSON array, no other text. Example:
[{"device":"computer monitor","count":12,"state":"on"},{"device":"overhead lights","count":6,"state":"on"},{"device":"projector","count":1,"state":"standby"}]`;

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

export async function describeImage(imageBase64: string): Promise<OllamaVisionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: VISION_MODEL,
        prompt: VISION_PROMPT,
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
