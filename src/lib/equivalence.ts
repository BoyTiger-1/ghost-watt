// Making a tonne of CO2 mean something.
//
// "11.2 tonnes of CO2 a year" is a number almost nobody can picture. These
// conversions turn it into things people can - and they are the figures that end
// up in the school newsletter, which is where behaviour change actually starts.
//
// Every factor is EPA's current Greenhouse Gas Equivalencies Calculator figure.

export interface Equivalence {
  id: string;
  value: number;
  unit: string;
  label: string;
  icon: string;
}

/**
 * kg CO2e per unit, from EPA's Greenhouse Gas Equivalencies Calculator,
 * "Calculations and References" (sources.ts: epa-ghg-equivalencies).
 */
const FACTORS = {
  /** Gasoline passenger vehicle driven for a year: 4.29 t CO2e. */
  carYear: 4290,
  /** One mile in an average gasoline passenger vehicle: 3.93 × 10⁻⁴ t CO2e. */
  carMile: 0.393,
  /** One tree seedling grown for 10 years: 0.060 t CO2. */
  treeSeedling: 60,
  /** One home's electricity use for a year: 4.798 t CO2. */
  homeYear: 4798,
  /** One gallon of gasoline burned: 8.887 kg CO2. */
  gallonPetrol: 8.887,
};

export function equivalences(co2Kg: number): Equivalence[] {
  return [
    {
      id: "cars",
      value: co2Kg / FACTORS.carYear,
      unit: "cars",
      label: "cars taken off the road for a year",
      icon: "car",
    },
    {
      id: "trees",
      value: co2Kg / FACTORS.treeSeedling,
      unit: "trees",
      label: "tree seedlings grown for 10 years to absorb it",
      icon: "tree",
    },
    {
      id: "homes",
      value: co2Kg / FACTORS.homeYear,
      unit: "homes",
      label: "homes' electricity for a year",
      icon: "home",
    },
    {
      id: "miles",
      value: co2Kg / FACTORS.carMile,
      unit: "miles",
      label: "miles driven in an average car",
      icon: "road",
    },
    {
      id: "petrol",
      value: co2Kg / FACTORS.gallonPetrol,
      unit: "gallons",
      label: "gallons of gasoline burned",
      icon: "fuel",
    },
  ];
}

/** The ones that read best at this magnitude - avoids showing "0.02 homes". */
export function bestEquivalences(co2Kg: number, count = 3): Equivalence[] {
  return equivalences(co2Kg)
    .filter((e) => e.value >= 0.9)
    .sort((a, b) => {
      // Prefer values in the human-legible 1-999 band.
      const score = (v: number) => (v >= 1 && v < 1000 ? 0 : v >= 1000 ? 1 : 2);
      return score(a.value) - score(b.value) || a.value - b.value;
    })
    .slice(0, count);
}

/**
 * Dollars framed as things a school buys, because budgets are compared to budgets.
 * Round illustrative prices, not quotes (sources.ts: illustrative-spend).
 */
export interface SpendEquivalence {
  value: number;
  label: string;
}

export function spendEquivalences(dollars: number): SpendEquivalence[] {
  return [
    { value: dollars / 12, label: "school lunches" },
    { value: dollars / 45, label: "hours of teaching-assistant time" },
    { value: dollars / 300, label: "Chromebooks" },
    { value: dollars / 750, label: "classroom sets of textbooks" },
    { value: dollars / 1200, label: "field trips" },
  ].filter((s) => s.value >= 1);
}

export function fmtEquiv(n: number): string {
  if (n >= 1000) return Math.round(n).toLocaleString();
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return n.toFixed(0);
  return n.toFixed(1);
}
