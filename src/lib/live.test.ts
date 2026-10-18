import { describe, expect, it } from "vitest";
import {
  COCO_MAP,
  COOLDOWN_MAX_MS,
  COOLDOWN_MIN_MS,
  SAME_VIEW_DIFF,
  SIG_H,
  SIG_W,
  STEADY_MS,
  STILL_DIFF,
  Tracker,
  containRect,
  frameSignature,
  nearestView,
  nextCooldown,
  shouldAutoAudit,
  sigDiff,
  tallyView,
  type Detection,
} from "./live";
import type { AuditSettings } from "./types";

const settings: AuditSettings = {
  ratePerKwh: 0.15,
  co2PerKwh: 0.4,
  unoccupiedHoursPerYear: 6800,
  regionCode: "CA",
};

const det = (cls: string, x: number, y = 0, w = 100, h = 80, score = 0.8): Detection => ({
  cls,
  score,
  box: { x, y, w, h },
});

describe("Tracker", () => {
  it("hides a detection until it has been seen twice", () => {
    const t = new Tracker();
    expect(t.update([det("tv", 10)])).toHaveLength(0);
    const v = t.update([det("tv", 12)]);
    expect(v).toHaveLength(1);
    expect(v[0].id).toBe(1);
  });

  it("keeps one id while a box moves, and eases toward the new position", () => {
    const t = new Tracker();
    t.update([det("tv", 0)]);
    const [a] = t.update([det("tv", 20)]);
    expect(a.id).toBe(1);
    expect(a.box.x).toBeGreaterThan(0);
    expect(a.box.x).toBeLessThan(20);
  });

  it("keeps one track when the detector changes its mind about a label, and votes on it", () => {
    const t = new Tracker();
    t.update([det("tv", 0)]);
    t.update([det("laptop", 0)]);
    const v = t.update([det("laptop", 0)]);
    expect(v.map((x) => [x.id, x.cls])).toEqual([[1, "laptop"]]);
  });

  it("never relabels a car as a device", () => {
    const t = new Tracker();
    t.update([det("car", 0)]);
    t.update([det("tv", 0)]);
    const v = t.update([det("tv", 0), det("car", 0)]);
    expect(v.map((x) => x.cls).sort()).toEqual(["car", "tv"]);
  });

  it("holds back an easily invented appliance for an extra frame", () => {
    const t = new Tracker();
    t.update([det("refrigerator", 0)]);
    expect(t.update([det("refrigerator", 0)])).toHaveLength(0);
    expect(t.update([det("refrigerator", 0)])).toHaveLength(1);
  });

  it("gives two neighbouring screens stable, distinct ids", () => {
    const t = new Tracker();
    t.update([det("tv", 0), det("tv", 200)]);
    const v = t.update([det("tv", 205), det("tv", 3)]);
    const byX = [...v].sort((a, b) => a.box.x - b.box.x);
    expect(byX.map((x) => x.id)).toEqual([1, 2]);
  });

  it("holds a lost track for a few frames, then drops it", () => {
    const t = new Tracker({ minIou: 0.25, smoothing: 0.55, maxMissed: 3, minHits: 2 });
    t.update([det("tv", 0)]);
    t.update([det("tv", 0)]);
    for (let i = 0; i < 3; i++) expect(t.update([])).toHaveLength(1);
    expect(t.update([])).toHaveLength(0);
  });

  it("reset forgets everything", () => {
    const t = new Tracker();
    t.update([det("tv", 0)]);
    t.update([det("tv", 0)]);
    t.reset();
    expect(t.visible()).toHaveLength(0);
  });
});

describe("tallyView", () => {
  const track = (cls: string, id: number) => ({ id, cls, score: 0.9, box: { x: 0, y: 0, w: 1, h: 1 }, hits: 3, missed: 0 });

  it("counts devices per category and prices them as on", () => {
    const tally = tallyView([track("tv", 1), track("tv", 2), track("laptop", 3)], settings);
    expect(tally.byCategory).toEqual({ monitor: 2, laptop: 1 });
    expect(tally.devices).toBe(3);
    expect(tally.costPerYear).toBeGreaterThan(0);
  });

  it("does not track people at all", () => {
    expect(COCO_MAP.person).toBeUndefined();
    const tally = tallyView([track("person", 1)], settings);
    expect(tally.people).toBe(0);
    expect(tally.devices).toBe(0);
    expect(tally.costPerYear).toBe(0);
  });

  it("counts uncosted devices without inventing a price", () => {
    const tally = tallyView([track("cell phone", 1)], settings);
    expect(tally.devices).toBe(1);
    expect(tally.costPerYear).toBe(0);
  });

  it("maps every costed COCO class to a real catalog category", async () => {
    const { CATALOG_BY_ID } = await import("./devices");
    for (const c of Object.values(COCO_MAP)) {
      if (c.categoryId) expect(CATALOG_BY_ID[c.categoryId], c.categoryId).toBeDefined();
    }
  });
});

