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

import { describeImage as describeViaOllama, probeOllama, VISION_PROMPT, VISION_MODEL } from "./ollama";

export type VisionKind = "local" | "hosted" | "none";

export interface VisionResult {
  ok: boolean;
  text: string;
  /** Model that actually answered, for the "engine" line in the report. */
  model: string;
  provider: string;
  kind: VisionKind;
  error?: string;
}

interface HostedProvider {
  id: string;
  label: string;
  env: string;
  /** Default model, overridable with <ENV>_MODEL. */
  model: string;
  signup: string;
  note: string;
  call: (image: DecodedImage, key: string, model: string) => Promise<string>;
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
async function callAnthropic(img: DecodedImage, key: string, model: string): Promise<string> {
  const json = (await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2023-06-01" },
    {
      model,
      max_tokens: 700,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: img.mediaType, data: img.base64 },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    },
  )) as { content?: { type?: string; text?: string }[] };

  return (json.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
}

function openAiCompatible(endpoint: string) {
  return async (img: DecodedImage, key: string, model: string): Promise<string> => {
    const json = (await postJson(
      endpoint,
      { Authorization: `Bearer ${key}` },
      {
        model,
        max_tokens: 700,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              { type: "image_url", image_url: { url: img.dataUrl } },
            ],
          },
        ],
      },
    )) as { choices?: { message?: { content?: string } }[] };

    return (json.choices?.[0]?.message?.content ?? "").trim();
  };
}

const HOSTED: HostedProvider[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    env: "ANTHROPIC_API_KEY",
    model: "claude-haiku-4-5-20251001",
    signup: "https://console.anthropic.com/settings/keys",
    note: "Best device recognition of the four, and cheap at Haiku size. Recommended.",
    call: callAnthropic,
  },
  {
    id: "groq",
    label: "Groq",
    env: "GROQ_API_KEY",
    // Groq's vision line-up churns. Llama-4-Scout was retired; Qwen3.6 is the
    // current image-capable model and Groq prices its image tokens at zero.
    // If this 404s, GET /openai/v1/models and pick one whose input_modalities
    // include "image", or set GROQ_API_KEY_MODEL to override without a deploy.
    model: "qwen/qwen3.6-27b",
    signup: "https://console.groq.com/keys",
    note: "Free tier, and by far the fastest to answer. Images cost nothing.",
    call: openAiCompatible("https://api.groq.com/openai/v1/chat/completions"),
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
export async function describeImageAny(image: string): Promise<VisionResult> {
  const forced = process.env.VISION_PROVIDER?.trim().toLowerCase();
  const errors: string[] = [];

  if (forced !== "hosted" && !HOSTED.some((h) => h.id === forced)) {
    const local = await describeViaOllama(image);
    if (local.ok && local.text.trim()) {
      return { ...local, provider: "Ollama (local)", kind: "local" };
    }
    if (local.error) errors.push(`local: ${local.error}`);
  }

  const hosted = activeHosted();
  if (hosted) {
    const key = keyFor(hosted)!;
    const model = modelFor(hosted);
    try {
      const text = await callWithRetry(hosted, decodeImage(image), key, model);
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
  };
}

/**
 * One retry on a hosted call.
 *
 * Vision endpoints rate-limit hard on free tiers, and a 429 on the single
 * request a judge makes during a demo would drop the whole thing to the fallback
 * estimate. One short backoff costs a second and removes most of that risk.
 */
async function callWithRetry(
  p: HostedProvider,
  img: DecodedImage,
  key: string,
  model: string,
): Promise<string> {
  try {
    return await p.call(img, key, model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!/HTTP (429|5\d\d)/.test(msg)) throw err;
    await new Promise((r) => setTimeout(r, 1200));
    return await p.call(img, key, model);
  }
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
      activeModel: modelFor(active),
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
