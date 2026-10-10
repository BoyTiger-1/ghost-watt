// Box cleaning is where a vision model's worst habits get caught, so each case
// here is a habit seen in a real response, not a hypothetical.

import { describe, expect, it } from "vitest";
import { cleanBoxes, iou, readBoxList, sanitizeFrame, trimExtrapolation, MAX_BOXES_PER_DEVICE } from "./boxes";
import { parseModelOutput } from "./parse";
import { rankObservations } from "./energy";
import { retryDelayMs } from "./vision";
import { buildVisionPrompt } from "./ollama";
import { DEFAULT_SETTINGS, type Box } from "./types";

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));

describe("readBoxList", () => {
  it("reads the shapes models actually emit", () => {
    expect(readBoxList({ boxes: [[1, 2, 30, 40]] })).toEqual([[1, 2, 30, 40]]);
    expect(readBoxList({ bbox_2d: [1, 2, 30, 40] })).toEqual([[1, 2, 30, 40]]);
    expect(readBoxList({ boxes: [{ x1: 1, y1: 2, x2: 30, y2: 40 }] })).toEqual([[1, 2, 30, 40]]);
    expect(readBoxList({ boxes: [{ xmin: 1, ymin: 2, xmax: 30, ymax: 40 }] })).toEqual([[1, 2, 30, 40]]);
    expect(readBoxList({ boxes: [{ x: 1, y: 2, w: 29, h: 38 }] })).toEqual([[1, 2, 30, 40]]);
    expect(readBoxList({ locations: [{ bbox_2d: ["1", "2", "30", "40"] }] })).toEqual([[1, 2, 30, 40]]);
  });

  it("skips malformed entries without losing the good ones", () => {
    expect(readBoxList({ boxes: [[1, 2, 3], [1, 2, 30, 40], ["a", 2, 3, 4], null] })).toEqual([[1, 2, 30, 40]]);
    expect(readBoxList({})).toEqual([]);
    expect(readBoxList({ boxes: "somewhere on the left" })).toEqual([]);
  });
});

describe("cleanBoxes", () => {
  it("maps square coordinates onto the photo inside the frame", () => {
    // Photo is 1000 x 625 inside the square: y is divided by 625, not 1000.
    const [b] = cleanBoxes({ boxes: [[100, 125, 300, 250]] }, { w: 1000, h: 625 });
    close(b, [0.1, 0.2, 0.3, 0.4]);
  });

  it("drops the all-zero padding and degenerate boxes", () => {
    expect(cleanBoxes({ boxes: [[0, 0, 0, 0], [10, 10, 12, 80], [10, 10, 100, 100]] })).toHaveLength(1);
  });

  it("fixes swapped corners", () => {
    const [b] = cleanBoxes({ boxes: [[300, 400, 100, 200]] });
    close(b, [0.1, 0.2, 0.3, 0.4]);
  });

  it("treats 0-1 values as fractions of the square", () => {
    const [b] = cleanBoxes({ boxes: [[0.1, 0.2, 0.3, 0.4]] });
    close(b, [0.1, 0.2, 0.3, 0.4]);
  });

  it("drops boxes that sit mostly in the grey padding and clips the rest", () => {
    const frame = { w: 1000, h: 600 };
    expect(cleanBoxes({ boxes: [[100, 650, 200, 900]] }, frame)).toEqual([]);
    const [b] = cleanBoxes({ boxes: [[100, 500, 200, 640]] }, frame);
    expect(b[3]).toBe(1);
  });

  it("collapses duplicate boxes on the same object", () => {
    expect(cleanBoxes({ boxes: [[100, 100, 200, 200], [102, 101, 201, 203]] })).toHaveLength(1);
  });

  it("never returns more than the cap", () => {
    const many = Array.from({ length: 30 }, (_, i) => [
      (i % 6) * 160 + (i % 2) * 7,
      Math.floor(i / 6) * 190 + (i % 3) * 11,
      (i % 6) * 160 + 120,
      Math.floor(i / 6) * 190 + 150,
    ]);
    expect(cleanBoxes({ boxes: many }).length).toBeLessThanOrEqual(MAX_BOXES_PER_DEVICE);
  });
});

