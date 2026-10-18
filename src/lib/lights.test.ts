// Light detection against the scenes that fooled it: daylight windows, a
// backlit keyboard, a blinking LED - and the fixtures it must still find.

import { describe, expect, it } from "vitest";
import { LightTracker, findLightSources, toLuma, type LightBlob } from "./scene";
import { mergeDetections, tileGrid } from "./ondevice";

const W = 256;
const H = 160;

/** An RGB room; paint rectangles in fractional coordinates. */
const WHITE: [number, number, number] = [255, 255, 255];

function scene(base: [number, number, number] = [120, 110, 100]) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) rgba.set([...base, 255], i * 4);
  const paint = (box: number[], rgb: [number, number, number]) => {
    for (let y = Math.floor(box[1] * H); y < Math.ceil(box[3] * H); y++)
      for (let x = Math.floor(box[0] * W); x < Math.ceil(box[2] * W); x++) rgba.set([...rgb, 255], (y * W + x) * 4);
  };
  /** A lamp: a clipped core whose light bleeds into the surroundings, as a real one does. */
  const lamp = (box: number[], rgb: [number, number, number] = WHITE) => {
    const steps = [6, 4, 2];
    steps.forEach((px, k) => {
      const t = 0.25 + k * 0.22;
      const mix = rgb.map((v, i) => Math.round(base[i] + (v - base[i]) * t)) as [number, number, number];
      paint([box[0] - px / W, box[1] - px / H, box[2] + px / W, box[3] + px / H], mix);
    });
    paint(box, rgb);
  };
  const lights = () => findLightSources(toLuma(rgba, W, H), W, H, { rgba });
  return { rgba, paint, lamp, lights };
}

const WARM: [number, number, number] = [255, 250, 238];

describe("findLightSources: what is a light", () => {
  it("finds downlights in a dim ceiling, one each", () => {
    const s = scene([90, 80, 70]);
    for (const x of [0.1, 0.3, 0.5, 0.7]) s.lamp([x, 0.1, x + 0.025, 0.14], WARM);
    const l = s.lights();
    expect(l).toHaveLength(4);
    expect(l.every((b) => b.kind === "spot")).toBe(true);
  });

  it("finds downlights in a bright white ceiling, where a global threshold could not", () => {
    const s = scene([214, 214, 212]);
    for (const x of [0.2, 0.45, 0.7]) s.lamp([x, 0.12, x + 0.025, 0.16]);
    expect(s.lights()).toHaveLength(3);
  });

  it("calls a long bright bar a panel", () => {
    const s = scene([100, 100, 100]);
    s.lamp([0.3, 0.1, 0.6, 0.13]);
    expect(s.lights().map((b) => b.kind)).toEqual(["panel"]);
  });

  it("counts a perforated globe once, not once per hole", () => {
    const s = scene([120, 100, 80]);
    // A lit diffuser with a pattern of small dark holes, like the globes in an office.
    s.lamp([0.39, 0.09, 0.47, 0.2], WARM);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s.paint([0.4 + i * 0.018, 0.1 + j * 0.025, 0.4 + i * 0.018 + 0.006, 0.1 + j * 0.025 + 0.008], [150, 140, 125]);
    expect(s.lights()).toHaveLength(1);
  });
});