describe("containRect", () => {
  it("letterboxes a wide source in a square", () => {
    expect(containRect(1600, 900, 800, 800)).toEqual({ x: 0, y: 175, w: 800, h: 450, scale: 0.5 });
  });

  it("pillarboxes a tall source in a wide box", () => {
    const r = containRect(500, 1000, 1000, 500);
    expect(r).toMatchObject({ x: 375, y: 0, w: 250, h: 500, scale: 0.5 });
  });
});

describe("auto-audit signatures", () => {
  const solid = (g: number, noise = 0) => {
    const px = new Uint8ClampedArray(SIG_W * SIG_H * 4);
    for (let i = 0; i < SIG_W * SIG_H; i++) {
      const v = g + (noise ? ((i * 7919) % (noise * 2 + 1)) - noise : 0);
      px.set([v, v, v, 255], i * 4);
    }
    return px;
  };
  const split = (leftDark: boolean) => {
    const px = new Uint8ClampedArray(SIG_W * SIG_H * 4);
    for (let i = 0; i < SIG_W * SIG_H; i++) {
      const left = i % SIG_W < SIG_W / 2;
      const v = left === leftDark ? 30 : 220;
      px.set([v, v, v, 255], i * 4);
    }
    return px;
  };

  it("ignores a uniform exposure change", () => {
    const a = frameSignature(split(true));
    const brighter = split(true).map((v, i) => (i % 4 === 3 ? v : Math.min(255, v + 20)));
    expect(sigDiff(a, frameSignature(brighter))).toBeLessThan(STILL_DIFF);
  });

  it("treats sensor noise as still, and a new view as different", () => {
    expect(sigDiff(frameSignature(solid(120)), frameSignature(solid(120, 3)))).toBeLessThan(STILL_DIFF);
    expect(sigDiff(frameSignature(split(true)), frameSignature(split(false)))).toBeGreaterThan(SAME_VIEW_DIFF);
  });

  it("finds a previously audited view and rejects an unseen one", () => {
    const views = [{ sig: frameSignature(split(true)), id: "a" }];
    expect(nearestView(frameSignature(split(true)), views)?.view.id).toBe("a");
    expect(nearestView(frameSignature(split(false)), views)).toBeNull();
    expect(nearestView(frameSignature(split(true)), [])).toBeNull();
  });
});

describe("shouldAutoAudit", () => {
  const ready = {
    enabled: true,
    inFlight: false,
    steadyMs: STEADY_MS,
    alreadyAudited: false,
    sinceLastMs: 10_000,
    cooldownMs: COOLDOWN_MIN_MS,
  };

  it("audits a new, steady view once the cooldown has passed", () => {
    expect(shouldAutoAudit(ready)).toBe(true);
  });

  it("holds off while moving, busy, cooling down, switched off or already audited", () => {
    expect(shouldAutoAudit({ ...ready, steadyMs: 100 })).toBe(false);
    expect(shouldAutoAudit({ ...ready, inFlight: true })).toBe(false);
    expect(shouldAutoAudit({ ...ready, sinceLastMs: 1000 })).toBe(false);
    expect(shouldAutoAudit({ ...ready, enabled: false })).toBe(false);
    expect(shouldAutoAudit({ ...ready, alreadyAudited: true })).toBe(false);
  });

  it("backs off exponentially when busy and resets on success", () => {
    expect(nextCooldown(COOLDOWN_MIN_MS, false)).toBe(COOLDOWN_MIN_MS * 2);
    expect(nextCooldown(COOLDOWN_MAX_MS, false)).toBe(COOLDOWN_MAX_MS);
    expect(nextCooldown(20_000, true)).toBe(COOLDOWN_MIN_MS);
  });
});
