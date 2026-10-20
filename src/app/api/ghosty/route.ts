import { NextResponse } from "next/server";
import { describeImagesAny } from "@/lib/vision";
import { GHOSTY_SCHEMA, buildPrompt, extractJson, rulesReport, validateReport, type GhostyContext } from "@/lib/ghosty";
import { RULES, checkLimits, clientIp, rateHeaders } from "@/lib/ratelimit";

export const runtime = "nodejs";

const LANGUAGES = new Set(["English", "Spanish", "Chinese (Simplified)", "Tagalog", "Vietnamese", "French", "Korean", "Portuguese", "Hindi"]);
export const maxDuration = 60;

const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max) : "");

/** Everything from the browser is re-clamped: it goes into a prompt, and the totals bound what Ghosty may claim. */
function sanitize(raw: unknown): GhostyContext | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const t = (c.totals ?? {}) as Record<string, unknown>;
  const place = c.place === "home" || c.place === "office" ? c.place : "school";
  const devices = (Array.isArray(c.devices) ? c.devices : []).slice(0, 14).map((x) => {
    const d = (x ?? {}) as Record<string, unknown>;
    return {
      label: str(d.label, 60),
      count: Math.round(num(d.count, 0, 2000)),
      state: str(d.state, 10),
      room: str(d.room, 60),
      wattsEach: num(d.wattsEach, 0, 20000),
      wastePerYear: num(d.wastePerYear, 0, 250000),
      fix: str(d.fix, 120),
      fixCost: num(d.fixCost, 0, 100000),
      savingsPerYear: num(d.savingsPerYear, 0, 250000),
      paybackMonths: d.paybackMonths === null ? null : num(d.paybackMonths, 0, 1200),
      confidence: str(d.confidence, 10),
    };
  });
  const moves = (Array.isArray(c.moves) ? c.moves : []).slice(0, 10).map((x) => {
    const m = (x ?? {}) as Record<string, unknown>;
    return {
      title: str(m.title, 120),
      device: str(m.device, 60),
      room: str(m.room, 60),
      cost: num(m.cost, 0, 100000),
      savingsPerYear: num(m.savingsPerYear, 0, 250000),
      paybackMonths: m.paybackMonths === null ? null : num(m.paybackMonths, 0, 1200),
    };
  });
  return {
    place,
    buildingName: str(c.buildingName, 60) || "this place",
    ratePerKwh: num(c.ratePerKwh, 0, 2),
    emptyHoursPerYear: num(c.emptyHoursPerYear, 0, 8760),
    rooms: (Array.isArray(c.rooms) ? c.rooms : []).map((r) => str(r, 60)).filter(Boolean).slice(0, 20),
    totals: {
      annual: num(t.annual, 0, 5_000_000),
      wasted: num(t.wasted, 0, 5_000_000),
      recoverable: num(t.recoverable, 0, 5_000_000),
      co2Kg: num(t.co2Kg, 0, 50_000_000),
    },
    devices,
    moves,
  };
}

/**
 * POST /api/ghosty - insights on one scan's computed figures, and answers to
 * questions about them. No picture is ever sent here or onward.
 *
 * Always answers: when no model is configured, rate-limited or failing, the
 * built-in rules write the card instead and it is marked as such.
 */
export async function POST(req: Request) {
  let body: { context?: unknown; question?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const ctx = sanitize(body.context);
  if (!ctx) return NextResponse.json({ error: "No scan to read." }, { status: 400 });
  const question = str(body.question, 300) || undefined;
  // Only a language the app offers, by its English name, goes into the prompt.
  const language = typeof body.language === "string" && LANGUAGES.has(body.language) ? body.language : undefined;

  const verdict = await checkLimits([
    { key: "ghosty:" + clientIp(req), rule: RULES.ghostyIp, scope: "ip" },
    { key: "ghosty:global", rule: RULES.ghostyGlobal, scope: "global" },
  ]);
  if (!verdict.ok) {
    return NextResponse.json(
      { report: rulesReport(ctx, question), note: "Ghosty is busy, so these come from the built-in rules." },
      { headers: rateHeaders(verdict, RULES.ghostyIp.limit) },
    );
  }

  const res = await describeImagesAny([], buildPrompt(ctx, question, language), GHOSTY_SCHEMA, { skipLocal: true });
  const report = res.ok ? validateReport(extractJson(res.text), ctx, res.model) : null;
  if (report) {
    // A question the model skipped still gets an answer rather than a blank.
    if (question && !report.answer) report.answer = rulesReport(ctx, question).answer;
    return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { report: rulesReport(ctx, question), note: res.configured === false ? "No AI provider is set on this site." : "The AI didn't answer, so these come from the built-in rules." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
