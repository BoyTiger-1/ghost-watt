// Class mode takes input from anyone who has a six-character code, and renders it on
// a page other students are looking at. That makes sanitizeContribution the only
// place in this app where a hostile input actually matters, so it gets tested like
// it matters.

import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  MAX_NAME_LEN,
  MAX_OFFENDERS_PER_CONTRIBUTION,
  areaSummaries,
  classTotals,
  isValidCode,
  makeCode,
  mergeContributions,
  normalizeCode,
  sanitizeContribution,
  sanitizeOffender,
  type Contribution,
} from "./classroom";
import type { Offender } from "./types";

function offender(patch: Partial<Offender> = {}): Offender {
  return {
    id: "o1",
    categoryId: "monitor",
    label: "Computer monitor",
    icon: "monitor",
    count: 3,
    state: "on",
    perUnitWatts: 30,
    totalWatts: 90,
    kwhPerYear: 500,
    costPerYear: 100,
    co2KgPerYear: 200,
    costLowPerYear: 80,
    costHighPerYear: 120,
    group: "display",
    action: {
      label: "Smart strip",
      type: "powerstrip",
      cost: 60,
      savingsFraction: 0.95,
      note: "test fixture",
    },
    fixCost: 60,
    annualSavings: 95,
    paybackMonths: 7.6,
    confidence: "high",
    source: "test",
    ...patch,
  };
}

function contribution(patch: Partial<Contribution> = {}): Contribution {
  return {
    id: "c1",
    area: "Room 214",
    contributor: "Sam",
    at: new Date().toISOString(),
    mode: "live",
    offenders: [offender()],
    ...patch,
  };
}

describe("session codes", () => {
  it("makes codes of the right length from an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const c = makeCode();
      expect(c).toHaveLength(CODE_LENGTH);
      // No O/0, I/1 or L: a code gets read aloud across a room.
      expect(c).not.toMatch(/[O0I1L]/);
      expect(isValidCode(c)).toBe(true);
    }
  });

  it("normalizes what a person actually types", () => {
    expect(normalizeCode(" abc-234 ")).toBe("ABC234");
    expect(normalizeCode("abc 234 extra")).toBe("ABC234");
  });

  it("rejects codes of the wrong shape or alphabet", () => {
    expect(isValidCode("ABC23")).toBe(false);
    expect(isValidCode("")).toBe(false);
    expect(isValidCode("ABC01L")).toBe(false); // excluded characters
  });
});

