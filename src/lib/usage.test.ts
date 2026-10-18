import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID } from "./devices";
import { contextForBuildingType, typicalHoursPerDay, typicalUse } from "./usage";
import { scoreObservation } from "./energy";
import { assessEfficiency, summarizeEfficiency } from "./efficiency";
import { effectiveRate, marginalTierRate, pickTariff, tariffPenalty, type UrdbItem } from "./tariff";
import { REGIONS, US_AVERAGE, regionRate } from "./grid";
import { DEFAULT_SETTINGS, type AuditSettings, type Offender } from "./types";

const home: AuditSettings = { ...DEFAULT_SETTINGS, usageContext: "home", occupiedHoursPerYear: 5300, unoccupiedHoursPerYear: 3460 };
const school: AuditSettings = { ...DEFAULT_SETTINGS, usageContext: "school", occupiedHoursPerYear: 1720, unoccupiedHoursPerYear: 7040 };

describe("typical use", () => {
  it("runs a home light a few hours a day, not around the clock", () => {
    const light = CATALOG_BY_ID["downlight"];
    expect(typicalHoursPerDay(light, "home", 5300)).toBe(3);
    const u = typicalUse(light, 12, "home", 5300);
    // 12 W for 3 h/day is ~13 kWh a year - about $2, not $127.
    expect(u.kwhPerYear).toBeCloseTo((12 * 3 * 365) / 1000, 6);
  });

  it("ties school lighting to the building's occupied hours", () => {
    const light = CATALOG_BY_ID["ceiling_light"];
    expect(typicalHoursPerDay(light, "school", 1720)).toBeCloseTo((0.9 * 1720) / 365, 6);
    expect(typicalHoursPerDay(light, "school", 3000)).toBeGreaterThan(typicalHoursPerDay(light, "school", 1720));
  });

  it("gives a microwave ten minutes a day plus its clock the rest", () => {
    const mw = CATALOG_BY_ID["microwave"];
    const u = typicalUse(mw, mw.wattsOn, "home", 5300);
    const expected = (0.17 * 365 * mw.wattsOn + (8760 - 0.17 * 365) * mw.wattsStandby) / 1000;
    expect(u.kwhPerYear).toBeCloseTo(expected, 6);
  });

  it("runs a fridge all year at its duty cycle", () => {
    const fridge = CATALOG_BY_ID["fridge"];
    expect(typicalHoursPerDay(fridge, "home", 5300)).toBe(24);
  });

  it("puts both numbers on every offender: left on, and typical", () => {
    const o = scoreObservation({ device: "lamp", count: 1, state: "on", categoryId: "downlight" }, home, "Bedroom", 0)!;
    expect(o.typicalCostPerYear).toBeGreaterThan(0);
    expect(o.typicalCostPerYear!).toBeLessThan(o.costPerYear);
    expect(o.typicalHoursPerDay).toBe(3);
  });

  it("reads the setting from the building type", () => {
    expect(contextForBuildingType("k12")).toBe("school");
    expect(contextForBuildingType("home")).toBe("home");
    expect(contextForBuildingType("office")).toBe("office");
  });
});

