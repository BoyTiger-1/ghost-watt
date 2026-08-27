import { NextResponse } from "next/server";
import { keyInventory } from "@/lib/providers";

export const runtime = "nodejs";

/**
 * Which optional data providers this deployment has credentials for.
 *
 * Returns only a boolean per provider - never a key, never a prefix, never a
 * length. The settings page uses this to show what is switched on and what a
 * missing key would buy.
 */
export async function GET() {
  const keys = keyInventory();
  return NextResponse.json(
    {
      keys,
      configuredCount: keys.filter((k) => k.configured).length,
      total: keys.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