describe("mergeContributions", () => {
  it("sums a category across areas and records where it was found", () => {
    const rows = mergeContributions([
      contribution({ area: "Room 214" }),
      contribution({ id: "c2", area: "Room 220", contributor: "Ava" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(6);
    expect(rows[0].costPerYear).toBe(200);
    expect(rows[0].areas).toEqual(["Room 214", "Room 220"]);
  });

  it("does not list the same area twice for one category", () => {
    const rows = mergeContributions([
      contribution({ offenders: [offender(), offender({ id: "o2" })] }),
    ]);
    expect(rows[0].areas).toEqual(["Room 214"]);
    expect(rows[0].count).toBe(6);
  });

  it("ranks by dollars", () => {
    const rows = mergeContributions([
      contribution({
        offenders: [
          offender({ categoryId: "monitor", costPerYear: 100 }),
          offender({ categoryId: "fridge", label: "Fridge", costPerYear: 400 }),
        ],
      }),
    ]);
    expect(rows.map((r) => r.categoryId)).toEqual(["fridge", "monitor"]);
  });

  it("returns nothing for an empty session", () => {
    expect(mergeContributions([])).toEqual([]);
  });
});

describe("classTotals", () => {
  it("counts distinct areas and people, not submissions", () => {
    const t = classTotals([
      contribution({ area: "Room 214", contributor: "Sam" }),
      contribution({ id: "c2", area: "room 214 ", contributor: "SAM" }),
      contribution({ id: "c3", area: "Room 220", contributor: "Ava" }),
    ]);
    expect(t.areaCount).toBe(2);
    expect(t.contributorCount).toBe(2);
  });

  it("reports the share read by a model rather than estimated", () => {
    expect(
      classTotals([
        contribution({ mode: "live" }),
        contribution({ id: "c2", mode: "fallback" }),
      ]).liveShare,
    ).toBe(0.5);
  });

  it("does not divide by zero on an empty session", () => {
    const t = classTotals([]);
    expect(t.liveShare).toBe(0);
    expect(t.costPerYear).toBe(0);
  });
});

describe("areaSummaries", () => {
  it("puts the most expensive area first", () => {
    const rows = areaSummaries([
      contribution({ area: "Cheap", offenders: [offender({ costPerYear: 10 })] }),
      contribution({ id: "c2", area: "Costly", offenders: [offender({ costPerYear: 900 })] }),
    ]);
    expect(rows[0].area).toBe("Costly");
    expect(rows[0].deviceCount).toBe(3);
  });
});

describe("sanitizeOffender", () => {
  it("clamps a hostile cost to something a building could plausibly spend", () => {
    // Left unbounded, one submission would dominate a ranked list thirty other
    // people are looking at.
    const o = sanitizeOffender({ categoryId: "x", costPerYear: 1e12, count: 1e9 })!;
    expect(o.costPerYear).toBeLessThanOrEqual(250000);
    expect(o.count).toBeLessThanOrEqual(2000);
  });

  it("turns non-numbers into zero rather than NaN", () => {
    const o = sanitizeOffender({ categoryId: "x", costPerYear: "lots", kwhPerYear: null })!;
    expect(o.costPerYear).toBe(0);
    expect(o.kwhPerYear).toBe(0);
  });

  it("refuses negative values", () => {
    const o = sanitizeOffender({ categoryId: "x", costPerYear: -500 })!;
    expect(o.costPerYear).toBe(0);
  });

  it("strips control characters out of text that will be rendered", () => {
    const o = sanitizeOffender({
      categoryId: "x",
      label: "Mon\u0000itor\u001B[31m\u007F",
    })!;
    expect(o.label).toBe("Monitor[31m");
  });

  it("truncates long text", () => {
    const o = sanitizeOffender({ categoryId: "x", label: "z".repeat(500) })!;
    expect(o.label.length).toBeLessThanOrEqual(80);
  });

  it("falls back to a known value for an unrecognised state or confidence", () => {
    const o = sanitizeOffender({ categoryId: "x", state: "exploding", confidence: "certain" })!;
    expect(o.state).toBe("on");
    expect(o.confidence).toBe("medium");
  });

  it("rejects a row with no category at all", () => {
    expect(sanitizeOffender({ label: "something" })).toBeNull();
    expect(sanitizeOffender(null)).toBeNull();
    expect(sanitizeOffender("a string")).toBeNull();
  });
});

describe("sanitizeContribution", () => {
  it("accepts a well-formed submission", () => {
    const c = sanitizeContribution(
      { area: "Room 214", contributor: "Sam", mode: "live", offenders: [offender()] },
      "id-1",
    )!;
    expect(c.area).toBe("Room 214");
    expect(c.offenders).toHaveLength(1);
    expect(c.mode).toBe("live");
  });

  it("rejects a submission with no usable rows", () => {
    expect(sanitizeContribution({ area: "X", offenders: [] }, "id")).toBeNull();
    expect(sanitizeContribution({ area: "X", offenders: [{ nope: 1 }] }, "id")).toBeNull();
    expect(sanitizeContribution({ area: "X" }, "id")).toBeNull();
    expect(sanitizeContribution(null, "id")).toBeNull();
  });

  it("caps how many rows one person can submit", () => {
    const many = Array.from({ length: 500 }, () => offender());
    const c = sanitizeContribution({ area: "X", offenders: many }, "id")!;
    expect(c.offenders.length).toBe(MAX_OFFENDERS_PER_CONTRIBUTION);
  });

  it("truncates names instead of rejecting them", () => {
    const c = sanitizeContribution(
      { area: "a".repeat(200), contributor: "b".repeat(200), offenders: [offender()] },
      "id",
    )!;
    expect(c.area.length).toBe(MAX_NAME_LEN);
    expect(c.contributor.length).toBe(MAX_NAME_LEN);
  });

  it("names the anonymous rather than leaving a blank row", () => {
    const c = sanitizeContribution({ offenders: [offender()] }, "id")!;
    expect(c.area).toBe("Unnamed area");
    expect(c.contributor).toBe("Anonymous");
  });

  it("timestamps server-side and ignores a client-supplied time", () => {
    // Otherwise a contributor could pin their scan to the top of a sorted list.
    const c = sanitizeContribution(
      { area: "X", at: "1999-01-01T00:00:00.000Z", offenders: [offender()] },
      "id",
    )!;
    expect(new Date(c.at).getFullYear()).toBeGreaterThan(2020);
  });

  it("uses the id the server generated, not one the client sent", () => {
    const c = sanitizeContribution({ id: "spoofed", area: "X", offenders: [offender()] }, "real")!;
    expect(c.id).toBe("real");
  });

  it("treats an unrecognised mode as an estimate, not a live reading", () => {
    // Claiming "live" is a credibility claim, so the default has to be the humble one.
    const c = sanitizeContribution({ area: "X", mode: "verified", offenders: [offender()] }, "id")!;
    expect(c.mode).toBe("fallback");
  });
});
