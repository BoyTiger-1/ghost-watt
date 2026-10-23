// The heating-and-cooling interaction term.
//
// This is the largest correction the cost model applies that is not visible in
// watts x hours x rate, so it is also the easiest one to get wrong in a way
// nobody notices. These tests pin the two things that matter: that it is the
// identity until the building has actually said how it is conditioned, and that
// its sign follows the climate rather than the other way round.

import { describe, expect, it } from "vitest";
import { CLIMATE_BY_STATE, climateOf, describeClimate, seasons, US_CLIMATE } from "./climate";
import { DEFAULT_COOLING_COP, blendedInteraction, heatToSpace, hvacInteraction } from "./thermal";
import { CATALOG_BY_ID } from "./devices";
import { scoreObservation } from "./energy";
import { DEFAULT_SETTINGS, type AuditSettings } from "./types";

const monitor = CATALOG_BY_ID["monitor"];
const rtu = CATALOG_BY_ID["rtu"];
const exterior = CATALOG_BY_ID["exterior_light"];
const fridge = CATALOG_BY_ID["fridge"];

describe("climate", () => {
  it("covers every state and the District", () => {
    expect(Object.keys(CLIMATE_BY_STATE)).toHaveLength(51);
    for (const [code, c] of Object.entries(CLIMATE_BY_STATE)) {
      expect(c.hdd65, code).toBeGreaterThanOrEqual(0);
      expect(c.cdd65, code).toBeGreaterThanOrEqual(0);
      // Nothing in the US is both a Fargo winter and a Phoenix summer.
      expect(c.hdd65 + c.cdd65, code).toBeLessThan(12000);
    }
  });

  it("splits the year into heating, cooling and neither, adding to one", () => {
    for (const c of [US_CLIMATE, ...Object.values(CLIMATE_BY_STATE)]) {
      const s = seasons(c);
      expect(s.heating + s.cooling + s.neither).toBeCloseTo(1, 9);
      expect(s.heating).toBeGreaterThanOrEqual(0);
      expect(s.cooling).toBeGreaterThanOrEqual(0);
    }
  });

  it("reproduces the US average anchors it was fitted to", () => {
    // 4,000 HDD is a heating season of roughly October to April; 1,400 CDD a
    // cooling season of roughly May to September.
    const s = seasons(US_CLIMATE);
    expect(s.heating).toBeCloseTo(0.58, 2);
    expect(s.cooling).toBeCloseTo(0.33, 2);
  });

  it("knows Seattle heats and Miami cools", () => {
    expect(seasons(climateOf("WA")!).heating).toBeGreaterThan(seasons(climateOf("WA")!).cooling * 5);
    expect(seasons(climateOf("FL")!).cooling).toBeGreaterThan(seasons(climateOf("FL")!).heating * 5);
    expect(describeClimate(climateOf("FL")!)).toMatch(/Cooling-dominated/);
    expect(describeClimate(climateOf("ND")!)).toMatch(/Heating-dominated/);
  });

  it("has nothing to say about a place it does not know", () => {
    expect(climateOf(undefined)).toBeNull();
    expect(climateOf("ZZ")).toBeNull();
  });
});

