import { describe, expect, it } from "vitest";
import { readBillReply } from "./bill";

describe("readBillReply", () => {
  it("reads a clean bill and computes the blended rate", () => {
    const r = readBillReply(JSON.stringify({ is_electricity_bill: true, utility: "Seattle City Light", kwh: 612, total_dollars: 84.3, period_start: "2026-08-14", period_end: "2026-09-13", confidence: 0.9 }));
    expect(r.isBill).toBe(true);
    expect(r.kwh).toBe(612);
    expect(r.days).toBe(30);
    expect(r.blendedRate).toBeCloseTo(0.1377, 3);
    expect(r.periodEnd).toBe("2026-09-13");
    expect(r.issues).toEqual([]);
  });

  it("never invents a missing figure, and says what is missing", () => {
    const r = readBillReply(JSON.stringify({ is_electricity_bill: true, total_dollars: 84.3, confidence: 0.9 }));
    expect(r.kwh).toBeUndefined();
    expect(r.blendedRate).toBeUndefined();
    expect(r.issues).toContain("No kWh figure was read.");
  });

  it("flags low confidence, a wrong document, and an implausible rate", () => {
    const low = readBillReply(JSON.stringify({ is_electricity_bill: true, kwh: 10, total_dollars: 84, days: 30, confidence: 0.4 }));
    expect(low.issues.some((i) => /not confident/.test(i))).toBe(true);
    expect(low.issues.some((i) => /outside the range/.test(i))).toBe(true);
    const notBill = readBillReply(JSON.stringify({ is_electricity_bill: false, confidence: 0.9 }));
    expect(notBill.isBill).toBe(false);
    expect(notBill.issues[0]).toMatch(/does not look like/);
  });

  it("survives a reply that is not JSON", () => {
    const r = readBillReply("I cannot read this.");
    expect(r.isBill).toBe(false);
    expect(r.issues.length).toBe(1);
  });
});