describe("efficiency", () => {
  const offender = (over: Partial<Offender>): Offender =>
    scoreObservation({ device: "x", count: 1, state: "on", categoryId: "downlight", ...over } as never, home, "Room", 0)!;

  it("calls a halogen downlight inefficient and prices the LED swap", () => {
    const o = offender({ device: "halogen downlight", tech: "halogen" } as Partial<Offender>);
    const a = assessEfficiency(o, home);
    expect(a.tech).toBe("halogen");
    expect(a.grade).toBe("F");
    expect(a.verdict).toBe("replace");
    expect(a.replace!.paybackYears).toBeLessThan(2);
  });

  it("calls an efficient LED left on a habit problem, not a hardware one", () => {
    const o = offender({ tech: "LED" } as Partial<Offender>);
    const a = assessEfficiency(o, home);
    expect(a.grade).toBe("A");
    expect(a.verdict).toBe("habit");
  });

  it("flags standby draw on a sleeping monitor", () => {
    const o = scoreObservation({ device: "monitor", count: 2, state: "standby", categoryId: "monitor", tech: "LED" }, school, "Lab", 0)!;
    expect(assessEfficiency(o, school).verdict).toBe("standby");
  });

  it("grades a CRT harshly from the technology alone", () => {
    const o = scoreObservation({ device: "monitor", count: 1, state: "on", categoryId: "monitor", tech: "CRT" }, school, "Lab", 0)!;
    const a = assessEfficiency(o, school);
    expect(a.grade).toBe("F");
    expect(a.assumed).toBe(false);
  });

  it("says when a grade rests on a typical unit", () => {
    const o = scoreObservation({ device: "monitor", count: 1, state: "on", categoryId: "monitor" }, school, "Lab", 0)!;
    expect(assessEfficiency(o, school).assumed).toBe(true);
  });

  it("splits an audit into replace, habits and fine", () => {
    const os = [
      offender({ tech: "halogen" } as Partial<Offender>),
      offender({ tech: "LED" } as Partial<Offender>),
    ];
    const s = summarizeEfficiency(os, home);
    expect(s.replace).toHaveLength(1);
    expect(s.habit).toHaveLength(1);
    expect(s.replaceSavings).toBeGreaterThan(0);
  });
});

describe("tariffs", () => {
  const tiers = [
    { max: 300, rate: 0.04, adj: 0.06 },
    { max: 900, rate: 0.05, adj: 0.06 },
    { rate: 0.1, adj: 0.06 },
  ];

  it("takes the tier a typical month reaches", () => {
    expect(marginalTierRate(tiers, 900)).toBeCloseTo(0.11, 6);
    expect(marginalTierRate(tiers, 1200)).toBeCloseTo(0.16, 6);
  });

  it("weights time-of-use periods by hour across the year", () => {
    const peakHours = Array.from({ length: 24 }, (_, h) => (h >= 16 && h < 21 ? 1 : 0));
    const item: UrdbItem = {
      energyratestructure: [[{ rate: 0.1 }], [{ rate: 0.4 }]],
      energyweekdayschedule: Array(12).fill(peakHours),
      energyweekendschedule: Array(12).fill(Array(24).fill(0)),
    };
    // 5 peak hours on 5 of 7 days.
    expect(effectiveRate(item, "residential")).toBeCloseTo(0.1 + 0.3 * (5 / 24) * (5 / 7), 6);
  });

  it("picks the ordinary current tariff over pilots, TOU options and expired ones", () => {
    const now = 1_800_000_000;
    const items: UrdbItem[] = [
      { name: "Residential Time-of-Use Pilot", startdate: now - 10, energyratestructure: [tiers] },
      { name: "Residential", startdate: now - 1e8, enddate: now - 5, energyratestructure: [[{ rate: 0.5 }]] },
      { name: "Residential", startdate: now - 100, energyratestructure: [tiers], fixedchargefirstmeter: 15, fixedchargeunits: "$/month" },
    ];
    const t = pickTariff(items, "residential", now)!;
    expect(t.name).toBe("Residential");
    expect(t.ratePerKwh).toBeCloseTo(0.11, 4);
    expect(t.fixedMonthly).toBe(15);
    expect(tariffPenalty("Residential - Outside Austin", "residential")).toBeGreaterThan(tariffPenalty("Residential", "residential"));
  });

  it("has a residential and a commercial price for every state", () => {
    expect(REGIONS).toHaveLength(51);
    for (const r of [...REGIONS, US_AVERAGE]) {
      expect(regionRate(r, "residential")).toBeGreaterThan(0.05);
      expect(regionRate(r, "commercial")).toBeGreaterThan(0.05);
    }
  });
});
