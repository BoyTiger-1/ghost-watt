import { NextResponse } from "next/server";
import { probeVision } from "@/lib/vision";

export const runtime = "nodejs";

export async function GET() {
  const status = await probeVision();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
