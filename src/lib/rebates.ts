// Rebates for the fixes a scan recommends.
//
// Homes: real programs and amounts from Rewiring America's incentives API (free,
// covers state, utility and local programs; deepest in the states it fully
// covers). It is built for household electrification, so only devices that map
// onto its items (heaters, AC, water heaters, dryers, stoves, EV chargers,
// thermostats) get matched; the rest still get the general links below.
// Schools and offices: no free database covers commercial rebates (DSIRE, the
// national one, is now a paid subscription), so these are exact, pre-filled
// links to where they are published: the serving utility, the state's DSIRE
// listing and ENERGY STAR's finder. No amount is ever made up.

import type { DeviceCategory } from "./types";

/** Rewiring America item ids, the subset that a scanned device can lead to. */
export type RebateItem =
  | "smart_thermostat"
  | "ducted_heat_pump"
  | "ductless_heat_pump"
  | "heat_pump_water_heater"
  | "heat_pump_clothes_dryer"
  | "electric_stove"
  | "electric_vehicle_charger"
  | "efficiency_rebates"
  | "energy_audit";

export const ITEM_LABEL: Record<RebateItem, string> = {
  smart_thermostat: "Smart thermostat",
  ducted_heat_pump: "Heat pump (ducted)",
  ductless_heat_pump: "Heat pump (ductless mini-split)",
  heat_pump_water_heater: "Heat pump water heater",
  heat_pump_clothes_dryer: "Heat pump clothes dryer",
  electric_stove: "Induction or electric stove",
  electric_vehicle_charger: "EV charger",
  efficiency_rebates: "General efficiency upgrades",
  energy_audit: "Home energy audit",
};

/** Which rebate items a scanned device could use. */
export function itemsFor(cat: Pick<DeviceCategory, "id" | "group" | "icon" | "thermostatic">): RebateItem[] {
  const id = cat.id;
  if (/water_heater/.test(id)) return ["heat_pump_water_heater"];
  if (/dryer/.test(id) || id === "washer_dryer") return ["heat_pump_clothes_dryer"];
  if (/stove|range|cooktop|oven/.test(id) && !/microwave|toaster|pizza|commercial/.test(id)) return ["electric_stove"];
  if (/ev_charger|car_charger/.test(id)) return ["electric_vehicle_charger"];
  if (cat.icon === "heater" || id === "space_heater") return ["ductless_heat_pump", "smart_thermostat"];
  if (cat.group === "hvac" && cat.thermostatic) return ["smart_thermostat", "ductless_heat_pump", "ducted_heat_pump"];
  return [];
}

/** A program from the incentives API, trimmed to what the panel shows. */
export interface Incentive {
  program: string;
  authority?: string;
  authorityType: string;
  url: string;
  items: string[];
  /** In words: "$700", "Up to $840", "30% of cost, up to $1,000". */
  amount: string;
  /** The program's own one-line description, when it has one. */
  detail?: string;
  /** For sorting: the most this could be worth, dollars (0 when unknown or a percentage with no cap). */
  value: number;
  how: string;
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

const HOW: Record<string, string> = {
  rebate: "rebate after you buy",
  pos_rebate: "discount at checkout",
  tax_credit: "tax credit",
  account_credit: "credit on your bill",
  assistance_program: "free for qualifying homes",
  performance_rebate: "rebate based on savings",
};

/** Normalise one incentive from the API. Returns null for anything unusable or paused. */
export function normaliseIncentive(raw: unknown, authorities: Record<string, { name?: string }> = {}): Incentive | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.paused === true) return null;
  const program = typeof r.program === "string" ? r.program.slice(0, 120) : "";
  const url = typeof r.program_url === "string" && /^https:\/\//.test(r.program_url) ? r.program_url : "";
  if (!program || !url) return null;
  const a = (r.amount ?? {}) as Record<string, unknown>;
  const n = Number(a.number);
  const max = Number(a.maximum);
  let amount = "Amount varies";
  let value = 0;
  if (a.type === "dollar_amount" && n > 0) {
    amount = Number.isFinite(max) && max > n ? `${money(n)}, up to ${money(max)}` : money(n);
    value = Number.isFinite(max) && max > n ? max : n;
  } else if (a.type === "percent" && n > 0) {
    amount = `${Math.round(n * 100)}% of the cost${Number.isFinite(max) && max > 0 ? `, up to ${money(max)}` : ""}`;
    value = Number.isFinite(max) ? max : 0;
  } else if (a.type === "dollars_per_unit" && n > 0) {
    amount = `${money(n)} per ${typeof a.unit === "string" ? a.unit.replace(/_/g, " ") : "unit"}${Number.isFinite(max) && max > 0 ? `, up to ${money(max)}` : ""}`;
    value = Number.isFinite(max) ? max : 0;
  }
  const methods = Array.isArray(r.payment_methods) ? r.payment_methods.filter((m): m is string => typeof m === "string") : [];
  return {
    program,
    authority: typeof r.authority === "string" ? (authorities[r.authority]?.name ?? undefined) : undefined,
    detail: typeof r.short_description === "string" ? r.short_description.slice(0, 200) : undefined,
    authorityType: typeof r.authority_type === "string" ? r.authority_type : "other",
    url,
    items: Array.isArray(r.items) ? r.items.filter((i): i is string => typeof i === "string") : [],
    amount,
    value,
    how: methods.map((m) => HOW[m]).filter(Boolean).join(" or ") || "see the program",
  };
}

/** Where commercial (school, office) rebates are published, pre-filled for this place. */
export function commercialLinks(where: { zip?: string | null; state?: string | null; utility?: string | null }): { label: string; href: string; note: string }[] {
  const out: { label: string; href: string; note: string }[] = [];
  // Rate databases tack on "(Utility Company)" and the like; the search wants the name.
  const utility = where.utility?.replace(/\s*\([^)]*\)\s*/g, " ").trim() || null;
  if (utility) {
    out.push({
      label: `${utility} business rebates`,
      href: `https://duckduckgo.com/?q=${encodeURIComponent(`${utility} business rebates lighting controls occupancy sensors`)}`,
      note: "Your utility usually pays the most for lighting, sensors and controls.",
    });
  }
  if (where.zip || where.state) {
    out.push({
      label: "Programs near you (DSIRE)",
      href: where.zip ? `https://programs.dsireusa.org/system/program?zipcode=${where.zip}` : `https://programs.dsireusa.org/system/program?state=${where.state}`,
      note: "The national database of state and utility incentives, filtered to this area.",
    });
  }
  out.push({
    label: "ENERGY STAR rebate finder",
    href: where.zip ? `https://www.energystar.gov/rebate-finder?zip_code_filter=${where.zip}` : "https://www.energystar.gov/rebate-finder",
    note: "Rebates on certified products by ZIP code.",
  });
  return out;
}
