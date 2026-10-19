// Perception, from whichever engine is actually available.
//
// The original design was local-only: Ollama on your machine, nothing leaving
// the device. That is still the best mode and still the default, but it has one
// fatal property for a project that gets judged - it cannot work for a visitor.
// A deployed build probes for a daemon on the *server*, never finds one, and
// every single visitor sees the estimated fallback. The thing the whole project
// is named for never runs.
//
// So perception is now a chain rather than a single engine:
//
//   1. Ollama on this machine       free, private, nothing uploaded
//   2. A hosted model, if a key is set on the server
//   3. The deterministic room-profile estimate
//
// Step 2 is what lets a visitor scan a real photo without installing anything or
// signing up for anything - the deployment holds one key, and everybody uses it.
// Step 3 still exists and still runs when both fail, so the app has never once
// had a path that ends in an error page.
//
// Only ONE hosted key needs to be set. Whichever is present wins, in the order
// listed in HOSTED below.

import { describeImage as describeViaOllama, probeOllama, buildVisionPrompt, VISION_MODEL, VISION_SCHEMA } from "./ollama";
import { FULL_FRAME, type Frame } from "./boxes";

export type VisionKind = "local" | "hosted" | "none";

export interface VisionResult {
  ok: boolean;
  text: string;
  /** Model that actually answered, for the "engine" line in the report. */
  model: string;
  provider: string;
  kind: VisionKind;
  error?: string;
  /**
   * On failure: whether an engine was configured at all. False means "nothing to
   * try" (no key, no local daemon); true means an engine exists and did not answer.
   */
  configured?: boolean;
}

interface HostedProvider {
  id: string;
  label: string;
  env: string;
  /** Default model, overridable with <ENV>_MODEL. */
  model: string;
  signup: string;
  note: string;
  call: (images: DecodedImage[], key: string, model: string, prompt: string, schema: object) => Promise<string>;
  /**
   * Where to list this provider's models, for recovering when the default model
   * is retired. Only set for providers whose model list says which models take
   * images; guessing from names would pick a text-only model and fail anyway.
   */
  modelsUrl?: string;
}

// Box coordinates roughly triple the length of a reply: a full lab at 8 boxes a
// type is 1000+ tokens. 700 used to cut the JSON off mid-array, and a truncated
// array parses as nothing, so the whole scan fell through to the estimate.
const MAX_TOKENS = 1500;
/** A video's frames share one reply, and current models think before answering. */
const MAX_TOKENS_LARGE = 4000;

/**
 * Claude models from generation 5 on run adaptive thinking and reject a
 * non-default temperature; older ones take temperature 0 and no effort field.
 * Effort "medium": "low" answered fast but undercounted - thirty downlights and
 * a row of monitors seen from behind take a moment's thought to tally.
 */
function anthropicTuning(model: string): Record<string, unknown> {
  return /^claude-(haiku|sonnet|opus|fable|mythos)-([5-9]|\d{2})/.test(model)
    ? { output_config: { effort: "medium" } }
    : { temperature: 0 };
}

const TIMEOUT_MS = Number(process.env.VISION_TIMEOUT_MS ?? 45000);

// ---- image handling -----------------------------------------------------

interface DecodedImage {
  /** Bare base64, no data: prefix. */
  base64: string;
  mediaType: string;
  /** Full data URL, which is what the OpenAI-shaped APIs want. */
  dataUrl: string;
}

/**
 * Accept either a bare base64 blob or a full data URL and produce both forms.
 *
 * Anthropic wants the media type as its own field and rejects a data: prefix in
 * the payload; the OpenAI-shaped APIs want the whole data URL. Guessing wrong
 * gives a 400 that reads like an auth problem, so both are derived once here.
 */
