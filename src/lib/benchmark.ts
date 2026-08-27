// Benchmarking: is this building unusually wasteful, or normal?
//
// An absolute figure ("$4,300 a year") has no anchor. A comparison does: the same
// waste in a 90,000 sq ft high school is a rounding error, and in a small building
// it is a scandal. Energy Use Intensity (EUI, kBtu per square foot per year) is the
// standard the industry already speaks, so we speak it too.
//
// Reference medians follow the pattern of the EIA Commercial Buildings Energy
// Consumption Survey (CBECS). Representative, not authoritative.

export interface BuildingType {
  id: string;
  label: string;
  /** Median site EUI for this building type, kBtu/sq ft/yr. */
  medianEui: number;
  /** Typical share of total electricity that is plug + lighting load, 0-1. */
  plugLoadShare: number;
  /** Suggested schedule preset id. */
  schedulePreset: string;
}

export const BUILDING_TYPES: BuildingType[] = [
  { id: "k12", label: "K-12 school", medianEui: 49, plugLoadShare: 0.38, schedulePreset: "school" },
  { id: "college", label: "College / university building", medianEui: 79, plugLoadShare: 0.42, schedulePreset: "school_extended" },
  { id: "office", label: "Office", medianEui: 53, plugLoadShare: 0.45, schedulePreset: "office" },
  { id: "library", label: "Library", medianEui: 71, plugLoadShare: 0.4, schedulePreset: "library" },
  { id: "retail", label: "Retail store", medianEui: 51, plugLoadShare: 0.35, schedulePreset: "retail" },
  { id: "worship", label: "Place of worship", medianEui: 31, plugLoadShare: 0.3, schedulePreset: "church" },
  { id: "warehouse", label: "Warehouse", medianEui: 23, plugLoadShare: 0.28, schedulePreset: "office" },
  { id: "clinic", label: "Outpatient clinic", medianEui: 89, plugLoadShare: 0.36, schedulePreset: "office" },
  { id: "community", label: "Community centre", medianEui: 45, plugLoadShare: 0.36, schedulePreset: "church" },
  { id: "home", label: "Home", medianEui: 40, plugLoadShare: 0.55, schedulePreset: "home" },
];

export const BUILDING_TYPE_BY_ID: Record<string, BuildingType> = Object.fromEntries(
  BUILDING_TYPES.map((b) => [b.id, b]),
);

const KWH_TO_KBTU = 3.412;

export interface BenchmarkResult {
  /** Phantom-load EUI attributable to what we found, kBtu/sq ft/yr. */
  phantomEui: number;
  /** Median total EUI for this building type. */
  medianEui: number;
  /** Phantom load as a share of the type's median total energy use, 0-1. */
  shareOfMedian: number;
  /** Waste per square foot, dollars. */
  costPerSqFt: number;
  verdict: "low" | "typical" | "high" | "severe";
  message: string;
}

export function benchmark(
  kwhPerYear: number,
  costPerYear: number,
  floorAreaSqFt: number,
  typeId: string,
): BenchmarkResult | null {
  if (!floorAreaSqFt || floorAreaSqFt <= 0) return null;
  const type = BUILDING_TYPE_BY_ID[typeId] ?? BUILDING_TYPES[0];

  const phantomEui = (kwhPerYear * KWH_TO_KBTU) / floorAreaSqFt;
  const shareOfMedian = phantomEui / type.medianEui;
  const costPerSqFt = costPerYear / floorAreaSqFt;
  const pct = (shareOfMedian * 100).toFixed(1);
  const typeName = type.label.toLowerCase();

  let verdict: BenchmarkResult["verdict"];
  let message: string;
  if (shareOfMedian < 0.02) {
    verdict = "low";
    message = `Phantom load is under 2% of a typical ${typeName}'s total energy use. This building is already tight.`;
  } else if (shareOfMedian < 0.05) {
    verdict = "typical";
    message = `Phantom load is about ${pct}% of typical total use - normal for a ${typeName}, and still worth recovering.`;
  } else if (shareOfMedian < 0.1) {
    verdict = "high";
    message = `Phantom load is ${pct}% of typical total use. That is high; the fixes below are unusually worthwhile here.`;
  } else {
    verdict = "severe";
    message = `Phantom load is ${pct}% of a typical building's entire annual energy use. Something here is running that should not be.`;
  }

  return { phantomEui, medianEui: type.medianEui, shareOfMedian, costPerSqFt, verdict, message };
}

/** Extrapolate a sampled set of rooms across a whole building of known size. */
export function extrapolate(
  auditedCostPerYear: number,
  auditedSqFt: number,
  totalSqFt: number,
): { factor: number; projectedCost: number } | null {
  if (!auditedSqFt || auditedSqFt <= 0 || !totalSqFt || totalSqFt <= 0) return null;
  const factor = totalSqFt / auditedSqFt;
  return { factor, projectedCost: auditedCostPerYear * factor };
}
