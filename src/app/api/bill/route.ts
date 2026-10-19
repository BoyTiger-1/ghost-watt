import { NextResponse } from "next/server";
import { describeImagesAny } from "@/lib/vision";
import { BILL_PROMPT, BILL_SCHEMA, readBillReply } from "@/lib/bill";
import type { AnalyzeError } from "@/lib/types";
import { MAX_IMAGE_CHARS, RULES, checkLimits, clientIp, rateHeaders } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Read a photo of an electricity bill with the vision model.
 *
 * Same engine, same limits and same honesty as /api/analyze: the figures come
 * back with the model's confidence and a list of things to check, and the
 * client makes the person confirm them before anything is saved.
 */
export async function POST(req: Request) {
  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "bad-request" } satisfies AnalyzeError, { status: 400 });
  }
  const image = typeof body.image === "string" && body.image.startsWith("data:image/") ? body.image : null;
  if (!image) return NextResponse.json({ error: "No picture was sent.", code: "bad-request" } satisfies AnalyzeError, { status: 400 });
  if (image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "That picture is too large to send.", code: "too-large" } satisfies AnalyzeError, { status: 413 });

  const verdict = await checkLimits([
    { key: "analyze:" + clientIp(req), rule: RULES.analyzeIp, scope: "ip" },
    { key: "analyze:global", rule: RULES.analyzeGlobal, scope: "global" },
  ]);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many scans from this network right now. Try again in a few minutes.", code: "rate-limited", retryAfterSeconds: verdict.resetSeconds } satisfies AnalyzeError,
      { status: 429, headers: rateHeaders(verdict, RULES.analyzeIp.limit) },
    );
  }

  const vision = await describeImagesAny([image], BILL_PROMPT, BILL_SCHEMA);
  if (!vision.ok) {
    return NextResponse.json(
      {
        error: vision.configured ? `The vision model did not answer (${vision.error}).` : "No cloud vision model is configured, so bills can only be typed in.",
        code: vision.configured ? "engine-failed" : "no-engine",
      } satisfies AnalyzeError,
      { status: 503 },
    );
  }
  return NextResponse.json({ ...readBillReply(vision.text), engine: `${vision.provider} · ${vision.model}` });
}