function decodeImage(image: string): DecodedImage {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(image);
  if (m) return { mediaType: m[1], base64: m[2], dataUrl: image };
  return {
    mediaType: "image/jpeg",
    base64: image,
    dataUrl: `data:image/jpeg;base64,${image}`,
  };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${detail.slice(0, 180)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---- hosted providers ---------------------------------------------------

/**
 * Anthropic and the OpenAI-compatible crowd differ only in envelope shape, so
 * there are exactly two call shapes here and three providers share the second.
 */
async function callAnthropic(
  imgs: DecodedImage[],
  key: string,
  model: string,
  prompt: string,
  schema: object,
): Promise<string> {
  // The schema is enforced as a forced tool call: the model can only answer by
  // filling in the typed fields, so there is no prose to parse and no field to
  // forget.
  const json = (await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2023-06-01" },
    {
      model,
      max_tokens: imgs.length > 1 || anthropicTuning(model).output_config ? MAX_TOKENS_LARGE : MAX_TOKENS,
      ...anthropicTuning(model),
      tools: [
        {
          name: "report",
          description: "Report what the picture shows, in the required shape.",
          input_schema: schema,
        },
      ],
      tool_choice: { type: "tool", name: "report" },
      messages: [
        {
          role: "user",
          content: [
            ...imgs.map((img) => ({
              type: "image",
              source: { type: "base64", media_type: img.mediaType, data: img.base64 },
            })),
            { type: "text", text: prompt },
          ],
        },
      ],
    },
  )) as { content?: { type?: string; text?: string; input?: unknown }[] };

  const tool = (json.content ?? []).find((c) => c.type === "tool_use" && c.input);
  if (tool) return JSON.stringify(tool.input);
  return (json.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
}

function openAiCompatible(endpoint: string) {
  return async (imgs: DecodedImage[], key: string, model: string, prompt: string, schema: object): Promise<string> => {
    const body = (strict: boolean) => ({
      model,
      max_tokens: imgs.length > 1 ? MAX_TOKENS_LARGE : MAX_TOKENS,
      temperature: 0,
      ...(strict
        ? { response_format: { type: "json_schema", json_schema: { name: "report", schema } } }
        : { response_format: { type: "json_object" } }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...imgs.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })),
          ],
        },
      ],
    });
    let json: { choices?: { message?: { content?: string } }[] };
    try {
      json = (await postJson(endpoint, { Authorization: `Bearer ${key}` }, body(true))) as typeof json;
    } catch (err) {
      // Not every model behind these endpoints takes a schema. A 400 about the
      // response format falls back to plain JSON mode; anything else is real.
      const msg = err instanceof Error ? err.message : "";
      if (!/HTTP 400/.test(msg) || !/response_format|json_schema|schema/i.test(msg)) throw err;
      json = (await postJson(endpoint, { Authorization: `Bearer ${key}` }, body(false))) as typeof json;
    }
    return (json.choices?.[0]?.message?.content ?? "").trim();
  };
}

const HOSTED: HostedProvider[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    env: "ANTHROPIC_API_KEY",
    model: "claude-haiku-5-5",
    signup: "https://console.anthropic.com/settings/keys",
    note: "Best device recognition of the four, and cheap at Haiku size. Recommended.",
    call: callAnthropic,
  },
  {
    id: "groq",
    label: "Groq",
    env: "GROQ_API_KEY",
    // Groq's vision line-up churns: Llama-4-Scout was retired, then Qwen3.6 -
    // which this default pointed at, so live scans quietly fell back to the
    // estimate until someone noticed. A retired default no longer breaks
    // anything: on model_not_found the call asks Groq for a model whose
    // input_modalities include "image" and retries with that (see
    // discoverImageModel). GROQ_API_KEY_MODEL still overrides.
    model: "qwen/qwen3.8-27b",
    signup: "https://console.groq.com/keys",
    note: "Free tier, and by far the fastest to answer. Images cost nothing.",
    call: openAiCompatible("https://api.groq.com/openai/v1/chat/completions"),
    modelsUrl: "https://api.groq.com/openai/v1/models",
  },
  {
    id: "openai",
    label: "OpenAI",
    env: "OPENAI_API_KEY",
    model: "gpt-4o-mini",
    signup: "https://platform.openai.com/api-keys",
    note: "Solid and widely available. Paid only.",
    call: openAiCompatible("https://api.openai.com/v1/chat/completions"),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    env: "OPENROUTER_API_KEY",
    model: "google/gemini-2.0-flash-001",
    signup: "https://openrouter.ai/keys",
    note: "One key, many models. Useful if you want to switch model without new credentials.",
    call: openAiCompatible("https://openrouter.ai/api/v1/chat/completions"),
  },
];

