import { NextResponse } from "next/server";
import { describeImage } from "@/lib/ollama";
import { fallbackObservations, parseModelOutput, ROOM_TYPE_BY_ID } from "@/lib/parse";
import { rankObservations } from "@/lib/energy";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { AnalysisResult, AuditSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 130;

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

  // Live path: local vision model does perception.
  const vision = await describeImage(body.image);

  if (!vision.ok) {
    return NextResponse.json(
      buildFallback(`Local model unavailable (${vision.error}). Showing a room-profile estimate instead.`),
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
    engine: vision.model,
    source,
    offenders: rankObservations(observations, settings, source),
    raw: vision.text,
  };
  return NextResponse.json(result);
}
