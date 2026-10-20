import { describe, expect, it } from "vitest";
import { searchCatalog } from "./ManualEntry";

describe("Type it in search", () => {
  it("matches word by word, in any order, and ignores sizes as a filter", () => {
    for (const q of ["computer monitor 24", "monitor 24 inch", "24 monitor", "monitor"]) {
      expect(searchCatalog(q).length, q).toBeGreaterThan(0);
      expect(searchCatalog(q)[0].label.toLowerCase(), q).toContain("monitor");
    }
  });
  it("finds partial words and long-tail devices", () => {
    expect(searchCatalog("air fry")[0].label).toBe("Air fryer");
    expect(searchCatalog("space heat")[0].label.toLowerCase()).toContain("space heater");
    expect(searchCatalog("label maker")[0].label).toBe("Label maker");
  });
  it("returns nothing for nonsense rather than a random device", () => {
    expect(searchCatalog("zzqx")).toEqual([]);
    expect(searchCatalog("a")).toEqual([]);
  });
});
