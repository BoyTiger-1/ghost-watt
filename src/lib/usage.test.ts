import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID } from "./devices";
import { contextForBuildingType, typicalHoursPerDay, typicalUse } from "./usage";
import { scoreObservation } from "./energy";
import { assessEfficiency, summarizeEfficiency } from "./efficiency";
import { effectiveRate, marginalTierRate, pickTariff, shapedRates, tariffPenalty, type UrdbItem } from "./tariff";
import { SCHEDULE_BY_ID, isOccupiedAt } from "./schedule";
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

  // The correction that matters most for this app's headline number.
  //
  // Everything Ghost Watt calls waste happens in the hours the building is empty,
  // and the price in those hours is not the all-hours average. Which way it
  // differs is not something you can assume: it depends on where the tariff's
  // peak window falls relative to when the building is open. A school that closes
  // at four o'clock is shut through an evening peak and open through a midday one,
  // and the two cases move the waste figure in opposite directions - which is
  // exactly why this has to be computed rather than guessed at.
  describe("shaped by the hours the building is open", () => {
    const flatWeekend = Array(12).fill(Array(24).fill(0));
    const peak = (from: number, to: number): UrdbItem => ({
      energyratestructure: [[{ rate: 0.1 }], [{ rate: 0.4 }]],
      energyweekdayschedule: Array(12).fill(Array.from({ length: 24 }, (_, h) => (h >= from && h < to ? 1 : 0))),
      energyweekendschedule: flatWeekend,
    });
    const flat: UrdbItem = {
      energyratestructure: [[{ rate: 0.15 }]],
      energyweekdayschedule: flatWeekend,
      energyweekendschedule: flatWeekend,
    };
    const school = SCHEDULE_BY_ID.school.schedule;
    const occupied = (weekday: number, hour: number) => isOccupiedAt(school, weekday, hour);

    it("prices the empty hours below the average when the peak is in school hours", () => {
      // Midday peak, school open 7am-4pm: the building is open through most of the
      // peak and empty through the cheap hours, so overnight waste costs less than
      // the all-hours average said. This is the common commercial summer shape,
      // and it is where the old flat figure overstated the headline by a fifth.
      const r = shapedRates(peak(12, 18), "commercial", occupied)!;
      expect(r.occupied).toBeCloseTo(0.2333, 3);
      expect(r.unoccupied).toBeCloseTo(0.1244, 3);
      expect(r.allHours).toBeCloseTo(0.1536, 3);
      expect(r.unoccupied).toBeLessThan(r.allHours);
      expect(r.occupied).toBeGreaterThan(r.allHours);
      expect(r.periodSpread).toBeCloseTo(4, 6);
      expect(r.emptyShare).toBeCloseTo(0.732, 2);
    });

    it("prices them above it when the peak falls after the building shuts", () => {
      // Evening peak, same school: it is shut for the whole peak, so the waste it
      // leaves running overnight is billed at *more* than the average - and the
      // old flat figure was understating it. The point of computing this is that
      // the correction is not always in the flattering direction.
      const r = shapedRates(peak(16, 21), "commercial", occupied)!;
      expect(r.unoccupied).toBeGreaterThan(r.allHours);
      expect(r.occupied).toBeLessThan(r.allHours);
      expect(r.unoccupied).toBeCloseTo(0.161, 3);
    });

    it("never moves a flat tariff, which is most of them", () => {
      const r = shapedRates(flat, "commercial", occupied)!;
      expect(r.occupied).toBeCloseTo(0.15, 9);
      expect(r.unoccupied).toBeCloseTo(0.15, 9);
      expect(r.allHours).toBeCloseTo(0.15, 9);
      expect(r.periodSpread).toBe(1);
    });

    it("gives back the all-hours figure when there is no schedule to shape by", () => {
      const r = shapedRates(peak(12, 18), "commercial")!;
      expect(r.occupied).toBe(r.allHours);
      expect(r.unoccupied).toBe(r.allHours);
      expect(r.emptyShare).toBe(0);
    });

    it("invents no second price for a building that is never empty", () => {
      const always = SCHEDULE_BY_ID.always_on.schedule;
      const r = shapedRates(peak(12, 18), "commercial", (w, h) => isOccupiedAt(always, w, h))!;
      expect(r.unoccupied).toBe(r.allHours);
      expect(r.emptyShare).toBe(0);
    });

    it("keeps the all-hours average between the two, whichever way round they are", () => {
      for (const window of [
        [12, 18],
        [16, 21],
        [0, 6],
        [9, 12],
      ] as const) {
        const r = shapedRates(peak(window[0], window[1]), "commercial", occupied)!;
        const lo = Math.min(r.occupied, r.unoccupied);
        const hi = Math.max(r.occupied, r.unoccupied);
        expect(r.allHours, `${window[0]}-${window[1]}`).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(r.allHours, `${window[0]}-${window[1]}`).toBeLessThanOrEqual(hi + 1e-9);
      }
    });

    it("hangs the shaped pair off the chosen tariff", () => {
      const now = 1_800_000_000;
      const sheet = { name: "General Service", startdate: now - 100, ...peak(12, 18) };
      const t = pickTariff([sheet], "commercial", now, occupied)!;
      expect(t.unoccupiedRatePerKwh!).toBeLessThan(t.ratePerKwh);
      expect(t.occupiedRatePerKwh!).toBeGreaterThan(t.ratePerKwh);
      expect(t.periodSpread).toBe(4);
      // Without a schedule the sheet is still priced, just not split.
      const unshaped = pickTariff([sheet], "commercial", now)!;
      expect(unshaped.unoccupiedRatePerKwh).toBe(unshaped.ratePerKwh);
    });
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
