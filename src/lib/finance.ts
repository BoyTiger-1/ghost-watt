// Investment maths for the fix list.
//
// A ranked list of waste is only half an answer. The question a facilities office
// actually asks is "I have $500 this quarter - what do I buy?", and the answer is
// not simply the top of the list. A $0 policy change that saves $200 belongs ahead
// of a $180 controller that saves $400 when the budget is tight, and behind it when
// it isn't.
//
// That is a 0/1 knapsack, solved exactly here by dynamic programming over
// dollar-granularity budgets. Small enough to be instant, real enough to be right.

import type { Offender } from "./types";

export interface FinanceSettings {
  /** Discount rate for NPV, e.g. 0.05 for 5%. */
  discountRate: number;
  /** Years to evaluate the investment over. */
  horizonYears: number;
  /** Expected annual electricity price inflation, e.g. 0.03. */
  energyInflation: number;
}

export const DEFAULT_FINANCE: FinanceSettings = {
  discountRate: 0.05,
  horizonYears: 10,
  energyInflation: 0.03,
};

/**
 * Net present value of a fix: recurring annual savings that grow with energy
 * prices, discounted back to today, minus the up-front cost.
 */
export function npv(
  annualSavings: number,
  upfrontCost: number,
  f: FinanceSettings = DEFAULT_FINANCE,
): number {
  let total = -upfrontCost;
  for (let year = 1; year <= f.horizonYears; year++) {
    const inflated = annualSavings * Math.pow(1 + f.energyInflation, year - 1);
    total += inflated / Math.pow(1 + f.discountRate, year);
  }
  return total;
}

/** Total undiscounted savings over the horizon, for the headline "you'd save X by 2036". */
export function lifetimeSavings(
  annualSavings: number,
  f: FinanceSettings = DEFAULT_FINANCE,
): number {
  let total = 0;
  for (let year = 1; year <= f.horizonYears; year++) {
    total += annualSavings * Math.pow(1 + f.energyInflation, year - 1);
  }
  return total;
}

/** Simple return on investment over the horizon, as a multiple (3.4 = 340%). */
export function roi(
  annualSavings: number,
  upfrontCost: number,
  f: FinanceSettings = DEFAULT_FINANCE,
): number | null {
  if (upfrontCost <= 0) return null; // free fixes have undefined ROI, not infinite
  return lifetimeSavings(annualSavings, f) / upfrontCost;
}

// ---- budget optimiser ---------------------------------------------------

export interface PlanItem {
  offender: Offender;
  cost: number;
  annualSavings: number;
  selected: boolean;
}

export interface BudgetPlan {
  budget: number;
  items: PlanItem[];
  chosen: PlanItem[];
  spend: number;
  annualSavings: number;
  co2SavedKg: number;
  /** Savings you'd get by simply working down the ranked list until the money ran out. */
  greedySavings: number;
  /** How much better the optimiser did than that naive approach, in dollars per year. */
  improvementOverGreedy: number;
  paybackMonths: number | null;
}

/**
 * Exact 0/1 knapsack over the fix list.
 *
 * Costs are whole dollars and budgets are small, so an O(n x budget) table is
 * both exact and instantaneous - no need for an approximation. Free fixes (cost 0)
 * are always taken first and excluded from the table, since they can never lose.
 */
export function optimizeBudget(offenders: Offender[], budget: number): BudgetPlan {
  const all: PlanItem[] = offenders.map((o) => ({
    offender: o,
    cost: Math.round(o.fixCost),
    annualSavings: o.annualSavings,
    selected: false,
  }));

  const free = all.filter((i) => i.cost <= 0 && i.annualSavings > 0);
  const priced = all.filter((i) => i.cost > 0 && i.annualSavings > 0);

  free.forEach((i) => (i.selected = true));

  const cap = Math.max(0, Math.floor(budget));
  // table[i][b] = best annual savings using the first i priced items within budget b
  const table: number[][] = Array.from({ length: priced.length + 1 }, () =>
    new Array<number>(cap + 1).fill(0),
  );

  for (let i = 1; i <= priced.length; i++) {
    const item = priced[i - 1];
    for (let b = 0; b <= cap; b++) {
      const skip = table[i - 1][b];
      const take =
        item.cost <= b ? table[i - 1][b - item.cost] + item.annualSavings : -Infinity;
      table[i][b] = Math.max(skip, take);
    }
  }

  // Walk the table backwards to recover which items were chosen.
  let remaining = cap;
  for (let i = priced.length; i > 0; i--) {
    if (table[i][remaining] !== table[i - 1][remaining]) {
      priced[i - 1].selected = true;
      remaining -= priced[i - 1].cost;
    }
  }

  const chosen = all.filter((i) => i.selected);
  const spend = chosen.reduce((a, i) => a + i.cost, 0);
  const annualSavings = chosen.reduce((a, i) => a + i.annualSavings, 0);
  const co2SavedKg = chosen.reduce(
    (a, i) => a + i.offender.co2KgPerYear * i.offender.action.savingsFraction,
    0,
  );

  // What you'd have got by just buying down the ranked list in order.
  let greedyBudget = cap;
  let greedySavings = free.reduce((a, i) => a + i.annualSavings, 0);
  for (const item of priced) {
    if (item.cost <= greedyBudget) {
      greedyBudget -= item.cost;
      greedySavings += item.annualSavings;
    }
  }

  return {
    budget: cap,
    items: all,
    chosen,
    spend,
    annualSavings,
    co2SavedKg,
    greedySavings,
    improvementOverGreedy: annualSavings - greedySavings,
    paybackMonths: annualSavings > 0 && spend > 0 ? (spend / annualSavings) * 12 : null,
  };
}

/**
 * The cheapest budget that captures a given share of all available savings.
 * Powers the "80% of the win costs $340" line, which is the number that
 * actually gets a purchase order signed.
 */
export function budgetForFraction(offenders: Offender[], fraction: number): BudgetPlan {
  const maxSavings = offenders.reduce((a, o) => a + o.annualSavings, 0);
  const target = maxSavings * fraction;
  const ceiling = offenders.reduce((a, o) => a + Math.round(o.fixCost), 0);

  let lo = 0;
  let hi = ceiling;
  let best = optimizeBudget(offenders, ceiling);

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const plan = optimizeBudget(offenders, mid);
    if (plan.annualSavings >= target) {
      best = plan;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
}

/** Marginal savings per dollar spent - the curve behind the budget slider. */
export function savingsCurve(offenders: Offender[], steps = 24): { budget: number; savings: number }[] {
  const ceiling = offenders.reduce((a, o) => a + Math.round(o.fixCost), 0);
  if (ceiling === 0) return [];
  const out: { budget: number; savings: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const budget = Math.round((ceiling / steps) * i);
    out.push({ budget, savings: optimizeBudget(offenders, budget).annualSavings });
  }
  return out;
}
