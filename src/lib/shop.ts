// Where to buy a fix, from stores people already trust.
//
// Live "cheapest price" needs each retailer's own API, and none is open: Amazon's
// requires an Associates account with qualifying sales, Walmart's an approved
// affiliate account, and Target has no public one. Scraping their pages breaks
// their terms. So this builds the exact search on each big, known retailer's
// own site - never a marketplace link from somewhere else - and shows the
// app's typical price for the item so a person knows what a fair price looks like.
// On Amazon the search is filtered to items sold by Amazon.com itself, which
// keeps third-party sellers (where most knock-offs live) out of the results.

import type { RecommendedAction } from "./types";

export interface Retailer {
  id: "amazon" | "walmart" | "target" | "homedepot";
  name: string;
  /** Search URL for a query on the retailer's own site. */
  url: (q: string) => string;
  /** One line on how the link keeps to the retailer itself. */
  note: string;
}

const enc = (q: string) => encodeURIComponent(q.trim());

export const RETAILERS: Retailer[] = [
  {
    id: "amazon",
    name: "Amazon",
    // p_6:ATVPDKIKX0DER is Amazon.com as the seller.
    url: (q) => `https://www.amazon.com/s?k=${enc(q)}&rh=p_6%3AATVPDKIKX0DER`,
    note: "Filtered to items sold by Amazon.com",
  },
  { id: "walmart", name: "Walmart", url: (q) => `https://www.walmart.com/search?q=${enc(q)}`, note: "Check 'Sold by Walmart' on the listing" },
  { id: "target", name: "Target", url: (q) => `https://www.target.com/s?searchTerm=${enc(q)}`, note: "Sold and shipped by Target" },
  { id: "homedepot", name: "Home Depot", url: (q) => `https://www.homedepot.com/s/${enc(q)}`, note: "Best for sensors, timers and lighting" },
];

/**
 * What to search for to buy a fix, or null when the fix is a habit with nothing
 * to buy. The device matters for safety: a water heater runs on 240 V and needs
 * its own timer, and a space heater needs a plug rated for its full 15 A, so
 * neither is sent to an ordinary smart plug.
 */
export function fixQuery(action: Pick<RecommendedAction, "type" | "label" | "cost">, device?: { id: string; icon?: string }): string | null {
  if (action.cost <= 0) return null;
  if (device && /water_heater/.test(device.id)) return "240V water heater timer";
  if (device && (device.icon === "heater" || device.id === "space_heater") && (action.type === "remove" || action.type === "timer")) {
    return "heavy duty smart plug 15 amp";
  }
  switch (action.type) {
    case "powerstrip":
      return "smart power strip with timer";
    case "occupancy":
      return "occupancy sensor light switch";
    case "timer":
      return /photocell|dusk|outdoor/i.test(action.label) ? "outdoor photocell timer" : "smart plug with schedule";
    case "thermostat":
      return "ENERGY STAR smart thermostat";
    case "remove":
      return "smart plug with schedule";
    default:
      return null;
  }
}

/**
 * What to search for to replace a device with an efficient one, from the
 * efficiency table's "replace with" wording ("ENERGY STAR LED monitors",
 * "LED troffer retrofit kits"). Phrases about timing ("at the next refresh",
 * "when the lamp dies") are dropped from the search.
 */
export function replacementQuery(replaceWith: string): string | null {
  const q = replaceWith
    .replace(/\b(when|at|once)\b.*$/i, "")
    .replace(/^(an?|the)\s+/i, "")
    .replace(/\s+or\s+.*$/i, "")
    .trim();
  return q.length >= 3 ? q : null;
}

export function shopLinks(query: string): { retailer: Retailer; href: string }[] {
  return RETAILERS.map((retailer) => ({ retailer, href: retailer.url(query) }));
}
