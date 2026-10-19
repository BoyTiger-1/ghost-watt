// Rolling rooms up into a building.
//
// A scan is one room. A building is the latest scan of each of its rooms, added
// together - never two scans of the same room, which would count a lab twice
// because somebody re-photographed it. Everything here is plain arithmetic over
// saved scans, so the Buildings page works with no server at all.

import { counted } from "./energy";
import type { SavedAudit } from "./storage";
import type { Offender } from "./types";

export interface RoomRollup {
  /** Room name, as the capture was named. */
  room: string;
  audit: SavedAudit;
  /** Annual cost if the observed state persists through every empty hour. */
  afterHoursCost: number;
  /** Annual cost at typical use for this kind of room. */
  typicalCost: number;
  co2Kg: number;
  kwh: number;
  devices: number;
  /** Earlier scans of the same room, newest first, for the trend. */
  history: SavedAudit[];
}

export interface BuildingRollup {
  rooms: RoomRollup[];
  afterHoursCost: number;
  typicalCost: number;
  co2Kg: number;
  kwh: number;
  devices: number;
  recoverable: number;
  /** Offenders from the latest scan of every room, re-sourced to the room name. */
  offenders: Offender[];
  mode: SavedAudit["mode"];
  latestAt: string | null;
}

const roomOf = (a: SavedAudit) => (a.areas[0] ?? "Room").trim();

/** Latest scan per room name, with the earlier scans of that room as history. */
export function rollupRooms(audits: SavedAudit[]): RoomRollup[] {
  const byRoom = new Map<string, SavedAudit[]>();
  for (const a of audits) {
    const key = roomOf(a).toLowerCase();
    const list = byRoom.get(key);
    if (list) list.push(a);
    else byRoom.set(key, [a]);
  }
  const out: RoomRollup[] = [];
  for (const list of byRoom.values()) {
    list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const latest = list[0];
    const os = counted(latest.offenders);
    out.push({
      room: roomOf(latest),
      audit: latest,
      afterHoursCost: os.reduce((s, o) => s + o.costPerYear, 0),
      typicalCost: os.reduce((s, o) => s + (o.typicalCostPerYear ?? 0), 0),
      co2Kg: os.reduce((s, o) => s + o.co2KgPerYear, 0),
      kwh: os.reduce((s, o) => s + o.kwhPerYear, 0),
      devices: os.reduce((s, o) => s + o.count, 0),
      history: list.slice(1),
    });
  }
  return out.sort((a, b) => b.afterHoursCost - a.afterHoursCost);
}

export function rollupBuilding(audits: SavedAudit[]): BuildingRollup {
  const rooms = rollupRooms(audits);
  const offenders = rooms.flatMap((r) => counted(r.audit.offenders).map((o) => ({ ...o, source: r.room })));
  const modes = new Set(rooms.map((r) => r.audit.mode));
  const mode: SavedAudit["mode"] = modes.size > 1 ? "mixed" : (rooms[0]?.audit.mode ?? "on-device");
  return {
    rooms,
    afterHoursCost: rooms.reduce((s, r) => s + r.afterHoursCost, 0),
    typicalCost: rooms.reduce((s, r) => s + r.typicalCost, 0),
    co2Kg: rooms.reduce((s, r) => s + r.co2Kg, 0),
    kwh: rooms.reduce((s, r) => s + r.kwh, 0),
    devices: rooms.reduce((s, r) => s + r.devices, 0),
    recoverable: offenders.reduce((s, o) => s + o.annualSavings, 0),
    offenders,
    mode,
    latestAt: rooms.length ? rooms.map((r) => r.audit.at).sort().at(-1)! : null,
  };
}
