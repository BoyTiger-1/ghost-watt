import { NextResponse } from "next/server";
import { describeImagesAny } from "@/lib/vision";
import { extractJson } from "@/lib/ghosty";
import { MAX_IMAGE_CHARS, RULES, checkLimits, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    rooms: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The room's label as printed on the plan, e.g. '214', 'Gym', 'Library'. Empty if unlabelled." },
          box: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4, description: "[x1, y1, x2, y2], each 0-1000 as a fraction of the image width and height." },
        },
        required: ["name", "box"],
      },
    },
  },
  required: ["rooms"],
} as const;

const PROMPT = `This image is a floor plan of a building (often a fire-evacuation map). Find every enclosed room: classrooms, offices, labs, the gym, library, cafeteria, restrooms. Skip corridors, stairs and outdoor areas.

For each room give:
- "name": its label exactly as printed (a number like "214" or a word like "Library"); "" if it has none.
- "box": [x1, y1, x2, y2] for the room's rectangle, where each value is 0-1000 as a fraction of the IMAGE's width (x) and height (y). (0,0) is the top-left corner, (1000,1000) the bottom-right.

Reply with ONLY JSON: {"rooms": [{"name": "214", "box": [120, 80, 260, 210]}]}`;

/**
 * POST /api/plan-rooms {image: dataUrl}
 *
 * Suggests the rooms on a floor plan, as rectangles in the plan's own 0-1
 * coordinates. The person checks, renames, moves or deletes each one; nothing
 * is placed without them seeing it.
 */
export async function POST(req: Request) {
  let body: { image?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const image = typeof body.image === "string" && body.image.startsWith("data:image/") ? body.image : null;
  if (!image || image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "Send a floor plan image under 2 MB." }, { status: 400 });

  const verdict = await checkLimits([{ key: "plan-rooms:" + clientIp(req), rule: RULES.planRoomsIp, scope: "ip" }]);
  if (!verdict.ok) return NextResponse.json({ error: "Too many requests; try again in a few minutes." }, { status: 429 });

  const res = await describeImagesAny([image], PROMPT, SCHEMA, { skipLocal: true });
  if (!res.ok) {
    return NextResponse.json(
      { error: res.configured === false ? "No AI provider is set on this site, so rooms have to be drawn by hand." : "The AI couldn't read this plan. Draw the rooms by hand instead." },
      { status: 503 },
    );
  }
  const parsed = extractJson(res.text) as { rooms?: { name?: unknown; box?: unknown }[] } | null;
  const rooms = (parsed?.rooms ?? [])
    .map((r, i) => {
      const b = Array.isArray(r.box) ? r.box.map(Number) : [];
      if (b.length !== 4 || b.some((n) => !Number.isFinite(n))) return null;
      const [x1, y1, x2, y2] = b.map((n) => Math.max(0, Math.min(1000, n)) / 1000);
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (w < 0.01 || h < 0.01 || w > 0.95 || h > 0.95) return null;
      const name = typeof r.name === "string" ? r.name.replace(/[\u0000-\u001F]/g, "").trim().slice(0, 40) : "";
      return { id: `ai${i}`, name: name || `Room ${i + 1}`, x, y, w, h };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .slice(0, 60);
  return NextResponse.json({ rooms, model: res.model });
}
