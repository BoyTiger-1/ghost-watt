// Links to buy a fix go only to the big retailers' own sites, and rebate amounts
// are shown exactly as the program states them.

import { describe, expect, it } from "vitest";
import { fixQuery, replacementQuery, shopLinks } from "./shop";
import { commercialLinks, itemsFor, normaliseIncentive } from "./rebates";
import { CATALOG_BY_ID } from "./devices";

describe("where to buy", () => {
  it("only ever links to the retailers' own domains, Amazon filtered to Amazon.com as seller", () => {
    const links = shopLinks("smart power strip with timer");
    expect(links.map((l) => new URL(l.href).hostname)).toEqual(["www.amazon.com", "www.walmart.com", "www.target.com", "www.homedepot.com"]);
    expect(links[0].href).toContain("p_6%3AATVPDKIKX0DER");
    expect(links[0].href).toContain("smart%20power%20strip");
  });

  it("searches for the thing that actually fixes it, and nothing for a free habit", () => {
    expect(fixQuery({ type: "powerstrip", label: "Smart strip", cost: 25 })).toMatch(/power strip/);
    expect(fixQuery({ type: "occupancy", label: "Sensor", cost: 50 })).toMatch(/occupancy sensor/);
    expect(fixQuery({ type: "policy", label: "Shut down", cost: 0 })).toBeNull();
    // Safety: a 240 V water heater and a 1500 W heater are never sent to an ordinary smart plug.
    expect(fixQuery({ type: "timer", label: "Timer", cost: 40 }, { id: "water_heater" })).toMatch(/240V water heater timer/);
    expect(fixQuery({ type: "remove", label: "Smart plug", cost: 25 }, { id: "space_heater", icon: "heater" })).toMatch(/15 amp/);
    expect(replacementQuery("a laser projector when the lamp dies")).toBe("laser projector");
    expect(replacementQuery("LED bulbs or retrofit downlights")).toBe("LED bulbs");
    expect(replacementQuery("")).toBeNull();
  });
});

describe("rebates", () => {
  it("maps devices to the incentives that could apply", () => {
    expect(itemsFor(CATALOG_BY_ID.water_heater)).toEqual(["heat_pump_water_heater"]);
    expect(itemsFor(CATALOG_BY_ID.space_heater)).toContain("ductless_heat_pump");
    expect(itemsFor(CATALOG_BY_ID.monitor)).toEqual([]);
  });

  it("states amounts the way the program does, and drops paused or link-less programs", () => {
    const flat = normaliseIncentive({ program: "Golden State Rebates", program_url: "https://example.org/x", amount: { type: "dollar_amount", number: 700 }, payment_methods: ["rebate"], items: ["heat_pump_water_heater"], authority_type: "state" });
    expect(flat?.amount).toBe("$700");
    expect(flat?.how).toBe("rebate after you buy");
    const pct = normaliseIncentive({ program: "Credit", program_url: "https://e.org", amount: { type: "percent", number: 0.3, maximum: 1000 }, payment_methods: ["tax_credit"], items: [] });
    expect(pct?.amount).toBe("30% of the cost, up to $1,000");
    expect(pct?.value).toBe(1000);
    expect(normaliseIncentive({ program: "Old", program_url: "https://e.org", paused: true, amount: {} })).toBeNull();
    expect(normaliseIncentive({ program: "No link", program_url: "javascript:alert(1)", amount: {} })).toBeNull();
  });

  it("builds commercial rebate links for the place, pre-filled with its ZIP and utility", () => {
    const l = commercialLinks({ zip: "78701", state: "TX", utility: "Austin Energy" });
    expect(l.map((x) => new URL(x.href).hostname)).toEqual(["duckduckgo.com", "programs.dsireusa.org", "www.energystar.gov"]);
    expect(l[1].href).toContain("zipcode=78701");
    expect(l[0].label).toContain("Austin Energy");
    expect(commercialLinks({ utility: "City of X (Utility Company)" })[0].label).toBe("City of X business rebates");
  });
});
