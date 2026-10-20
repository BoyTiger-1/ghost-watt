// Ghosty's promise is that it never hands back a number the scan doesn't
// support. These pin that down, along with the rules it falls back on.

import { describe, expect, it } from "vitest";
import { buildPrompt, contextKey, extractJson, rulesReport, validateReport, type GhostyContext } from "./ghosty";

const ctx: GhostyContext = {
  place: "school",
  buildingName: "Lincoln Middle",
  ratePerKwh: 0.13,
  emptyHoursPerYear: 6800,
  rooms: ["Room 214", "Lab 108"],
  totals: { annual: 1500, wasted: 1017, recoverable: 966, co2Kg: 2740 },
  devices: [
    { label: "Computer monitor", count: 30, state: "on", room: "Lab 108", wattsEach: 30, wastePerYear: 796, fix: "Smart power strips", fixCost: 60, savingsPerYear: 756, paybackMonths: 1, confidence: "high" },
    { label: "Projector", count: 1, state: "standby", room: "Room 214", wattsEach: 5, wastePerYear: 221, fix: "Auto-off timer", fixCost: 40, savingsPerYear: 210, paybackMonths: 2.3, confidence: "low" },
  ],
  moves: [
    { title: "Turn on auto-sleep", device: "Computer monitor", room: "Lab 108", cost: 0, savingsPerYear: 400, paybackMonths: null },
    { title: "Add an auto-off timer", device: "Projector", room: "Room 214", cost: 40, savingsPerYear: 210, paybackMonths: 2.3 },
  ],
};

describe("validateReport", () => {
  it("keeps savings the scan supports and drops ones it cannot", () => {
    const r = validateReport(
      {
        headline: "The lab's monitors are most of the waste.",
        insights: [
          { kind: "quick_win", title: "Strips in the lab", detail: "Lab 108 monitors.", savings: 756 },
          { kind: "upgrade", title: "Made up", detail: "A huge number.", savings: 50000 },
          { kind: "nonsense", title: "Odd kind", detail: "Kind is unknown.", savings: -3 },
        ],
        checklist: ["Switch off the monitors", ""],
        answer: null,
      },
      ctx,
      "test-model",
    );
    expect(r).not.toBeNull();
    expect(r!.insights.map((i) => i.savings)).toEqual([756, null, null]);
    expect(r!.insights[2].kind).toBe("quick_win");
    expect(r!.checklist).toEqual(["Switch off the monitors"]);
    expect(r!.source).toBe("ai");
  });

  it("rejects a reply with no headline", () => {
    expect(validateReport({ insights: [] }, ctx)).toBeNull();
    expect(validateReport("nope", ctx)).toBeNull();
  });

  it("strips control characters and caps lengths", () => {
    const r = validateReport({ headline: "a\u0000b" + "x".repeat(500), insights: [], checklist: [], answer: null }, ctx);
    expect(r!.headline).not.toMatch(/\u0000/);
    expect(r!.headline.length).toBeLessThanOrEqual(220);
  });
});

describe("rulesReport", () => {
  it("leads with the dominant device and puts free moves first", () => {
    const r = rulesReport(ctx);
    expect(r.source).toBe("rules");
    expect(r.headline).toMatch(/Lab 108/);
    expect(r.insights[0].kind).toBe("habit");
    expect(r.insights[0].savings).toBe(400);
    expect(r.checklist[0]).toMatch(/monitor/i);
  });

  it("only quotes figures from the data", () => {
    const r = rulesReport(ctx, "what first?");
    const allowed = new Set([796, 756, 221, 210, 400, 40, 60, 1017, 966]);
    for (const i of r.insights) if (i.savings !== null) expect(allowed.has(i.savings)).toBe(true);
    expect(r.answer).toMatch(/\$796/);
    expect(rulesReport(ctx, "What can I do with $50?").answer).toMatch(/auto-sleep/);
    expect(rulesReport(ctx, "Write a note to our principal").answer).toMatch(/^Hi,/);
  });

  it("says so when nothing is wasted", () => {
    const r = rulesReport({ ...ctx, devices: [], moves: [], totals: { annual: 0, wasted: 0, recoverable: 0, co2Kg: 0 } });
    expect(r.insights).toHaveLength(0);
    expect(r.headline).toMatch(/Nothing/);
  });
});

describe("helpers", () => {
  it("pulls JSON out of fenced or chatty replies", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Sure!\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson("no json here")).toBeNull();
  });

  it("keys the cache on figures and question", () => {
    expect(contextKey(ctx)).toBe(contextKey({ ...ctx }));
    expect(contextKey(ctx)).not.toBe(contextKey(ctx, "why?"));
    expect(contextKey(ctx)).not.toBe(contextKey({ ...ctx, totals: { ...ctx.totals, wasted: 1 } }));
  });

  it("puts the question and the data in the prompt", () => {
    const p = buildPrompt(ctx, "Write a note");
    expect(p).toContain("Write a note");
    expect(p).toContain("Lincoln Middle");
    expect(buildPrompt(ctx)).toContain("set answer to null");
  });
});
