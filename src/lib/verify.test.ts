// The classifier's second opinion: a door is not a fridge, a lampshade is a light.

import { describe, expect, it } from "vitest";
import { CenterLamp, Verifier, judge, lampScore, litRegion, passesScore, withLamps, type Guess } from "./verify";

const g = (...pairs: [string, number][]): Guess[] => pairs.map(([label, score]) => ({ label, score }));

describe("judge", () => {
  it("rejects a 'refrigerator' the classifier sees as a door or wardrobe", () => {
    expect(judge("refrigerator", g(["sliding door", 0.41], ["wardrobe", 0.22], ["refrigerator", 0.05]))).toBe("reject");
  });

  it("confirms a real fridge", () => {
    expect(judge("refrigerator", g(["refrigerator", 0.62], ["vending machine", 0.1]))).toBe("confirm");
  });

  it("needs a real vote for a fridge, but only a place in the running for a screen", () => {
    expect(judge("refrigerator", g(["wardrobe", 0.5], ["refrigerator", 0.1]))).toBe("reject");
    expect(judge("tv", g(["wardrobe", 0.5], ["monitor", 0.1]))).toBe("confirm");
  });

  it("calls a 'tv' that is a lit ceiling panel a lamp", () => {
    expect(judge("tv", g(["spotlight", 0.3], ["lampshade", 0.15], ["screen", 0.1]))).toBe("lamp");
  });

  it("is unsure when the classifier is", () => {
    expect(judge("refrigerator", g(["bookcase", 0.12], ["chest", 0.1]))).toBe("unsure");
    expect(judge("person", g(["sliding door", 0.9]))).toBe("unsure");
  });
});

describe("Verifier", () => {
  it("hides an unconfirmed appliance and shows it once confirmed", () => {
    const v = new Verifier();
    expect(v.status(1, "refrigerator", 0.6, true)).toBe("hide");
    v.record(1, "confirm", 0);
    expect(v.status(1, "refrigerator", 0.6, true)).toBe("show");
  });

  it("keeps a door-fridge hidden when the votes go against it", () => {
    const v = new Verifier();
    v.record(1, "reject", 0);
    v.record(1, "confirm", 1000);
    v.record(1, "reject", 2000);
    expect(v.status(1, "refrigerator", 0.9, true)).toBe("hide");
  });

  it("without a classifier, shows an appliance only at a high score", () => {
    const v = new Verifier();
    expect(v.status(1, "refrigerator", 0.6, false)).toBe("hide");
    expect(v.status(1, "refrigerator", 0.8, false)).toBe("show");
  });

  it("shows screens until the classifier keeps disagreeing", () => {
    const v = new Verifier();
    expect(v.status(1, "tv", 0.5, true)).toBe("show");
    v.record(1, "reject", 0);
    expect(v.status(1, "tv", 0.5, true)).toBe("show");
    v.record(1, "reject", 1000);
    expect(v.status(1, "tv", 0.5, true)).toBe("hide");
  });

  it("turns a track into a lamp after two lamp reads", () => {
    const v = new Verifier();
    v.record(1, "lamp", 0);
    expect(v.status(1, "tv", 0.5, true)).toBe("show");
    v.record(1, "lamp", 1000);
    expect(v.status(1, "tv", 0.5, true)).toBe("lamp");
  });

  it("checks never-seen appliances first, and leaves classes it cannot check alone", () => {
    const v = new Verifier();
    v.record(1, "confirm", 0);
    const tracks = [
      { id: 1, cls: "tv" },
      { id: 2, cls: "tv" },
      { id: 3, cls: "refrigerator" },
      { id: 4, cls: "person" },
    ];
    expect(v.due(tracks, 100)?.id).toBe(3);
    v.record(3, "confirm", 100);
    expect(v.due(tracks, 200)?.id).toBe(2);
    v.record(2, "confirm", 200);
    expect(v.due(tracks, 300)).toBeNull();
    // Later, everything is due again - appliances still first.
    expect(v.due(tracks, 5000)?.id).toBe(3);
  });
});

describe("thresholds", () => {
  it("needs more confidence for a fridge than for a car", () => {
    expect(passesScore("refrigerator", 0.4)).toBe(false);
    expect(passesScore("refrigerator", 0.6)).toBe(true);
    expect(passesScore("car", 0.32)).toBe(true);
  });
});

describe("lamps", () => {
  const W = 100;
  const H = 80;
  const frame = (base: number, lit?: number[]) => {
    const data = new Uint8Array(W * H).fill(base);
    if (lit)
      for (let y = Math.floor(lit[1] * H); y < Math.ceil(lit[3] * H); y++)
        for (let x = Math.floor(lit[0] * W); x < Math.ceil(lit[2] * W); x++) data[y * W + x] = 252;
    return { data, w: W, h: H };
  };

  it("sums the lamp labels", () => {
    expect(lampScore(g(["lampshade", 0.3], ["table lamp", 0.2], ["wardrobe", 0.1]))).toBeCloseTo(0.5);
  });

  it("finds the lit part of a lamp, and nothing in a lamp that is off", () => {
    const on = frame(90, [0.4, 0.3, 0.6, 0.5]);
    const box = litRegion(on.data, W, H, [0.2, 0.1, 0.8, 0.9])!;
    expect(box[0]).toBeGreaterThan(0.3);
    expect(box[2]).toBeLessThan(0.7);
    expect(litRegion(frame(90).data, W, H, [0.2, 0.1, 0.8, 0.9])).toBeNull();
  });

  it("adds a lit lamp as a light, once", () => {
    const px = frame(90, [0.4, 0.3, 0.6, 0.5]);
    const once = withLamps([], [{ box: [0.2, 0.1, 0.8, 0.9], confidence: 0.7 }], px);
    expect(once).toHaveLength(1);
    expect(withLamps(once, [{ box: [0.2, 0.1, 0.8, 0.9], confidence: 0.7 }], px)).toHaveLength(1);
  });

  it("only reports a lamp in the middle of the frame after two reads, and holds through one miss", () => {
    const c = new CenterLamp();
    c.update(0.6);
    expect(c.confidence).toBe(0);
    c.update(0.5);
    expect(c.confidence).toBeGreaterThan(0.4);
    c.update(0.1);
    expect(c.confidence).toBeGreaterThan(0);
    c.update(0.1);
    expect(c.confidence).toBe(0);
  });
});

describe("observationsToItems: the AI's answer on the live picture", () => {
  it("draws one item per located box, lights as lights, and prices an off light at nothing", async () => {
    const { observationsToItems } = await import("./ondevice");
    const { DEFAULT_SETTINGS } = await import("./types");
    const items = observationsToItems(
      [
        { device: "ceiling light", count: 2, state: "on", categoryId: "ceiling_light", boxes: [[0.1, 0.05, 0.3, 0.12], [0.5, 0.05, 0.7, 0.12]] },
        { device: "monitor", count: 3, state: "off", categoryId: "monitor", boxes: [[0.4, 0.5, 0.6, 0.7]] },
        { device: "mystery", count: 1, state: "on", categoryId: "not-a-category", boxes: [[0, 0, 1, 1]] },
      ],
      DEFAULT_SETTINGS,
    );
    expect(items.map((i) => i.kind)).toEqual(["light", "light", "device"]);
    expect(items[0].costPerYear).toBeGreaterThan(0);
    expect(items[2].typicalCostPerYear).toBe(0);
  });
});
