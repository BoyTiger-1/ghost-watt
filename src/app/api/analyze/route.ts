import { NextResponse } from "next/server";
import { describeImagesAny } from "@/lib/vision";
import { buildVisionPrompt, type PromptContext } from "@/lib/ollama";
import { parseModelOutput } from "@/lib/parse";
import { rankObservations } from "@/lib/energy";
import { CATALOG_BY_ID } from "@/lib/devices";
import { sanitizeFrame } from "@/lib/boxes";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { AnalysisResult, AnalyzeError, AuditSettings } from "@/lib/types";
import {
  MAX_IMAGE_CHARS,
  RULES,
  checkLimits,
  clientIp,
  rateHeaders,
} from "@/lib/ratelimit";

export const runtime = "nodejs";
// Sized for the hosted vision path, which is the only one that can run on a
// serverless deployment: VISION_TIMEOUT_MS defaults to 45s, and 60 leaves room for
// cold start and JSON handling on top.
export const maxDuration = 60;

function sanitizeSettings(input: unknown): AuditSettings {
  const s = (input ?? {}) as Partial<AuditSettings>;
  const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    ratePerKwh: clamp(s.ratePerKwh, 0.01, 2, DEFAULT_SETTINGS.ratePerKwh),
    co2PerKwh: clamp(s.co2PerKwh, 0, 2, DEFAULT_SETTINGS.co2PerKwh),
    unoccupiedHoursPerYear: clamp(s.unoccupiedHoursPerYear, 100, 8760, DEFAULT_SETTINGS.unoccupiedHoursPerYear),
  };
}

/** Short strings only: this text goes into a prompt. */
function sanitizeContext(input: unknown): PromptContext {
  const c = (input ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const hints = Array.isArray(c.hints)
    ? c.hints.map((h) => text(h, 80)).filter((h): h is string => !!h).slice(0, 6)
    : undefined;
  return { when: text(c.when, 100), place: text(c.place, 80), note: text(c.note, 200), hints };
}

function fail(status: number, body: AnalyzeError, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Read a picture with the vision model.
 *
 * Every failure is an error with a plain sentence and a code. There is no
 * "typical room" answer to fall back to: a number that did not come from this
 * picture is not a reading, and the client decides what to do with a failure
 * (show it, or offer the on-device detector's own reading).
 */
export async function POST(req: Request) {
  let body: {
    image?: string;
    source?: string;
    settings?: unknown;
    /** How much of the 1000 x 1000 analysis square is photo. See lib/boxes.ts. */
    frame?: unknown;
    /** Keyframes of one video walkthrough, analysed together and counted once. */
    images?: unknown;
    /** What the client knows about the capture: time, place, a note, on-device hints. */
    context?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return fail(400, { error: "Invalid JSON body.", code: "bad-request" });
  }

  const settings = sanitizeSettings(body.settings);
  const source = body.source?.trim() || "Scan";

  const frames = Array.isArray(body.images)
    ? body.images.filter((f): f is string => typeof f === "string" && f.startsWith("data:image/")).slice(0, 8)
    : [];
  const images = frames.length ? frames : body.image ? [body.image] : [];

  if (!images.length) {
    return fail(400, { error: "No picture was sent.", code: "bad-request" });
  }

  // Everything above this line is free. Below it costs money at a metered
  // provider, so the ceilings belong exactly here.
  if (images.reduce((s, i) => s + i.length, 0) > MAX_IMAGE_CHARS) {
    return fail(413, { error: "That picture is too large to send. Photos are downscaled before upload; this one was not.", code: "too-large" });
  }

  const verdict = await checkLimits([
    { key: "analyze:" + clientIp(req), rule: RULES.analyzeIp, scope: "ip" },
    { key: "analyze:global", rule: RULES.analyzeGlobal, scope: "global" },
  ]);

  if (!verdict.ok) {
    const minutes = Math.max(1, Math.ceil(verdict.resetSeconds / 60));
    return fail(
      429,
      {
        error:
          verdict.scope === "global"
            ? `This deployment has reached its daily limit for cloud readings. It resets in about ${minutes} min.`
            : `This network has run a lot of scans in the last few minutes. Try again in about ${minutes} min.`,
        code: "rate-limited",
        retryAfterSeconds: verdict.resetSeconds,
      },
      rateHeaders(verdict, RULES.analyzeIp.limit),
    );
  }

  // Video frames carry no boxes, so they are not padded and have no frame.
  const video = images.length > 1;
  const frame = video ? undefined : sanitizeFrame(body.frame);
  const prompt = buildVisionPrompt(frame, { ...sanitizeContext(body.context), kind: video ? "video" : "photo", frames: images.length });
  const vision = await describeImagesAny(images, prompt);

  if (!vision.ok) {
    const configured = Boolean(vision.configured);
    return fail(503, {
      error: configured
        ? `The vision model did not answer (${vision.error}).`
        : "No cloud vision model is configured on this deployment, so pictures can only be read on the device.",
      code: configured ? "engine-failed" : "no-engine",
    });
  }

  // A box from a multi-frame reply has no single photo to land on.
  const observations = parseModelOutput(vision.text, frame).map((o) => (video ? { ...o, boxes: undefined } : o));

  const result: AnalysisResult = {
    mode: "enhanced",
    engine: `${vision.provider} · ${vision.model}`,
    source,
    offenders: rankObservations(observations, settings, source),
    observations,
    raw: vision.text,
  };
  if (observations.length === 0) {
    result.notice = "The model recognised no powered devices in this picture.";
  }
  const sightings = observations
    .filter((o) => o.state === "off" && o.boxes?.length)
    .map((o) => ({
      label: CATALOG_BY_ID[o.categoryId]?.label ?? o.device,
      count: o.count,
      state: o.state,
      boxes: o.boxes!,
    }));
  if (sightings.length) result.sightings = sightings;
  return NextResponse.json(result);
}
