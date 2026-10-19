import { describe, expect, it } from "vitest";
import { dedupeCandidates, isLiveClass, looksLikeWindow, tooBig } from "./candidates";

describe("live candidates", () => {
  it("keeps the detector to the classes it is good at, at class-specific thresholds", () => {
    expect(isLiveClass("tv", 0.34)).toBe(true);
    expect(isLiveClass("tv", 0.32)).toBe(false);
    expect(isLiveClass("refrigerator", 0.45)).toBe(false);
    expect(isLiveClass("refrigerator", 0.55)).toBe(true);
    expect(isLiveClass("oven", 0.55)).toBe(true);
    expect(isLiveClass("keyboard", 0.99)).toBe(false);
    expect(isLiveClass("clock", 0.99)).toBe(false);
  });

  it("drops boxes that are the whole wall, but lets a close-up screen fill the frame", () => {
    expect(tooBig("refrigerator", [0.05, 0.05, 0.95, 0.95])).toBe(true);
    expect(tooBig("tv", [0.05, 0.1, 0.95, 0.9])).toBe(false);
    expect(tooBig("tv", [0, 0, 1, 1])).toBe(true);
    expect(tooBig("tv", [0, 0.4, 1, 0.6])).toBe(true);
    expect(tooBig("tv", [0.3, 0.3, 0.6, 0.6])).toBe(false);
  });

  it("reads a bright flat patch as a window and a textured or dark one as a screen", () => {
    expect(looksLikeWindow({ mean: 230, std: 8 })).toBe(true);
    expect(looksLikeWindow({ mean: 230, std: 40 })).toBe(false);
    expect(looksLikeWindow({ mean: 230, std: 8 }, 0.4)).toBe(false);
    expect(looksLikeWindow({ mean: 40, std: 5 })).toBe(false);
  });

  it("collapses a monitor seen as both tv and laptop into one candidate", () => {
    const out = dedupeCandidates([
      { cls: "tv", score: 0.6, box: [0.1, 0.1, 0.4, 0.4] },
      { cls: "laptop", score: 0.7, box: [0.12, 0.1, 0.42, 0.42] },
      { cls: "tv", score: 0.5, box: [0.6, 0.6, 0.9, 0.9] },
    ]);
    expect(out.map((c) => c.cls)).toEqual(["laptop", "tv"]);
    expect(out[1].box[0]).toBe(0.6);
  });
});