describe("trimExtrapolation", () => {
  const row = (xs: number[]): Box[] => xs.map((x) => [x, 400, x + 60, 450]);

  it("cuts the steady-stride tail a model invents when it runs out of objects", () => {
    // Real sightings with irregular spacing, then the tail measured on a live
    // response: strides 13, 13, 12, 10, 10, 10, 10.
    const real = [40, 150, 230, 360];
    const tail = [373, 386, 398, 408, 418, 428, 438];
    const kept = trimExtrapolation(row([...real, ...tail]));
    expect(kept.length).toBeLessThanOrEqual(real.length + 2);
    expect(kept.length).toBeGreaterThanOrEqual(real.length);
  });

  it("leaves an irregular real row alone", () => {
    const boxes = row([20, 140, 230, 390, 470, 610, 700]);
    expect(trimExtrapolation(boxes)).toHaveLength(boxes.length);
  });

  it("leaves short lists alone", () => {
    expect(trimExtrapolation(row([0, 10, 20, 30]))).toHaveLength(4);
  });
});

describe("iou", () => {
  it("is 1 for the same box and 0 for disjoint ones", () => {
    expect(iou([0, 0, 1, 1], [0, 0, 1, 1])).toBe(1);
    expect(iou([0, 0, 1, 1], [2, 2, 3, 3])).toBe(0);
  });
});

describe("sanitizeFrame", () => {
  it("accepts a sane frame and rejects anything else", () => {
    expect(sanitizeFrame({ w: 1000, h: 625 })).toEqual({ w: 1000, h: 625 });
    expect(sanitizeFrame({ w: 5000, h: 625 })).toEqual({ w: 1000, h: 1000 });
    expect(sanitizeFrame({ w: "x" })).toEqual({ w: 1000, h: 1000 });
    expect(sanitizeFrame(undefined)).toEqual({ w: 1000, h: 1000 });
  });
});

describe("boxes through the pipeline", () => {
  const reply = JSON.stringify([
    { device: "computer monitor", count: 2, state: "on", boxes: [[100, 100, 200, 180], [300, 100, 400, 180], [500, 100, 600, 180]] },
    { device: "overhead lights", count: 4, state: "on" },
  ]);

  it("parses boxes and raises a count the boxes prove was low", () => {
    const rows = parseModelOutput(reply, { w: 1000, h: 625 });
    const mon = rows.find((r) => r.categoryId === "monitor")!;
    expect(mon.boxes).toHaveLength(3);
    expect(mon.count).toBe(3);
    expect(rows.find((r) => r.categoryId === "ceiling_light")!.boxes).toBeUndefined();
  });

  it("carries boxes onto offenders and merges them across duplicate rows", () => {
    const rows = [
      ...parseModelOutput(reply),
      { device: "monitor", count: 1, state: "on" as const, categoryId: "monitor", boxes: [[0.8, 0.1, 0.9, 0.2] as Box] },
    ];
    const offenders = rankObservations(rows, DEFAULT_SETTINGS, "Lab");
    expect(offenders.find((o) => o.categoryId === "monitor")!.boxes).toHaveLength(4);
  });

  it("asks the model about the padded frame it is actually looking at", () => {
    expect(buildVisionPrompt({ w: 1000, h: 625 })).toContain("top-left 1000 x 625");
    expect(buildVisionPrompt()).not.toContain("padding");
  });
});

describe("retryDelayMs", () => {
  it("waits as long as a Groq 429 asks, within the cap", () => {
    expect(retryDelayMs("HTTP 429 Please try again in 9.18s.")).toBe(9430);
    expect(retryDelayMs("HTTP 429 Please try again in 450ms")).toBe(700);
    expect(retryDelayMs("HTTP 429 Please try again in 1m30s")).toBe(12000);
    expect(retryDelayMs("HTTP 503 upstream")).toBe(1200);
  });
});
