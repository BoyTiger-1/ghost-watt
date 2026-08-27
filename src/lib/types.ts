// Shared types for the Ghost Watt energy-audit engine.

export type DeviceState = "on" | "standby" | "off";

/** A raw device observation - what the vision model (or fallback) reports. */
export interface DeviceObservation {
  /** Free-text label as seen, e.g. "computer monitor". */
  device: string;
  count: number;
  state: DeviceState;
}

/** How a given offender was produced. Surfaced to the user as a badge. */
export type AnalysisMode = "live" | "fallback";

/** Coarse device grouping, used for filtering and the load-mix breakdown. */
export type DeviceGroup =
  | "display"
  | "computing"
  | "lighting"
  | "refrigeration"
  | "hvac"
  | "kitchen"
  | "office"
  | "network"
  | "specialty";

export const GROUP_LABELS: Record<DeviceGroup, string> = {
  display: "Displays",
  computing: "Computing",
  lighting: "Lighting",
  refrigeration: "Refrigeration",
  hvac: "Heating & cooling",
  kitchen: "Kitchen",
  office: "Office equipment",
  network: "Network & servers",
  specialty: "Specialty",
};

/** A category in the wattage lookup table. */
export interface DeviceCategory {
  id: string;
  label: string;
  /** Lowercased substrings matched against the vision description. Order: most specific first. */
  keywords: string[];
  /** Continuous draw (W) when visibly on / active. */
  wattsOn: number;
  /** Draw (W) when plugged in but idle/standby. */
  wattsStandby: number;
  /** Low end of the published range for this device class, W. Drives the uncertainty band. */
  wattsLow?: number;
  /** High end of the published range for this device class, W. */
  wattsHigh?: number;
  /** Where the wattage figures come from. Shown on the Methodology page. */
  source?: string;
  /** Coarse grouping for filtering and reporting. */
  group?: DeviceGroup;
  /** Fraction of applicable hours actually drawing power (compressors/heaters cycle < 1). */
  dutyCycle: number;
  /** Thermostatic devices run 24/7 and cycle; "on/off" is not meaningful. */
  thermostatic?: boolean;
  action: RecommendedAction;
  icon: string;
}

export interface RecommendedAction {
  label: string;
  /** Coarse fix type for grouping. */
  type: "timer" | "occupancy" | "powerstrip" | "policy" | "thermostat" | "remove" | "consolidate";
  /** Representative room-level cost of the fix, USD. 0 = behaviour/policy change. */
  cost: number;
  /** Fraction of this offender's annual waste the fix removes (0-1). */
  savingsFraction: number;
  note: string;
}

/** User-tunable assumptions behind every number. */
export interface AuditSettings {
  /** Electricity price, USD per kWh. */
  ratePerKwh: number;
  /** Grid carbon intensity, kg CO2e per kWh. */
  co2PerKwh: number;
  /** Hours per year the building is empty (the only hours phantom load is "wasted"). */
  unoccupiedHoursPerYear: number;
  /** Two-letter state code, when the user has told us where the building is. */
  regionCode?: string;
  /** Building type id, for benchmarking against comparable buildings. */
  buildingTypeId?: string;
  /** Conditioned floor area, sq ft. Enables EUI benchmarking. */
  floorAreaSqFt?: number;
  /** Utility demand charge, $/kW-month. Applies to loads that raise peak demand. */
  demandChargePerKw?: number;
}

/** A single ranked offender after the energy math is applied. */
export interface Offender {
  id: string;
  categoryId: string;
  label: string;
  icon: string;
  count: number;
  state: DeviceState;
  /** Effective per-unit draw in the observed state, W. */
  perUnitWatts: number;
  /** Total draw across all units, W. */
  totalWatts: number;
  kwhPerYear: number;
  costPerYear: number;
  co2KgPerYear: number;
  /** Low end of the plausible annual cost, from the device's published wattage range. */
  costLowPerYear: number;
  /** High end of the plausible annual cost. */
  costHighPerYear: number;
  /** Coarse grouping, for the load-mix breakdown. */
  group: DeviceGroup;
  action: RecommendedAction;
  fixCost: number;
  annualSavings: number;
  /** Payback in months for the fix; null when the fix is free (instant). */
  paybackMonths: number | null;
  confidence: "high" | "medium" | "low";
  /** Which room/photo this came from. */
  source: string;
}

export interface AnalysisResult {
  mode: AnalysisMode;
  /** Model id used, or a note about the fallback. */
  engine: string;
  source: string;
  offenders: Offender[];
  /** Raw model text, for transparency / debugging. */
  raw?: string;
  /** Present when the live path failed and we fell back. */
  notice?: string;
}

export const DEFAULT_SETTINGS: AuditSettings = {
  ratePerKwh: 0.15,
  co2PerKwh: 0.385,
  unoccupiedHoursPerYear: 6800,
};
