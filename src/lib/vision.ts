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
//   2. Every hosted model with a key on the server, in the order listed below
//
// Step 2 is what lets a visitor scan a real photo without installing anything or
// signing up for anything - the deployment holds the keys, and everybody uses
// them. There is no third step: when nothing answers, the request fails with a
// clear reason and the browser offers its own on-device reading instead. Nothing
// is ever invented.
//
// One hosted key is enough; more than one makes each a fallback for the last.

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
  /** Models to try, in order, when the default is retired or refuses the request. */
  fallbacks?: string[];
  /** The most images one request may carry. A video's frames are thinned to fit. */
  maxImages?: number;
  /**
   * How the JSON shape is asked for. "schema": response_format json_schema
   * (falls back to json_object on a 400). "none": the prompt alone, as the
   * original build did for Groq - its Qwen vision model answered best that way,
   * and a schema it does not support costs a rejected request per scan.
   */
  jsonMode?: "schema" | "none";
}

// Box coordinates roughly triple the length of a reply: a full lab at 8 boxes a
// type is 1000+ tokens. 700 used to cut the JSON off mid-array, and a truncated
// array parses as nothing, so the whole scan fell through to the estimate.
// Qwen 3.x on Groq can think before it answers, and thinking counts against the
// limit: at 1500 a busy room's reply was sometimes cut off mid-array.
const MAX_TOKENS = 2500;
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

/** A hosted deployment has no Ollama on localhost; trying costs a refused connection, or a hang if a host is misconfigured. */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.RENDER);
}

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

