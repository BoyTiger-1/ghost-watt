import { describe, expect, it } from "vitest";
import { buildVisionPrompt } from "./ollama";
import { parseModelOutput } from "./parse";

describe("buildVisionPrompt", () => {
  it("asks for a wattage read and evidence on every device", () => {
    const p = buildVisionPrompt();
    expect(p).toContain('"watts"');
    expect(p).toContain('"evidence"');
    expect(p).toContain("boxes");
  });

  it("tells a video prompt to count each device once and skip boxes", () => {
    const p = buildVisionPrompt(undefined, { kind: "video", frames: 5 });
    expect(p).toContain("5 frames");
    expect(p).toContain("count each physical device ONCE");
    expect(p).not.toContain("Rules for boxes");
  });

  it("passes capture context through, quoting the user's note safely", () => {
    const p = buildVisionPrompt(undefined, {
      when: "9:42 PM, Wednesday, outside open hours",
      place: "Austin, TX",
      note: 'Dell "24 inch" monitors',
      hints: ["3 bright light fixtures appear lit"],
    });
    expect(p).toContain("Captured: 9:42 PM");
    expect(p).toContain("Location: Austin, TX");
    expect(p).toContain("Dell '24 inch' monitors");
    expect(p).toContain("verify, do not copy");
  });
});

describe("parseModelOutput with wattage reads", () => {
  it("keeps the model's watts and evidence", () => {
    const [o] = parseModelOutput('[{"device":"projector","count":1,"state":"on","watts":180,"evidence":"laser unit, bright image"}]');
    expect(o).toMatchObject({ categoryId: "projector", wattsHint: 180, evidence: "laser unit, bright image" });
  });

  it("ignores a nonsense wattage", () => {
    const [o] = parseModelOutput('[{"device":"projector","count":1,"state":"on","watts":"lots"}]');
    expect(o.wattsHint).toBeUndefined();
  });
});
