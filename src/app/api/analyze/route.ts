import { NextResponse } from "next/server";
import { describeImagesAny } from "@/lib/vision";
import { buildVisionPrompt, type PromptContext } from "@/lib/ollama";
import { fallbackObservations, parseModelOutput, ROOM_TYPE_BY_ID } from "@/lib/parse";
import { rankObservations } from "@/lib/energy";
import { CATALOG_BY_ID } from "@/lib/devices";
import { sanitizeFrame } from "@/lib/boxes";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { AnalysisResult, AuditSettings } from "@/lib/types";
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
// cold start and JSON handling on top. The old value of 130 was sized for local
// Ollama (OLLAMA_TIMEOUT_MS, 120s), which cannot be reached from a cloud function
// anyway, and exceeds what Vercel's free tier permits.
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

export async function POST(req: Request) {
  let body: {
    image?: string;
    roomType?: string;
    source?: string;
    settings?: unknown;
    forceFallback?: boolean;
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
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const settings = sanitizeSettings(body.settings);
  const roomType = body.roomType && ROOM_TYPE_BY_ID[body.roomType] ? body.roomType : "unknown";
  const source = body.source?.trim() || ROOM_TYPE_BY_ID[roomType].label;

  const buildFallback = (notice: string, fallbackReason: NonNullable<AnalysisResult["fallbackReason"]>): AnalysisResult => {
    const obs = fallbackObservations(roomType);
    return {
      mode: "fallback",
      engine: `room preset · ${ROOM_TYPE_BY_ID[roomType].label}`,
      source,
      offenders: rankObservations(obs, settings, source),
      notice,
      fallbackReason,
    };
  };

  const frames = Array.isArray(body.images)
    ? body.images.filter((f): f is string => typeof f === "string" && f.startsWith("data:image/")).slice(0, 8)
    : [];
  const images = frames.length ? frames : body.image ? [body.image] : [];

  // Explicit fallback (no photo, or user asked for it).
  if (body.forceFallback || !images.length) {
    return NextResponse.json(
      buildFallback("Estimated from a typical room profile - no live model reading.", "requested"),
    );
  }

  // Everything above this line is free - local arithmetic, no outbound call. Below
  // this line costs money at a metered provider, so the ceiling belongs exactly
  // here: a request that trips it should still leave with a usable estimate.
  if (images.reduce((s, i) => s + i.length, 0) > MAX_IMAGE_CHARS) {
    return NextResponse.json(
      { error: "That image is too large. Photos are downscaled before upload; this one was not." },
      { status: 413 },
    );
  }

  const verdict = await checkLimits([
    { key: "analyze:" + clientIp(req), rule: RULES.analyzeIp, scope: "ip" },
    { key: "analyze:global", rule: RULES.analyzeGlobal, scope: "global" },
  ]);

  if (!verdict.ok) {
    // Degrade rather than reject. A student who hits the ceiling mid-class still
    // gets a real estimate and a true sentence about why it is not a model reading,
    // which is the same contract every other failure path in this handler honours.
    const why =
      verdict.scope === "global"
        ? "This deployment has reached its daily limit for live model readings."
        : "This network has run a lot of scans in the last few minutes.";
    return NextResponse.json(
      buildFallback(
        why +
          " Showing a room-profile estimate instead - live readings resume in about " +
          Math.ceil(verdict.resetSeconds / 60) +
          " min.",
        "limited",
      ),
      { headers: rateHeaders(verdict, RULES.analyzeIp.limit) },
    );
  }

  // Live path: whichever vision engine is available does perception, and only
  // perception. Every number below comes out of the deterministic pipeline.
  // Video frames carry no boxes, so they are not padded and have no frame.
  const video = images.length > 1;
  const frame = video ? undefined : sanitizeFrame(body.frame);
  const prompt = buildVisionPrompt(frame, { ...sanitizeContext(body.context), kind: video ? "video" : "photo", frames: images.length });
  const vision = await describeImagesAny(images, prompt);

  if (!vision.ok) {
    return NextResponse.json(
      buildFallback(`No vision engine available (${vision.error}). Showing a room-profile estimate instead.`, "unavailable"),
    );
  }

  // A box from a multi-frame reply has no single photo to land on.
  const observations = parseModelOutput(vision.text, frame).map((o) => (video ? { ...o, boxes: undefined } : o));

  if (observations.length === 0) {
    return NextResponse.json(
      buildFallback("The model didn't recognise any catalogued devices in this photo. Showing a room-profile estimate.", "nothing-found"),
    );
  }

  const result: AnalysisResult = {
    mode: "live",
    engine: `${vision.provider} · ${vision.model}`,
    source,
    offenders: rankObservations(observations, settings, source),
    observations,
    raw: vision.text,
  };
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
