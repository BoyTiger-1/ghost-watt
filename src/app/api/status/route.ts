import { NextResponse } from "next/server";
import { probeOllama } from "@/lib/ollama";

export const runtime = "nodejs";

export async function GET() {
  const status = await probeOllama();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