describe("hvacInteraction", () => {
  it("is the identity until the building says how it is conditioned", () => {
    // The whole point: a correction nobody can check is worse than no correction.
    expect(hvacInteraction(monitor, {}).factor).toBe(1);
    expect(hvacInteraction(monitor, {}).known).toBe(false);
    expect(hvacInteraction(monitor, { regionCode: "AZ" }).factor).toBe(1);
    expect(hvacInteraction(monitor, { cooling: "electric" }).factor).toBe(1);
  });

  it("charges a cooled building for removing the heat, at one over the COP", () => {
    const i = hvacInteraction(monitor, { regionCode: "AZ", cooling: "electric", heating: "gas" });
    expect(i.known).toBe(true);
    expect(i.factor).toBeGreaterThan(1);
    const cooling = seasons(climateOf("AZ")!).cooling;
    expect(i.coolingPenalty).toBeCloseTo(cooling / DEFAULT_COOLING_COP, 9);
    expect(i.factor).toBeCloseTo(1 + cooling / DEFAULT_COOLING_COP, 9);
  });

  it("gives nothing back for gas heat, because the saving is therms not kilowatt-hours", () => {
    const gas = hvacInteraction(monitor, { regionCode: "ND", cooling: "electric", heating: "gas" });
    expect(gas.heatingCredit).toBe(0);
    expect(gas.factor).toBeGreaterThan(1);
  });

  it("gives resistance heat a bigger credit than a heat pump", () => {
    const ctx = { regionCode: "ND", cooling: "electric" } as const;
    const resistance = hvacInteraction(monitor, { ...ctx, heating: "electric-resistance" });
    const pump = hvacInteraction(monitor, { ...ctx, heating: "heat-pump" });
    expect(resistance.heatingCredit).toBeGreaterThan(pump.heatingCredit);
    expect(resistance.factor).toBeLessThan(pump.factor);
    expect(resistance.factor).toBeLessThan(1);
  });

  it("stays inside a believable range for every state and every plant", () => {
    for (const code of Object.keys(CLIMATE_BY_STATE)) {
      for (const heating of ["electric-resistance", "heat-pump", "gas", "none"] as const) {
        for (const cooling of ["electric", "none"] as const) {
          const f = hvacInteraction(monitor, { regionCode: code, heating, cooling }).factor;
          // Never free, never doubled. A correction outside this is a bug, not a climate.
          expect(f, `${code} ${heating}/${cooling}`).toBeGreaterThanOrEqual(0.6);
          expect(f, `${code} ${heating}/${cooling}`).toBeLessThan(1.3);
        }
      }
    }
  });

  it("does not charge the cooling plant for its own heat", () => {
    // The single worst double-count available here: an air conditioner's
    // consumption already *is* the conditioning.
    expect(heatToSpace(rtu)).toBe(0);
    const i = hvacInteraction(rtu, { regionCode: "TX", cooling: "electric", heating: "gas" });
    expect(i.factor).toBe(1);
    expect(i.known).toBe(true);
    expect(i.basis).toMatch(/already the conditioning/);
  });

  it("leaves a device whose heat goes outdoors alone", () => {
    expect(heatToSpace(exterior)).toBe(0);
    expect(hvacInteraction(exterior, { regionCode: "TX", cooling: "electric", heating: "gas" }).factor).toBe(1);
  });

  it("counts a fridge's condenser heat in full", () => {
    // In steady state a refrigerator rejects exactly the electricity it drew into
    // the room: the food inside is already cold.
    expect(heatToSpace(fridge)).toBe(1);
  });

  it("blends across an audit by cost, not by line count", () => {
    const ctx = { regionCode: "TX", cooling: "electric", heating: "gas" } as const;
    const one = hvacInteraction(monitor, ctx).factor;
    const blended = blendedInteraction(
      [
        { cat: monitor, costPerYear: 1000 },
        { cat: rtu, costPerYear: 0 },
      ],
      ctx,
    );
    expect(blended).toBeCloseTo(one, 9);
    expect(blendedInteraction([], ctx)).toBe(1);
  });
});

describe("the interaction reaching a costed line", () => {
  const base: AuditSettings = { ...DEFAULT_SETTINGS, unoccupiedHoursPerYear: 5000, ratePerKwh: 0.2 };
  const obs = { device: "monitor", count: 1, state: "on" as const, categoryId: "monitor" };

  it("changes nothing without a stated plant, so every older figure stands", () => {
    const o = scoreObservation(obs, base, "r", 0)!;
    expect(o.hvacFactor).toBeUndefined();
    expect(o.costPerYear).toBeCloseTo((30 / 1000) * 5000 * 0.2, 9);
  });

  it("scales cost and carbon together once the plant is known", () => {
    const hot: AuditSettings = { ...base, regionCode: "TX", cooling: "electric", heating: "gas" };
    const o = scoreObservation(obs, hot, "r", 0)!;
    const f = hvacInteraction(monitor, hot).factor;
    expect(o.hvacFactor).toBeCloseTo(f, 9);
    expect(o.costPerYear).toBeCloseTo((30 / 1000) * 5000 * 0.2 * f, 9);
    expect(o.co2KgPerYear).toBeCloseTo((30 / 1000) * 5000 * base.co2PerKwh * f, 9);
    // The band moves with it, so the range stays honest about the same quantity.
    expect(o.costLowPerYear).toBeLessThan(o.costPerYear);
    expect(o.costHighPerYear).toBeGreaterThan(o.costPerYear);
  });

  it("costs the same monitor more in Phoenix than in Fargo", () => {
    const az = scoreObservation(obs, { ...base, regionCode: "AZ", cooling: "electric", heating: "heat-pump" }, "r", 0)!;
    const nd = scoreObservation(obs, { ...base, regionCode: "ND", cooling: "electric", heating: "heat-pump" }, "r", 0)!;
    expect(az.costPerYear).toBeGreaterThan(nd.costPerYear);
  });
});
