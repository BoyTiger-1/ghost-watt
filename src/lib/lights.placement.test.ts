// "Lamp" is the word models use for any light. These pin down where each one goes.
import { describe, expect, it } from "vitest";
import { matchCategory, parseModelOutput, resolveLight } from "./parse";
import { lightKind } from "./ondevice";
import { CATALOG_BY_ID } from "./devices";

describe("a cloud model's 'lamp'", () => {
  it("on the ceiling becomes overhead lights or downlights", () => {
    expect(resolveLight("lamps", "ceiling, whole room · LED panels lit", "ceiling_light")).toEqual({ categoryId: "ceiling_light", device: "overhead lights" });
    expect(resolveLight("lamps", "recessed in the ceiling", "ceiling_light")).toEqual({ categoryId: "downlight", device: "ceiling downlights" });
    expect(resolveLight("hanging lamps", "", "ceiling_light").categoryId).toBe("downlight");
  });

  it("with nothing saying ceiling is a lamp, not a 120 W bank of troffers", () => {
    expect(resolveLight("lamp", "corner of the room", "ceiling_light").categoryId).toBe("x_desk_lamp");
    expect(resolveLight("lamp", "beside the sofa, floor", "ceiling_light").categoryId).toBe("x_floor_lamp");
    expect(CATALOG_BY_ID.x_desk_lamp.wattsOn).toBeLessThan(CATALOG_BY_ID.ceiling_light.wattsOn / 5);
  });

  it("leaves named lamps and other lights alone", () => {
    expect(matchCategory("desk lamp")).toBe("x_desk_lamp");
    expect(resolveLight("desk lamp", "ceiling", "x_desk_lamp").categoryId).toBe("x_desk_lamp");
    expect(resolveLight("overhead lights", "ceiling", "ceiling_light")).toEqual({ categoryId: "ceiling_light", device: "overhead lights" });
  });

  it("is applied when a model's JSON is parsed", () => {
    const out = parseModelOutput(JSON.stringify([{ device: "lamps", count: 6, state: "on", visible: true, where: "ceiling, left half" }]));
    expect(out[0].categoryId).toBe("ceiling_light");
    expect(out[0].device).toBe("overhead lights");
  });
});

describe("an on-device light", () => {
  it("is a ceiling light high in the frame and a lamp low in it", () => {
    expect(lightKind("spot", [0.4, 0.05, 0.45, 0.1]).label).toBe("ceiling light");
    expect(lightKind("spot", [0.4, 0.7, 0.45, 0.8])).toEqual({ categoryId: "x_desk_lamp", label: "lamp" });
    expect(lightKind("panel", [0.1, 0.8, 0.5, 0.85]).label).toBe("overhead light");
  });
});