function openAiCompatible(endpoint: string, jsonMode: "schema" | "none" = "schema") {
  return async (imgs: DecodedImage[], key: string, model: string, prompt: string, schema: object): Promise<string> => {
    const body = (strict: boolean) => ({
      model,
      max_tokens: imgs.length > 1 ? MAX_TOKENS_LARGE : MAX_TOKENS,
      temperature: 0,
      ...(jsonMode === "none"
        ? {}
        : strict
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
    return stripReasoning(json.choices?.[0]?.message?.content ?? "");
  };
}

/** Reasoning models (Qwen 3, DeepSeek) may wrap thoughts in <think> tags before the JSON. */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "").trim();
}

const HOSTED: HostedProvider[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    env: "ANTHROPIC_API_KEY",
    model: "claude-haiku-5-5",
    fallbacks: ["claude-sonnet-5-5", "claude-haiku-4-5"],
    maxImages: 20,
    signup: "https://console.anthropic.com/settings/keys",
    note: "Best device recognition of the four, and cheap at Haiku size. Recommended.",
    call: callAnthropic,
  },
  {
    id: "google",
    label: "Google Gemini",
    env: "GEMINI_API_KEY",
    model: "gemini-2.5-flash",
    fallbacks: ["gemini-2.5-flash-lite", "gemini-2.0-flash"],
    maxImages: 16,
    signup: "https://aistudio.google.com/apikey",
    note: "Free tier with a generous daily quota, and very good at reading rooms. The best free option.",
    call: openAiCompatible("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
  },
  {
    id: "groq",
    label: "Groq",
    env: "GROQ_API_KEY",
    // Groq's vision line-up churns: Llama 4 Scout was retired, then Qwen 3.6.
    // Qwen 3.8 is the one answering in production (it is what the live site
    // reports). A retired default no longer breaks anything: on model_not_found
    // the call asks Groq for a model whose input_modalities include "image" and
    // retries with that. GROQ_API_KEY_MODEL still overrides. Qwen takes at most
    // 3 images a request, so a video's frames are thinned to fit.
    model: "qwen/qwen3.8-27b",
    maxImages: 3,
    jsonMode: "none",
    signup: "https://console.groq.com/keys",
    note: "Free tier, and by far the fastest to answer. Images cost nothing.",
    call: openAiCompatible("https://api.groq.com/openai/v1/chat/completions", "none"),
    modelsUrl: "https://api.groq.com/openai/v1/models",
  },
  {
    id: "mistral",
    label: "Mistral",
    env: "MISTRAL_API_KEY",
    model: "mistral-small-latest",
    fallbacks: ["pixtral-12b-latest", "pixtral-large-latest"],
    maxImages: 8,
    signup: "https://console.mistral.ai/api-keys",
    note: "Free experiment tier (rate-limited). Mistral Small reads images.",
    call: openAiCompatible("https://api.mistral.ai/v1/chat/completions"),
  },
  {
    id: "openai",
    label: "OpenAI",
    env: "OPENAI_API_KEY",
    model: "gpt-4o-mini",
    fallbacks: ["gpt-4.1-mini", "gpt-4o"],
    maxImages: 10,
    signup: "https://platform.openai.com/api-keys",
    note: "Solid and widely available. Paid only.",
    call: openAiCompatible("https://api.openai.com/v1/chat/completions"),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    env: "OPENROUTER_API_KEY",
    model: "google/gemini-2.5-flash",
    fallbacks: ["google/gemini-2.0-flash-001", "qwen/qwen2.5-vl-72b-instruct", "meta-llama/llama-4-scout", "google/gemini-2.0-flash-exp:free", "qwen/qwen2.5-vl-72b-instruct:free"],
    maxImages: 10,
    signup: "https://openrouter.ai/keys",
    note: "One key, many models, several of them free (the ':free' ids). Useful as a last fallback.",
    call: openAiCompatible("https://openrouter.ai/api/v1/chat/completions"),
    modelsUrl: "https://openrouter.ai/api/v1/models",
  },
];

/** Every hosted provider with a key, in the order they are tried. VISION_PROVIDER pins one. */
function configuredHosted(): HostedProvider[] {
  const forced = process.env.VISION_PROVIDER?.trim().toLowerCase();
  if (forced && HOSTED.some((h) => h.id === forced)) {
    const p = HOSTED.find((h) => h.id === forced)!;
    return keyFor(p) ? [p] : [];
  }
  return HOSTED.filter((p) => keyFor(p));
}

/** Pick `n` frames spread evenly through a video's keyframes. */
export function thinImages<T>(images: T[], n: number): T[] {
  if (images.length <= n) return images;
  if (n <= 1) return [images[0]];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(images[Math.round((i * (images.length - 1)) / (n - 1))]);
  return out;
}

function keyFor(p: HostedProvider): string | undefined {
  const v = process.env[p.env];
  return v && v.trim() ? v.trim() : undefined;
}

function modelFor(p: HostedProvider): string {
  return process.env[`${p.env}_MODEL`]?.trim() || p.model;
}

/** The hosted provider a scan starts with, if any. */
function activeHosted(): HostedProvider | null {
  return configuredHosted()[0] ?? null;
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

  const localWorthTrying = forced === "ollama" || forced === "local" || !isServerless() || Boolean(process.env.OLLAMA_HOST?.trim());
  if (forced !== "hosted" && !HOSTED.some((h) => h.id === forced) && localWorthTrying) {
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

  // Every configured hosted provider is a fallback for the one before it: one
  // retired model or one rate limit must not end a demo. Within a provider the
  // retired-model path tries its listed fallbacks, then whatever the provider's
  // own model list says accepts images.
  const providers = configuredHosted();
  // A serverless function has about 60 s in all. Each provider gets a share of
  // it, so one that hangs cannot take the whole request down with it: the next
  // provider still gets its turn.
  const budgetMs = Math.max(8000, Math.min(TIMEOUT_MS, Math.floor(50000 / Math.max(1, providers.length))));
  for (const hosted of providers) {
    const key = keyFor(hosted)!;
    const img = thinImages(images.map(decodeImage), hosted.maxImages ?? 10);
    const tried = new Set<string>();
    const candidates = [effectiveModel(hosted), ...(hosted.fallbacks ?? [])];
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      if (tried.has(model)) continue;
      tried.add(model);
      try {
        const text = await callWithRetry(hosted, img, key, model, prompt, schema, budgetMs);
        if (text) {
          if (i > 0) discovered.set(hosted.id, model);
          return { ok: true, text, model, provider: `${hosted.label} (hosted)`, kind: "hosted" };
        }
        errors.push(`${hosted.label}: empty reply from ${model}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        errors.push(`${hosted.label} (${model}): ${shortError(msg)}`);
        // Only a model that no longer exists is worth trying the next model for;
        // an auth failure or a rate limit means move on to the next provider.
        if (!isRetiredModel(err)) break;
        if (i === candidates.length - 1) {
          const found = await discoverImageModel(hosted, key, model);
          if (found && !tried.has(found)) candidates.push(found);
        }
      }
    }
  }
  if (!providers.length) errors.push("no hosted vision key is configured on this deployment");

  return {
    ok: false,
    text: "",
    model: VISION_MODEL,
    provider: "none",
    kind: "none",
    error: errors.join("; "),
    configured: providers.length > 0 || localConfigured,
  };
}

/** The useful part of a provider's error, without the JSON envelope. */
function shortError(msg: string): string {
  const m = /"message"\s*:\s*"([^"]{1,160})"/.exec(msg);
  if (m) return m[1];
  return msg.replace(/\s+/g, " ").slice(0, 160);
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
  budgetMs = TIMEOUT_MS,
): Promise<string> {
  const started = Date.now();
  try {
    return await withBudget(p.call(img, key, model, prompt, schema), budgetMs, p.label);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!/HTTP (429|5\d\d)/.test(msg)) throw err;
    const wait = retryDelayMs(msg);
    const left = budgetMs - (Date.now() - started) - wait;
    // No time left in this provider's share for a retry: let the next provider have it.
    if (left < 4000) throw err;
    await new Promise((r) => setTimeout(r, wait));
    return await withBudget(p.call(img, key, model, prompt, schema), left, p.label);
  }
}

/** Give up on a call after `ms`, leaving the underlying request to its own timeout. */
function withBudget<T>(call: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not answer within ${Math.round(ms / 1000)}s`)), ms);
    call.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
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
  return /HTTP (404|400)/.test(msg) && /model_not_found|decommissioned|does not exist|not found|no longer supported|is not a valid model|unsupported model|invalid model/i.test(msg);
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
    activeLabel: "No cloud model: on-device only",
    activeModel: "none",
    local,
    hosted,
  };
}