describe("findLightSources: what is not", () => {
  it("ignores a keyboard's RGB backlight, even held high in the frame", () => {
    const s = scene([40, 40, 45]);
    const colours: [number, number, number][] = [[255, 40, 60], [40, 255, 120], [60, 120, 255], [255, 0, 255]];
    colours.forEach((c, i) => s.paint([0.2 + i * 0.12, 0.3, 0.2 + i * 0.12 + 0.05, 0.34], c));
    expect(s.lights()).toHaveLength(0);
  });

  it("ignores single-key LEDs as specks", () => {
    const s = scene([40, 40, 45]);
    for (let i = 0; i < 8; i++) s.paint([0.1 + i * 0.1, 0.3, 0.1 + i * 0.1 + 0.004, 0.306], WHITE);
    expect(s.lights()).toHaveLength(0);
  });

  it("ignores a window of blown-out panes split by mullions", () => {
    const s = scene([110, 100, 90]);
    for (const x of [0.05, 0.17]) for (const y of [0.3, 0.48]) s.paint([x, y, x + 0.1, y + 0.15], WHITE);
    expect(s.lights()).toHaveLength(0);
  });

  it("ignores a large daylight window", () => {
    const s = scene([110, 100, 90]);
    s.paint([0.6, 0.15, 0.98, 0.6], [235, 240, 248]);
    expect(s.lights()).toHaveLength(0);
  });

  it("ignores white clouds in a blue sky", () => {
    const s = scene([110, 100, 90]);
    s.paint([0.05, 0.05, 0.6, 0.45], [175, 205, 245]);
    s.paint([0.2, 0.15, 0.24, 0.19], WHITE);
    s.paint([0.4, 0.25, 0.43, 0.28], WHITE);
    expect(s.lights()).toHaveLength(0);
  });

  it("ignores a white grille or wall panel against a dark ceiling: bright, but no glow", () => {
    const s = scene([150, 105, 60]);
    s.paint([0.3, 0.15, 0.45, 0.2], [246, 246, 244]);
    s.paint([0.6, 0.18, 0.7, 0.22], [250, 250, 250]);
    expect(s.lights()).toHaveLength(0);
  });

  it("ignores bright things on the desk and floor", () => {
    const s = scene([100, 100, 100]);
    s.paint([0.4, 0.8, 0.43, 0.84], WHITE);
    expect(s.lights()).toHaveLength(0);
  });
});

describe("findLightSources, live: a camera pointed around", () => {
  const live = (s: ReturnType<typeof scene>) => findLightSources(toLuma(s.rgba, W, H), W, H, { rgba: s.rgba, mode: "live" });
  const SKY: [number, number, number] = [120, 175, 235];

  it("finds a ceiling light held right in the middle of the frame, or low in it", () => {
    const mid = scene([70, 65, 60]);
    mid.lamp([0.42, 0.42, 0.56, 0.6]);
    expect(live(mid)).toHaveLength(1);
    const low = scene([70, 65, 60]);
    low.lamp([0.42, 0.7, 0.5, 0.8]);
    expect(live(low)).toHaveLength(1);
  });

  it("finds a flat LED panel: clipped solid, hard-edged, no glow", () => {
    const s = scene([215, 215, 212]);
    s.paint([0.15, 0.1, 0.38, 0.22], WHITE);
    s.paint([0.6, 0.12, 0.82, 0.22], WHITE);
    expect(live(s)).toHaveLength(2);
  });

  it("finds a light seen close up, filling a fifth of the frame", () => {
    const s = scene([60, 58, 55]);
    s.lamp([0.3, 0.25, 0.7, 0.75]);
    expect(live(s)).toHaveLength(1);
  });

  it("keeps a warm bulb whose glow is orange around a white centre", () => {
    const s = scene([60, 50, 40]);
    s.paint([0.4, 0.35, 0.5, 0.5], [255, 170, 90]);
    s.paint([0.43, 0.39, 0.47, 0.46], WHITE);
    expect(live(s)).toHaveLength(1);
  });

  /** A light with a soft radial falloff into a tinted glow, as a phone records one. */
  const radial = (sc: ReturnType<typeof scene>, cx: number, cy: number, rad: number, core: number[], tint: number[]) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x / W - cx) * W, (y / H - cy) * H) / (rad * W);
        if (d >= 3) continue;
        const p = (y * W + x) * 4;
        const c = d < 1 ? core : tint;
        const t = d < 1 ? 1 : Math.max(0, 1 - (d - 1) / 2) * 0.85;
        for (let k = 0; k < 3; k++) sc.rgba[p + k] = Math.round(sc.rgba[p + k] + (c[k] - sc.rgba[p + k]) * t);
      }
  };

  it("finds a cool-white LED, whose glow a phone renders faintly blue, on a white ceiling", () => {
    const s = scene([185, 190, 200]);
    radial(s, 0.5, 0.3, 0.06, [255, 255, 255], [200, 220, 255]);
    expect(live(s)).toHaveLength(1);
  });

  it("finds a frosted dome the camera keeps just under clipping", () => {
    const s = scene([200, 200, 198]);
    radial(s, 0.5, 0.35, 0.1, [246, 247, 248], [225, 228, 232]);
    expect(live(s)).toHaveLength(1);
  });

  it("ignores a smooth, softly lit patch of wall", () => {
    const s = scene([150, 145, 140]);
    radial(s, 0.2, 0.35, 0.09, [238, 236, 232], [200, 196, 190]);
    expect(live(s)).toHaveLength(0);
  });

  it("sees nothing pointed outdoors: sunlit cars under a blue sky", () => {
    const s = scene([110, 112, 115]);
    s.paint([0, 0, 1, 0.4], SKY);
    for (const x of [0.15, 0.4, 0.65]) {
      s.paint([x, 0.55, x + 0.15, 0.68], [40, 40, 50]);
      s.lamp([x + 0.05, 0.57, x + 0.08, 0.6]);
    }
    expect(live(s)).toHaveLength(0);
  });

  it("does not mistake blue artwork indoors for the outdoors", () => {
    const s = scene([200, 200, 205]);
    s.paint([0.7, 0.45, 0.95, 0.8], [30, 80, 220]);
    s.lamp([0.3, 0.1, 0.33, 0.14]);
    expect(live(s)).toHaveLength(1);
  });

  it("ignores a bright window running off the edge of the frame", () => {
    const s = scene([90, 85, 80]);
    s.paint([0.75, 0.2, 1, 0.7], [250, 250, 250]);
    expect(live(s)).toHaveLength(0);
  });
});

