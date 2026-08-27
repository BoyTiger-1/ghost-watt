import { NextResponse } from "next/server";
import { makeCode, type ClassSession } from "@/lib/classroom";
import { readSession, writeSession, isDurable, storeTier } from "@/lib/roomstore";

export const runtime = "nodejs";

/** GET /api/class - what kind of backing store this deployment has. */
export async function GET() {
  return NextResponse.json(
    { tier: storeTier(), durable: isDurable() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST /api/class - open a session for a building.
 *
 * Returns a six-character code. No account, no email, nothing identifying: the
 * code IS the session, and it expires on its own.
 */
export async function POST(req: Request) {
  let body: { buildingName?: string; regionCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const buildingName = (body.buildingName ?? "").trim().slice(0, 60) || "Our building";
  const regionCode = (body.regionCode ?? "US").trim().toUpperCase().slice(0, 2) || "US";

  // Retry on the astronomically unlikely collision rather than overwriting
  // somebody else's live session.
  let code = makeCode();
  for (let i = 0; i < 5; i++) {
    if (!(await readSession(code))) break;
    code = makeCode();
  }

  const session: ClassSession = {
    code,
    buildingName,
    regionCode,
    createdAt: new Date().toISOString(),
    contributions: [],
  };

  const ok = await writeSession(session);
  if (!ok) {
    return NextResponse.json(
      { error: "Could not open a session. The shared store rejected the write." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { code, durable: isDurable(), tier: storeTier() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
