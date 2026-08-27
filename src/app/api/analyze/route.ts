import { NextResponse } from "next/server";
import { describeImageAny } from "@/lib/vision";
import { fallbackObservations, parseModelOutput, ROOM_TYPE_BY_ID } from "@/lib/parse";
import { rankObservations } from "@/lib/energy";
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

export async function POST(req: Request) {
  let body: {
    image?: string;
    roomType?: string;
    source?: string;
    settings?: unknown;
    forceFallback?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const settings = sanitizeSettings(body.settings);
  const roomType = body.roomType && ROOM_TYPE_BY_ID[body.roomType] ? body.roomType : "unknown";
  const source = body.source?.trim() || ROOM_TYPE_BY_ID[roomType].label;

  const buildFallback = (notice: string): AnalysisResult => {
    const obs = fallbackObservations(roomType);
    return {
      mode: "fallback",
      engine: `room preset · ${ROOM_TYPE_BY_ID[roomType].label}`,
      source,
      offenders: rankObservations(obs, settings, source),
      notice,
    };
  };

  // Explicit fallback (no photo, or user asked for it).
  if (body.forceFallback || !body.image) {
    return NextResponse.json(
      buildFallback("Estimated from a typical room profile - no live model reading."),
    );
  }

  // Everything above this line is free - local arithmetic, no outbound call. Below
  // this line costs money at a metered provider, so the ceiling belongs exactly
  // here: a request that trips it should still leave with a usable estimate.
  if (body.image.length > MAX_IMAGE_CHARS) {
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
      ),
      { headers: rateHeaders(verdict, RULES.analyzeIp.limit) },
    );
  }

  // Live path: whichever vision engine is available does perception, and only
  // perception. Every number below comes out of the deterministic pipeline.
  const vision = await describeImageAny(body.image);

  if (!vision.ok) {
    return NextResponse.json(
      buildFallback(`No vision engine available (${vision.error}). Showing a room-profile estimate instead.`),
    );
  }

  const observations = parseModelOutput(vision.text);

  if (observations.length === 0) {
    return NextResponse.json(
      buildFallback("The model didn't recognise any catalogued devices in this photo. Showing a room-profile estimate."),
    );
  }

  const result: AnalysisResult = {
    mode: "live",
    engine: `${vision.provider} · ${vision.model}`,
    source,
    offenders: rankObservations(observations, settings, source),
    raw: vision.text,
  };
  return NextResponse.json(result);
}
