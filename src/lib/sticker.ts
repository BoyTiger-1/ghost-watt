// Room stickers: the audit, stuck to the door.
//
// A sheet of stickers, one per scanned room, each with what that room wastes
// after hours and a QR code. Scanning the code opens a "leaving this room?"
// checklist on any phone - no app, no account, and no server lookup, because the
// room's figures travel inside the link itself, after the # so they never reach
// a server log. Whoever printed the sheet holds the scan; the sticker holds just
// enough of it to act on.

import type { SavedAudit } from "./storage";

export interface StickerDevice {
  label: string;
  count: number;
  state: "on" | "standby" | "off";
  /** After-hours waste, dollars a year. */
  cost: number;
  fix: string;
}

export interface RoomSticker {
  room: string;
  building: string;
  /** After-hours waste for the whole room, dollars a year. */
  waste: number;
  devices: StickerDevice[];
  /** ISO date of the scan. */
  date: string;
}

/** Enough for a checklist, small enough for a QR a phone reads from a metre away. */
const MAX_DEVICES = 5;

/** YYYY-MM-DD in the printer's own time zone, not UTC: an evening scan is still today. */
function localDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The latest scan of each room in a building, worst room first. */
export function roomStickers(audits: SavedAudit[], buildingId: string, buildingName: string): RoomSticker[] {
  const latest = new Map<string, SavedAudit>();
  for (const a of audits) {
    if (a.buildingId !== buildingId) continue;
    const room = (a.areas[0] ?? "").trim();
    if (!room) continue;
    const k = room.toLowerCase();
    const prev = latest.get(k);
    if (!prev || prev.at < a.at) latest.set(k, a);
  }
  return [...latest.values()]
    .map((a) => {
      const counted = a.offenders.filter((o) => !o.unverified && o.costPerYear > 0);
      return {
        room: a.areas[0].trim(),
        building: buildingName,
        waste: Math.round(counted.reduce((s, o) => s + o.costPerYear, 0)),
        devices: [...counted]
          .sort((x, y) => y.costPerYear - x.costPerYear)
          .slice(0, MAX_DEVICES)
          .map((o) => ({ label: o.label, count: o.count, state: o.state, cost: Math.round(o.costPerYear), fix: o.action.label })),
        date: localDate(a.at),
      };
    })
    .filter((s) => s.devices.length > 0)
    .sort((a, b) => b.waste - a.waste);
}

// ---- in the link --------------------------------------------------------------

type Packed = [1, string, string, number, string, [string, number, number, number, string][]];
const STATES: StickerDevice["state"][] = ["on", "standby", "off"];

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export function encodeSticker(s: RoomSticker): string {
  const packed: Packed = [
    1,
    s.room.slice(0, 40),
    s.building.slice(0, 40),
    s.waste,
    s.date,
    s.devices.slice(0, MAX_DEVICES).map((d) => [d.label.slice(0, 40), d.count, STATES.indexOf(d.state), d.cost, d.fix.slice(0, 60)]),
  ];
  return b64url(new TextEncoder().encode(JSON.stringify(packed)));
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max) : "");
const num = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : 0;
};

/** Read a sticker link. Anyone can craft one, so every field is clamped. */
export function decodeSticker(code: string): RoomSticker | null {
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64url(code))) as unknown[];
    if (!Array.isArray(p) || p[0] !== 1 || !Array.isArray(p[5])) return null;
    const devices = (p[5] as unknown[][]).slice(0, MAX_DEVICES).map((d) => ({
      label: text(d[0], 40) || "Device",
      count: Math.max(1, num(d[1], 2000)),
      state: STATES[num(d[2], 2)] ?? "on",
      cost: num(d[3], 250000),
      fix: text(d[4], 60),
    }));
    const room = text(p[1], 40);
    if (!room) return null;
    return { room, building: text(p[2], 40), waste: num(p[3], 1_000_000), date: text(p[4], 10), devices };
  } catch {
    return null;
  }
}

export function stickerUrl(origin: string, s: RoomSticker): string {
  return `${origin}/room#${encodeSticker(s)}`;
}
