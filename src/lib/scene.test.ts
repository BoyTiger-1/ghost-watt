import { describe, expect, it } from "vitest";
import { classifyScreen, findLightSources, readScene, regionStats, ringStats, sharpness } from "./scene";
import { selectKeyframes, sampleTimes, type FrameSample } from "./keyframes";
import { itemsToObservations, readItems } from "./ondevice";
import { DEFAULT_SETTINGS } from "./types";
import { SIG_H, SIG_W } from "./live";

const W = 80;
const H = 60;

/** A grey room; paint rectangles onto it in fractional coordinates. */
function room(base = 110) {
  const luma = new Uint8Array(W * H).fill(base);
  const paint = (box: number[], v: number | ((x: number, y: number) => number)) => {
    for (let y = Math.floor(box[1] * H); y < Math.ceil(box[3] * H); y++)
      for (let x = Math.floor(box[0] * W); x < Math.ceil(box[2] * W); x++)
        luma[y * W + x] = typeof v === "number" ? v : v(x, y);
  };
  return { luma, paint };
}

describe("classifyScreen", () => {
  it("reads a bright textured panel as on", () => {
    const { luma, paint } = room(90);
    const box = [0.3, 0.3, 0.6, 0.6];
    paint(box, (x, y) => ((x + y) % 4 < 2 ? 220 : 150));
    expect(classifyScreen(regionStats(luma, W, H, box), ringStats(luma, W, H, box)).state).toBe("on");
  });

  it("reads a flat dark panel as standby", () => {
    const { luma, paint } = room(120);
    const box = [0.3, 0.3, 0.6, 0.6];
    paint(box, 20);
    const read = classifyScreen(regionStats(luma, W, H, box), ringStats(luma, W, H, box));
    expect(read.state).toBe("standby");
    expect(read.why).toBe("screen dark");
  });
});

describe("findLightSources", () => {
  it("finds lit fixtures near the ceiling and ignores windows and low glare", () => {
    const { luma, paint } = room(100);
    // Fixtures glow: a clipped core with light bleeding into the ceiling around it.
    for (const [x, peak] of [[0.1, 252], [0.5, 250]]) {
      [[0.04, 150], [0.025, 185], [0.012, 215]].forEach(([pad, v]) => paint([x - pad, 0.05 - pad, x + 0.1 + pad, 0.09 + pad], v));
      paint([x, 0.05, x + 0.1, 0.09], peak);
    }
    paint([0.7, 0.1, 1.0, 0.55], 255); // window: too big
    paint([0.4, 0.8, 0.45, 0.85], 255); // low: a screen or a lamp
    const lights = findLightSources(luma, W, H);
    expect(lights).toHaveLength(2);
    expect(lights.every((l) => l.box[1] < 0.2)).toBe(true);
  });

  it("finds nothing in a dark room", () => {
    const { luma } = room(30);
    const scene = readScene(luma, W, H);
    expect(scene.lights).toHaveLength(0);
    expect(scene.lighting).toBe("off");
    expect(scene.dark).toBe(true);
  });
});

describe("sharpness", () => {
  it("scores a sharp pattern above a flat field", () => {
    const flat = room(100).luma;
    const { luma, paint } = room(100);
    paint([0, 0, 1, 1], (x) => (x % 2 ? 230 : 20));
    expect(sharpness(luma, W, H)).toBeGreaterThan(sharpness(flat, W, H));
  });
});

describe("selectKeyframes", () => {
  const sig = (v: number) => {
    const s = new Float32Array(SIG_W * SIG_H);
    for (let i = 0; i < s.length; i++) s[i] = (i % SIG_W < SIG_W / 2 ? 1 : -1) * v;
    return s;
  };
  const sample = (t: number, view: number, sharp: number): FrameSample => ({ t, sig: sig(view), sharp });

  it("keeps the sharpest frame of each scene", () => {
    const samples = [sample(0, 0, 5), sample(1, 1, 50), sample(2, 0, 9), sample(3, 60, 3), sample(4, 61, 40)];
    expect(selectKeyframes(samples)).toEqual([1, 4]);
  });

  it("caps at max, keeping the most different views", () => {
    const samples = [0, 30, 60, 90, 120].map((v, i) => sample(i, v, 1));
    const picks = selectKeyframes(samples, 2);
    expect(picks).toHaveLength(2);
    expect(picks).toContain(0);
    expect(picks).toContain(4);
  });

  it("samples a clip without hitting its very ends", () => {
    const times = sampleTimes(10, 0.5, 8);
    expect(times).toHaveLength(8);
    expect(times[0]).toBeGreaterThan(0);
    expect(times[times.length - 1]).toBeLessThan(10);
    expect(sampleTimes(NaN)).toEqual([0]);
  });
});

describe("on-device items", () => {
  it("judges screens, costs lights, and groups lines by state", () => {
    const { luma, paint } = room(110);
    const lit = [0.1, 0.4, 0.3, 0.6] as [number, number, number, number];
    const dark = [0.6, 0.4, 0.8, 0.6] as [number, number, number, number];
    paint(lit, (x, y) => ((x + y) % 4 < 2 ? 230 : 160));
    paint(dark, 15);
    const items = readItems(
      [
        { cls: "tv", score: 0.9, box: lit },
        { cls: "tv", score: 0.8, box: dark },
        { cls: "person", score: 0.9, box: [0.4, 0.2, 0.5, 0.9] },
      ],
      [{ box: [0.1, 0.05, 0.2, 0.08], area: 0.003, peak: 252, kind: "panel", confidence: 0.8 }],
      DEFAULT_SETTINGS,
      { data: luma, w: W, h: H },
    );
    const screens = items.filter((i) => i.categoryId === "monitor");
    expect(screens.map((s) => s.state)).toEqual(["on", "standby"]);
    expect(screens[0].costPerYear).toBeGreaterThan(screens[1].costPerYear);
    expect(items.find((i) => i.kind === "light")?.costPerYear).toBeGreaterThan(0);

    const obs = itemsToObservations(items);
    expect(obs.map((o) => `${o.categoryId}:${o.state}:${o.count}`).sort()).toEqual([
      "ceiling_light:on:1",
      "monitor:on:1",
      "monitor:standby:1",
    ]);
  });
});
