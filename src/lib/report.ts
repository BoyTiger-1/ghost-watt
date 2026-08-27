// Turning an audit into something a principal can act on.
//
// Everything else in this app answers "how much is being wasted". This answers the
// question that actually decides whether anything changes: "what do you want me to
// do on Monday, and what will it cost me". Those are different documents. A ranked
// table of eleven device categories is the right output for the person who did the
// audit and the wrong one for the person who signs the purchase order.
//
// Two structural choices carry most of the value here.
//
// First, findings split by whether they cost money. A school's capital budget is
// slow, committee-approved and usually spent; its permission to turn something off
// at night is immediate and free. Presenting both as one undifferentiated list of
// "recommendations" buries the half that can happen tonight behind the half that
// needs a requisition, and the free half is the half that builds the credibility to
// ask for the other one.
//
// Second, the caveats are generated from the audit rather than boilerplate. A brief
// that always says the same things about its own limitations is not being honest, it
// is performing honesty. These fire only when the condition is actually true, which
// means a clean audit produces a short caveat list and a shaky one produces a long
// one - and the reader can tell the difference.

import type { Offender } from "./types";
import type { SavedAudit, Building } from "./storage";

/** One device category, merged across every area it was seen in. */
export interface BriefItem {
  categoryId: string;
  label: string;
  icon: string;
  count: number;
  /** Areas this category was found in, in the order first seen. */
  areas: string[];
  annualWaste: number;
  annualSavings: number;
  fixCost: number;
  actionLabel: string;
  actionNote: string;
  paybackMonths: number | null;
  confidence: Offender["confidence"];
}

export interface ActionGroup {
  items: BriefItem[];
  annualSavings: number;
  upfront: number;
}

export interface Brief {
  buildingName: string;
  generatedAt: string;
  areas: string[];
  /** Whether any of this came from a real model reading. */
  mode: SavedAudit["mode"];
  engine: string;

  annualWaste: number;
  /** Plausible range for annualWaste, from each device's published wattage band. */
  annualWasteLow: number;
  annualWasteHigh: number;
  co2KgPerYear: number;

  /** Fixes that cost nothing: policy, scheduling, switching things off. */
  free: ActionGroup;
  /** Fixes that need money spent first. */
  capital: ActionGroup;

  totalRecoverable: number;
  totalUpfront: number;
  /** Recoverable minus what it costs to get there, in year one. */
  firstYearNet: number;
  /** Blended payback across the capital items only; null when nothing costs money. */
  paybackMonths: number | null;

  /** Dollar-weighted, because confidence in the total is what the reader needs. */
  confidence: Offender["confidence"];
  caveats: string[];
}