function keyFor(p: HostedProvider): string | undefined {
  const v = process.env[p.env];
  return v && v.trim() ? v.trim() : undefined;
}

function modelFor(p: HostedProvider): string {
  return process.env[`${p.env}_MODEL`]?.trim() || p.model;
}

/** The hosted provider that will actually be used, if any. */
function activeHosted(): HostedProvider | null {
  const forced = process.env.VISION_PROVIDER?.trim().toLowerCase();
  if (forced) {
    const p = HOSTED.find((h) => h.id === forced);
    return p && keyFor(p) ? p : null;
  }
  return HOSTED.find((p) => keyFor(p)) ?? null;
}

// ---- the chain ----------------------------------------------------------

/**
 * Run perception on the best engine available, falling forward on failure.
 *
 * Local first: it is free, it is private, and on a laptop with Ollama running it
 * is the mode the project is actually about. A hosted key is the safety net for
 * everyone else, not the preferred path - which is why a working local daemon is
 * never bypassed just because a key happens to be set.
 */
export async function describeImageAny(
  image: string,
  frame: Frame = FULL_FRAME,
): Promise<VisionResult> {
  return describeImagesAny([image], buildVisionPrompt(frame));
}

/** The same chain over one or more images (a video's keyframes), a prompt and the JSON shape the answer must take. */
export async function describeImagesAny(images: string[], prompt: string, schema: object = VISION_SCHEMA): Promise<VisionResult> {
  const forced = process.env.VISION_PROVIDER?.trim().toLowerCase();
  const errors: string[] = [];
  let localConfigured = false;

  if (forced !== "hosted" && !HOSTED.some((h) => h.id === forced)) {
    const local = await describeViaOllama(images, prompt, schema);
    if (local.ok && local.text.trim()) {
      return { ...local, provider: "Ollama (local)", kind: "local" };
    }
    if (local.error) {
      errors.push(`local: ${local.error}`);
      // A daemon that answered and failed is configured; a refused connection is not.
      localConfigured = !/fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(local.error);
    }
  }

  const hosted = activeHosted();
  if (hosted) {
    const key = keyFor(hosted)!;
    let model = effectiveModel(hosted);
    try {
      const img = images.map(decodeImage);
      let text: string;
      try {
        text = await callWithRetry(hosted, img, key, model, prompt, schema);
      } catch (err) {
        const replacement = isRetiredModel(err) ? await discoverImageModel(hosted, key, model) : null;
        if (!replacement) throw err;
        model = replacement;
        text = await callWithRetry(hosted, img, key, model, prompt, schema);
      }
      if (text) {
        return {
          ok: true,
          text,
          model,
          provider: `${hosted.label} (hosted)`,
          kind: "hosted",
        };
      }
      errors.push(`${hosted.id}: empty response`);
    } catch (err) {
      errors.push(`${hosted.id}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  } else {
    errors.push("no hosted vision key configured");
  }

  return {
    ok: false,
    text: "",
    model: VISION_MODEL,
    provider: "none",
    kind: "none",
    error: errors.join("; "),
    configured: Boolean(hosted) || localConfigured,
  };
}

/**
 * One retry on a hosted call, after however long the provider asked for.
 *
 * Vision endpoints rate-limit hard on free tiers, and a 429 on the single
 * request a judge makes during a demo would drop the whole thing to the fallback
 * estimate. A fixed 1.2s pause was not enough: Groq's free tier meters output
 * tokens per minute and its 429 says how long to wait ("Please try again in
 * 9.18s"), and retrying before then simply fails again. So the wait comes from
 * the error when it says, capped so the request still finishes inside the
 * function's time limit.
 */
async function callWithRetry(
  p: HostedProvider,
  img: DecodedImage[],
  key: string,
  model: string,
  prompt: string,
  schema: object,
): Promise<string> {
  try {
    return await p.call(img, key, model, prompt, schema);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!/HTTP (429|5\d\d)/.test(msg)) throw err;
    await new Promise((r) => setTimeout(r, retryDelayMs(msg)));
    return await p.call(img, key, model, prompt, schema);
  }
}

const MAX_RETRY_WAIT_MS = 12000;

/** How long a 429 body asked us to wait, or a short default. */
export function retryDelayMs(message: string): number {
  const m = /try again in (?:(\d+)m)?\s*([\d.]+)\s*(ms|s)\b/i.exec(message);
  if (!m) return 1200;
  const minutes = m[1] ? Number(m[1]) : 0;
  const n = Number(m[2]);
  const ms = (m[3].toLowerCase() === "ms" ? n : n * 1000) + minutes * 60000;
  // A little past what was asked, so the window has really reset.
  return Math.min(MAX_RETRY_WAIT_MS, Math.max(500, Math.ceil(ms) + 250));
}

/** The provider said the model does not exist, or no longer does. */
function isRetiredModel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return /HTTP (404|400)/.test(msg) && /model_not_found|decommissioned|does not exist/i.test(msg);
}

const discovered = new Map<string, string>();

/**
 * Find a model on this provider that accepts images, other than the one that
 * just failed. Cached per provider for the life of the server process, so the
 * lookup happens once after a retirement rather than on every scan.
 */
async function discoverImageModel(
  p: HostedProvider,
  key: string,
  failed: string,
): Promise<string | null> {
  if (!p.modelsUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(p.modelsUrl, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { id?: string; active?: boolean; input_modalities?: string[] }[];
    };
    const pick =
      (json.data ?? [])
        .filter((m) => m.id && m.id !== failed && m.active !== false)
        .filter((m) => (m.input_modalities ?? []).includes("image"))
        .map((m) => m.id as string)
        // Highest version number first, which is usually the newest model.
        .sort((x, y) => y.localeCompare(x, undefined, { numeric: true }))[0] ?? null;
    if (pick) discovered.set(p.id, pick);
    return pick;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Model the provider will actually be called with, including any discovery. */
function effectiveModel(p: HostedProvider): string {
  return discovered.get(p.id) ?? modelFor(p);
}

// ---- status -------------------------------------------------------------

export interface VisionStatus {
  /** Whether a real model can run at all, local or hosted. */
  ready: boolean;
  /** Which engine a scan would use right now. */
  active: VisionKind;
  activeLabel: string;
  activeModel: string;
  local: {
    reachable: boolean;
    hasModel: boolean;
    model: string;
    host: string;
    models: string[];
  };
  hosted: {
    id: string;
    label: string;
    env: string;
    model: string;
    signup: string;
    note: string;
    configured: boolean;
  }[];
}

/** What the status pill and the settings page report. Never returns a key. */
export async function probeVision(): Promise<VisionStatus> {
  const local = await probeOllama();
  const hosted = HOSTED.map((p) => ({
    id: p.id,
    label: p.label,
    env: p.env,
    model: modelFor(p),
    signup: p.signup,
    note: p.note,
    configured: Boolean(keyFor(p)),
  }));

  const localUsable = local.reachable && local.hasModel;
  const active = activeHosted();
  const forced = process.env.VISION_PROVIDER?.trim().toLowerCase();
  const preferHosted = Boolean(forced && forced !== "ollama" && forced !== "local");

  if (localUsable && !preferHosted) {
    return {
      ready: true,
      active: "local",
      activeLabel: "Ollama (local)",
      activeModel: local.model,
      local,
      hosted,
    };
  }
  if (active) {
    return {
      ready: true,
      active: "hosted",
      activeLabel: `${active.label} (hosted)`,
      activeModel: effectiveModel(active),
      local,
      hosted,
    };
  }
  return {
    ready: false,
    active: "none",
    activeLabel: "Room-profile estimate",
    activeModel: "none",
    local,
    hosted,
  };
}
