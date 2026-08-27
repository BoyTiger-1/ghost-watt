import { NextResponse } from "next/server";
import {
  MAX_CONTRIBUTIONS,
  areaSummaries,
  classTotals,
  isValidCode,
  mergeContributions,
  normalizeCode,
  sanitizeContribution,
} from "@/lib/classroom";
import { readSession, updateSession, isDurable } from "@/lib/roomstore";

export const runtime = "nodejs";

const notFound = () =>
  NextResponse.json(
    {
      error:
        "No session with that code. It may have expired, or this deployment may not " +
        "have a shared store configured.",
    },
    { status: 404 },
  );

/** GET /api/class/[code] - the merged building map. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);
  if (!isValidCode(code)) {
    return NextResponse.json({ error: "That is not a valid code." }, { status: 400 });
  }

  const session = await readSession(code);
  if (!session) return notFound();

  return NextResponse.json(
    {
      code: session.code,
      buildingName: session.buildingName,
      regionCode: session.regionCode,
      createdAt: session.createdAt,
      durable: isDurable(),
      rows: mergeContributions(session.contributions),
      totals: classTotals(session.contributions),
      areas: areaSummaries(session.contributions),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST /api/class/[code] - add one person's scan of one area.
 *
 * The body carries computed offender rows only. There is no field for an image and
 * the route would ignore one: perception already happened on the contributor's own
 * device, and a photo of the inside of a school has no reason to be on a server.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);
  if (!isValidCode(code)) {
    return NextResponse.json({ error: "That is not a valid code." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const contribution = sanitizeContribution(body, crypto.randomUUID());
  if (!contribution) {
    return NextResponse.json(
      { error: "That scan had no usable device rows in it." },
      { status: 400 },
    );
  }

  let full = false;
  const updated = await updateSession(code, (s) => {
    if (s.contributions.length >= MAX_CONTRIBUTIONS) {
      full = true;
      return s;
    }
    // Re-scanning an area replaces the old reading rather than double-counting it,
    // which is what someone means when they walk the same room twice.
    const key = (c: { area: string; contributor: string }) =>
      `${c.area.trim().toLowerCase()}|${c.contributor.trim().toLowerCase()}`;
    const existing = key(contribution);
    return {
      ...s,
      contributions: [...s.contributions.filter((c) => key(c) !== existing), contribution],
    };
  });

  if (!updated) return notFound();
  if (full) {
    return NextResponse.json(
      { error: `This session already holds ${MAX_CONTRIBUTIONS} scans.` },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      area: contribution.area,
      totals: classTotals(updated.contributions),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