const CONFIDENCE_RANK: Record<Offender["confidence"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Merge one category across areas.
 *
 * Same rule as the class-mode merge: counts and dollars add, areas are collected
 * without duplication. The action taken is the one from the first row, since every
 * row of a category shares a catalog entry and therefore shares a recommendation.
 */
function mergeItems(offenders: Offender[]): BriefItem[] {
  const by = new Map<string, BriefItem>();
  for (const o of offenders) {
    const existing = by.get(o.categoryId);
    if (existing) {
      existing.count += o.count;
      existing.annualWaste += o.costPerYear;
      existing.annualSavings += o.annualSavings;
      existing.fixCost += o.fixCost;
      if (!existing.areas.includes(o.source)) existing.areas.push(o.source);
      // Keep the least confident reading: a total is only as trustworthy as its
      // shakiest component, and rounding that up would be flattering the number.
      if (CONFIDENCE_RANK[o.confidence] < CONFIDENCE_RANK[existing.confidence]) {
        existing.confidence = o.confidence;
      }
      continue;
    }
    by.set(o.categoryId, {
      categoryId: o.categoryId,
      label: o.label,
      icon: o.icon,
      count: o.count,
      areas: [o.source],
      annualWaste: o.costPerYear,
      annualSavings: o.annualSavings,
      fixCost: o.fixCost,
      actionLabel: o.action.label,
      actionNote: o.action.note,
      paybackMonths: o.paybackMonths,
      confidence: o.confidence,
    });
  }

  // Recompute payback on the merged figures. Summing per-room paybacks would be
  // meaningless; the ratio has to be taken after the parts are added together.
  for (const item of by.values()) {
    item.paybackMonths =
      item.fixCost > 0 && item.annualSavings > 0
        ? (item.fixCost / item.annualSavings) * 12
        : null;
  }

  return [...by.values()].sort((a, b) => b.annualSavings - a.annualSavings);
}

function group(items: BriefItem[]): ActionGroup {
  return {
    items,
    annualSavings: items.reduce((s, i) => s + i.annualSavings, 0),
    upfront: items.reduce((s, i) => s + i.fixCost, 0),
  };
}

/**
 * Dollar-weighted confidence.
 *
 * The reader is deciding based on the headline total, so what matters is the
 * confidence of the money, not the count of the rows. One shaky $8 finding should
 * not drag down a brief whose other $2,000 is solid, and one shaky $2,000 finding
 * should absolutely drag down the total regardless of how many tidy small rows
 * surround it.
 */
function weightedConfidence(items: BriefItem[]): Offender["confidence"] {
  const total = items.reduce((s, i) => s + i.annualWaste, 0);
  if (total <= 0) return "low";
  const score =
    items.reduce((s, i) => s + CONFIDENCE_RANK[i.confidence] * i.annualWaste, 0) / total;
  return score >= 1.5 ? "high" : score >= 0.75 ? "medium" : "low";
}

/**
 * Caveats that fire only when true.
 *
 * Ordered by how much they should change the reader's mind, because a caveat list
 * is read from the top and the one that matters most is the one that says the
 * headline number came from a room preset rather than a photograph.
 */
function buildCaveats(
  audit: SavedAudit,
  building: Building | undefined,
  items: BriefItem[],
): string[] {
  const out: string[] = [];

  if (audit.mode === "fallback") {
    out.push(
      "No photograph was read by a model for this audit. Every figure below comes from " +
        "a typical-room profile and should be treated as a starting hypothesis, not a " +
        "measurement.",
    );
  } else if (audit.mode === "mixed") {
    out.push(
      "Some areas were read from photographs and some were estimated from a room " +
        "profile. The estimated areas carry the same uncertainty as any assumption.",
    );
  }

  if (!building?.bill) {
    out.push(
      "Costs use a published average electricity price, not this building's actual " +
        "rate. Entering one line from a real utility bill replaces the average and is " +
        "the single largest improvement available to these numbers.",
    );
  }

  const capital = items.filter((i) => i.fixCost > 0);
  const multiArea = capital.filter((i) => i.areas.length > 1);
  if (multiArea.length > 0) {
    out.push(
      `Equipment cost is summed per area, so it is an upper bound: ` +
        `${multiArea[0].label.toLowerCase()} appears in ${multiArea[0].areas.length} areas and is ` +
        `budgeted ${multiArea[0].areas.length} times. Rooms that can share one device cost less than shown.`,
    );
  }

  const lowConfidence = items.filter((i) => i.confidence === "low");
  if (lowConfidence.length > 0) {
    const share =
      lowConfidence.reduce((s, i) => s + i.annualWaste, 0) /
      Math.max(1, items.reduce((s, i) => s + i.annualWaste, 0));
    if (share > 0.15) {
      out.push(
        `${Math.round(share * 100)}% of the total comes from findings marked low ` +
          "confidence, usually because the device's real duty cycle is unknown. " +
          "Verify those before committing money to them.",
      );
    }
  }

  out.push(
    "Annual figures assume the observed state persists across the unoccupied hours " +
      "in this building's schedule. A device caught off on one night it is usually on " +
      "will be under-counted, and the reverse is also true.",
  );

  return out;
}

/**
 * Build the brief.
 *
 * Deliberately takes an already-saved audit rather than live scanner state: a
 * document handed to a decision-maker should be reproducible from a record, and
 * anything generated from the transient contents of a tab is not.
 */
export function buildBrief(audit: SavedAudit, building?: Building): Brief {
  const items = mergeItems(audit.offenders);

  const free = group(items.filter((i) => i.fixCost <= 0));
  const capital = group(items.filter((i) => i.fixCost > 0));

  const annualWaste = items.reduce((s, i) => s + i.annualWaste, 0);
  const totalRecoverable = free.annualSavings + capital.annualSavings;
  const totalUpfront = capital.upfront;

  return {
    buildingName: building?.name ?? "Unnamed building",
    generatedAt: new Date().toISOString(),
    areas: audit.areas,
    mode: audit.mode,
    engine: audit.engine,

    annualWaste,
    annualWasteLow: audit.offenders.reduce((s, o) => s + o.costLowPerYear, 0),
    annualWasteHigh: audit.offenders.reduce((s, o) => s + o.costHighPerYear, 0),
    co2KgPerYear: audit.offenders.reduce((s, o) => s + o.co2KgPerYear, 0),

    free,
    capital,

    totalRecoverable,
    totalUpfront,
    firstYearNet: totalRecoverable - totalUpfront,
    paybackMonths:
      totalUpfront > 0 && capital.annualSavings > 0
        ? (totalUpfront / capital.annualSavings) * 12
        : null,

    confidence: weightedConfidence(items),
    caveats: buildCaveats(audit, building, items),
  };
}

/**
 * The one sentence a brief is reduced to when someone reads only the subject line.
 *
 * Leads with the free money when there is a meaningful amount of it, because "you
 * can save this today for nothing" survives a skim and "you could save this if you
 * spend that" does not.
 */
export function headline(brief: Brief): string {
  const money = (n: number) => "$" + Math.round(n).toLocaleString();

  if (brief.free.annualSavings >= 100 && brief.free.annualSavings / Math.max(1, brief.totalRecoverable) > 0.25) {
    return (
      `${money(brief.free.annualSavings)} a year can be recovered at no cost, and ` +
      `${money(brief.totalRecoverable)} a year in total for ${money(brief.totalUpfront)} up front.`
    );
  }
  if (brief.totalUpfront > 0 && brief.paybackMonths !== null) {
    return (
      `${money(brief.totalRecoverable)} a year is recoverable for ${money(brief.totalUpfront)} up front, ` +
      `paying for itself in ${Math.round(brief.paybackMonths)} months.`
    );
  }
  return `${money(brief.totalRecoverable)} a year is recoverable at no cost.`;
}
