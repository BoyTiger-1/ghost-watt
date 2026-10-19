import { describe, expect, it } from "vitest";
import { crossCheck } from "./crosscheck";
import type { CategorizedObservation } from "./parse";

const obs = (categoryId: string, count: number, extra: Partial<CategorizedObservation> = {}): CategorizedObservation => ({
  device: categoryId,
  count,
  state: "on",
  categoryId,
  ...extra,
});

describe("crossCheck", () => {
  it("leaves a claim the detector partly backs alone, since the detector misses about half", () => {
    const out = crossCheck([obs("monitor", 6, { confidence: 0.9 })], [obs("monitor", 3)]);
    expect(out[0].verification).toBe("verified");
  });

  it("marks several screens the detector saw none of as unverified", () => {
    const out = crossCheck([obs("monitor", 4, { confidence: 0.9 })], [obs("laptop", 0)]);
    expect(out[0].verification).toBe("unverified");
  });

  it("marks a count far beyond what the detector saw", () => {
    const out = crossCheck([obs("monitor", 12, { confidence: 0.9 })], [obs("monitor", 2)]);
    expect(out[0].verification).toBe("unverified");
  });

  it("lets one or two of something through even when the detector saw none", () => {
    const out = crossCheck([obs("fridge", 1, { confidence: 0.9 })], []);
    expect(out[0].verification).toBe("verified");
  });

  it("marks anything the model itself was unsure of", () => {
    const out = crossCheck([obs("projector", 1, { confidence: 0.3 })], undefined);
    expect(out[0].verification).toBe("unverified");
  });

  it("does not judge classes the detector cannot see, and never touches off devices or confirmed ones", () => {
    const out = crossCheck(
      [obs("projector", 3, { confidence: 0.9 }), obs("monitor", 9, { state: "off" }), obs("monitor", 9, { verification: "confirmed" })],
      [],
    );
    expect(out.map((o) => o.verification)).toEqual(["verified", undefined, "confirmed"]);
  });
});
