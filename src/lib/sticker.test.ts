// A sticker's link is read by whoever scans it, so decoding must survive
// anything; building one must pick the right scan of each room.

import { describe, expect, it } from "vitest";
import { decodeSticker, encodeSticker, roomStickers, stickerUrl, type RoomSticker } from "./sticker";
import type { SavedAudit } from "./storage";
import type { Offender } from "./types";

const room: RoomSticker = {
  room: "Room 214",
  building: "Lincoln Middle",
  waste: 1017,
  date: "2026-10-19",
  devices: [
    { label: "Computer monitor", count: 30, state: "on", cost: 796, fix: "Smart power strips" },
    { label: "Projector", count: 1, state: "standby", cost: 221, fix: "Auto-off timer" },
  ],
};

const off = (p: Partial<Offender>): Offender =>
  ({ id: "x", categoryId: "monitor", label: "Monitor", icon: "monitor", count: 1, state: "on", perUnitWatts: 30, totalWatts: 30, kwhPerYear: 200, costPerYear: 26, co2KgPerYear: 70, costLowPerYear: 20, costHighPerYear: 30, group: "display", action: { label: "Strip", type: "policy", cost: 0, savingsFraction: 0.5, note: "" }, fixCost: 0, annualSavings: 13, paybackMonths: null, confidence: "high", source: "x", ...p }) as Offender;

const audit = (id: string, area: string, at: string, offenders: Offender[], buildingId = "b1"): SavedAudit =>
  ({ id, buildingId, at, areas: [area], offenders, settings: { ratePerKwh: 0.13, co2PerKwh: 0.35, unoccupiedHoursPerYear: 6800 }, mode: "on-device", engine: "t" }) as SavedAudit;

describe("sticker links", () => {
  it("round-trips through the link", () => {
    expect(decodeSticker(encodeSticker(room))).toEqual(room);
  });

  it("puts the figures after the # so they never reach a server", () => {
    const u = stickerUrl("https://ghostwatt.app", room);
    expect(u.startsWith("https://ghostwatt.app/room#")).toBe(true);
    expect(u.length).toBeLessThan(500);
  });

  it("refuses junk and clamps hostile values", () => {
    expect(decodeSticker("not-a-code")).toBeNull();
    expect(decodeSticker("")).toBeNull();
    const evil = btoa(JSON.stringify([1, "R\u0000oom", "B", 1e12, "2026", [["X", -5, 9, 1e9, "f"]]])).replace(/=+$/, "");
    const d = decodeSticker(evil)!;
    expect(d.room).toBe("Room");
    expect(d.waste).toBe(1_000_000);
    expect(d.devices[0].count).toBe(1);
    expect(d.devices[0].cost).toBe(250000);
  });
});

describe("roomStickers", () => {
  it("uses each room's latest scan, skips other places and unverified lines, worst room first", () => {
    const s = roomStickers(
      [
        audit("a1", "Room 214", "2026-10-01T00:00:00Z", [off({ costPerYear: 999 })]),
        audit("a2", "room 214", "2026-10-10T00:00:00Z", [off({ costPerYear: 221, label: "Projector" }), off({ costPerYear: 500, unverified: true })]),
        audit("a3", "Lab 108", "2026-10-05T00:00:00Z", [off({ costPerYear: 796, count: 30 })]),
        audit("a4", "Elsewhere", "2026-10-05T00:00:00Z", [off({ costPerYear: 50 })], "b2"),
        audit("a5", "Empty room", "2026-10-05T00:00:00Z", [off({ costPerYear: 0 })]),
      ],
      "b1",
      "Lincoln",
    );
    expect(s.map((x) => x.room)).toEqual(["Lab 108", "room 214"]);
    expect(s[1].waste).toBe(221);
    expect(s[1].devices.map((d) => d.label)).toEqual(["Projector"]);
  });
});
