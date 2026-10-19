// Shared types for the Ghost Watt energy-audit engine.

export type DeviceState = "on" | "standby" | "off";

/**
 * Where on the photo a device was seen: [x1, y1, x2, y2] as fractions (0-1) of the
 * photo's width and height, top-left corner first. Fractions rather than pixels so
 * the overlay is correct at whatever size the photo is drawn.
 */
export type Box = [number, number, number, number];

/** A raw device observation - what the vision model (or fallback) reports. */
export interface DeviceObservation {
  /** Free-text label as seen, e.g. "computer monitor". */
  device: string;
  count: number;
  state: DeviceState;
  /**
   * Located instances, when the engine reports positions. Usually fewer than
   * count: a model can count a far row of monitors it cannot box one by one.
   */
  boxes?: Box[];
  /** The vision model's read of one unit's draw while running, W. Blended with the catalog band. */
  wattsHint?: number;
  /** A figure the user supplied (nameplate, plug-in meter), W per unit in the observed state. */
  userWatts?: number;
  /** Hours a year this device is costed for, when the user said how long it runs. */
  hoursPerYear?: number;
  /**
   * The state assumed through the building's empty hours, when it is not simply the
   * observed one: set by the user ("it is left on overnight" / "it goes to sleep").
   */
  afterHours?: DeviceState;
  /** One short phrase on why the engine judged it this way, e.g. "screen lit, login page". */
  evidence?: string;
  /** Technology as read by the vision model, e.g. "LED", "T8 fluorescent", "CRT". */
  tech?: string;
  /** The model's own 0-1 confidence in the device and its count, when it gave one. */
  confidence?: number;
  /**
   * Cross-check verdict. "unverified": the model's claim could not be backed by
   * the on-device detector (or the model itself was unsure), so it is shown but
   * not counted until the user confirms it. "confirmed": the user said it is real.
   */
  verification?: "verified" | "unverified" | "confirmed";
}

/**
 * Which path read the picture. "on-device": the small detector in the browser,
 * nothing uploaded. "enhanced": the frame was sent to the vision-language model
 * behind /api/analyze. There is no third, invented path.
 */
export type AnalysisMode = "enhanced" | "on-device";

/** Why an analysis could not be done. Shown to the user as a plain error. */
export type AnalyzeErrorCode =
  | "bad-request"
  | "too-large"
  | "rate-limited"
  | "no-engine"
  | "engine-failed"
  | "unparseable";

export interface AnalyzeError {
  error: string;
  code: AnalyzeErrorCode;
  /** Seconds until a rate limit lifts, when that is the cause. */
  retryAfterSeconds?: number;
}

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
  /** Where the scan is: sets the typical hours each device is in use. */
  usageContext?: "home" | "school" | "office";
  /** Hours a year the space is occupied, for school and office usage profiles. */
  occupiedHoursPerYear?: number;
  /** Kind of room (lib/rooms.ts): refines the typical in-use hours per device. */
  roomType?: string;
  /**
   * Whether the picture was taken while the building was meant to be empty.
   * True: what was seen on is what runs after hours. False: a device seen on during
   * the day is assumed to go to standby after hours unless the user says otherwise.
   * Null or absent: unknown, so the observed state is assumed to persist.
   */
  capturedAfterHours?: boolean | null;
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
  /** Where on the source photo these units were seen. Absent for estimates. */
  boxes?: Box[];
  /** Where the per-unit wattage came from: a measurement, the AI's read blended with the catalog, or the catalog. */
  basis?: "measured" | "ai" | "catalog";
  /** Shown but not counted: the reading could not be cross-checked and the user has not confirmed it. */
  unverified?: boolean;
  /** The model's confidence, 0-1, when it gave one. */
  modelConfidence?: number;
  /** Hours a year this line is costed for. */
  hoursPerYear?: number;
  /** True when the hours came from the user rather than the building schedule. */
  hoursKnown?: boolean;
  /** The state this line is costed in through the empty hours, and why. */
  afterHoursState?: DeviceState;
  afterHoursBasis?: "observed" | "assumed-standby" | "user";
  /** What this line would cost if it only ever drew standby power through the empty hours. */
  standbyCostPerYear?: number;
  evidence?: string;
  tech?: string;
  /** One unit's draw while in use, W (the on-state figure, whatever state it was seen in). */
  activeWattsPerUnit?: number;
  /** Typical use where it is - hours a day in use, standby the rest - for every unit. */
  typicalHoursPerDay?: number;
  typicalKwhPerYear?: number;
  typicalCostPerYear?: number;
  /** Where the typical hours come from, in words. */
  usageBasis?: string;
  /** Source id (lib/sources.ts) behind the typical hours, or "estimate". */
  usageSource?: string;
}

export interface AnalysisResult {
  mode: AnalysisMode;
  /** Model id used, or a note about the fallback. */
  engine: string;
  source: string;
  offenders: Offender[];
  /** Raw model text, for transparency / debugging. */
  raw?: string;
  /**
   * The perception behind the offenders, before any costing. The client keeps
   * these so a wattage or hours the user types in re-costs the scan locally,
   * without asking the model again.
   */
  observations?: (DeviceObservation & { categoryId: string })[];
  /** A true sentence about a limitation of this result, e.g. that nothing powered was recognised. */
  notice?: string;
  /**
   * Devices the model located but judged switched off. They cost nothing, so
   * they are not offenders, but drawing them on the photo shows the scan looked
   * at everything rather than missing them - and "all 28 monitors are off" is a
   * result worth seeing.
   */
  sightings?: Sighting[];
}

export interface Sighting {
  label: string;
  count: number;
  state: DeviceState;
  boxes: Box[];
}

/**
 * Used only when nothing better is known. Price is the EIA 2024 U.S. average
 * commercial rate; carbon is the eGRID2023 U.S. average output rate (767
 * lb/MWh). A building with a state set never sees these.
 */
export const DEFAULT_SETTINGS: AuditSettings = {
  ratePerKwh: 0.13,
  co2PerKwh: 0.35,
  unoccupiedHoursPerYear: 6800,
};