describe("LightTracker", () => {
  const blob = (x: number): LightBlob => ({ box: [x, 0.1, x + 0.03, 0.14], area: 0.001, peak: 255, kind: "spot", confidence: 0.8 });

  it("shows a steady light after three reads and keeps it through one dropout", () => {
    const t = new LightTracker();
    expect(t.update([blob(0.2)])).toHaveLength(0);
    expect(t.update([blob(0.2)])).toHaveLength(0);
    expect(t.update([blob(0.201)])).toHaveLength(1);
    expect(t.update([])).toHaveLength(1);
    expect(t.update([blob(0.2)])).toHaveLength(1);
  });

  it("never shows a blinking LED", () => {
    const t = new LightTracker();
    for (let i = 0; i < 12; i++) expect(t.update(i % 2 ? [] : [blob(0.5)])).toHaveLength(0);
  });

  it("never shows a glint that jumps around", () => {
    const t = new LightTracker();
    for (let i = 0; i < 10; i++) expect(t.update([blob((i * 0.17) % 0.9)])).toHaveLength(0);
  });
});

describe("tiled detection", () => {
  it("covers the frame with the whole image and four overlapping tiles", () => {
    const tiles = tileGrid();
    expect(tiles).toHaveLength(5);
    expect(tiles[0]).toEqual([0, 0, 1, 1]);
    expect(tiles[4][2]).toBeCloseTo(1);
  });

  it("keeps one box per monitor across tiles, and drops fragments and screen/laptop doubles", () => {
    const merged = mergeDetections([
      [{ cls: "tv", score: 0.6, box: [0.1, 0.4, 0.2, 0.5] }],
      [
        { cls: "tv", score: 0.8, box: [0.101, 0.401, 0.199, 0.498] }, // the same monitor, seen zoomed
        { cls: "laptop", score: 0.5, box: [0.1, 0.4, 0.2, 0.5] }, // the same monitor, called a laptop
        { cls: "tv", score: 0.7, box: [0.6, 0.45, 0.66, 0.5] }, // a far monitor only the tile saw
      ],
      [{ cls: "tv", score: 0.4, box: [0.12, 0.42, 0.16, 0.48] }], // a fragment inside the first
    ]);
    expect(merged.map((d) => d.score)).toEqual([0.8, 0.7]);
  });
});
