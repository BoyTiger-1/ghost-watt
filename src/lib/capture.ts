// A capture: one photo or one video, everything known about it, and its audit.
//
// Perception and costing are kept apart on purpose. The expensive part - the
// vision model - runs once per capture and returns *observations* (what is there,
// in what state, roughly what it draws). Costing those is local arithmetic, so
// anything the user types afterwards - a wattage off a nameplate, how many hours
// it runs, a different count - re-prices the capture instantly and for free.

import { fallbackObservations, type CategorizedObservation } from "./parse";
import { rankObservations } from "./energy";
import { localClock, type PhotoMeta } from "./exif";
import { isOccupiedAt, type WeeklySchedule } from "./schedule";
import type { RateQuality } from "./estimate";
import type { AnalysisResult, AuditSettings, Offender } from "./types";

export interface GeoContext {
  place: string | null;
  state: string | null;
  country: string | null;
  ratePerKwh: number;
  rateSource: string;
  rateQuality: "utility" | "state" | "national";
  co2PerKwh: number;
  utilityName?: string;
  /** Residential or commercial: a house and a school a street apart pay different prices. */
  sector?: "residential" | "commercial";
  stateRatePerKwh?: number;
  tariff?: { name: string; since: number | null; fixedMonthly: number | null };
}

/** What the person scanning told us. Every field optional. */
export interface CaptureDetails {
  /** Draw of the main device, W per unit: off a label or a plug-in meter. */
  watts?: number;
  /** Hours a day things here are left running. */
  hoursPerDay?: number;
  /** Free text, passed to the model: "Dell monitors, lab is closed weekends". */
  note?: string;
}

/** Per-device corrections, keyed by catalog category. */
export interface DeviceAdjust {
  count?: number;
  watts?: number;
  hoursPerDay?: number;
}

export type CaptureStatus = "pending" | "working" | "done" | "error";

export interface Capture {
  id: string;
  name: string;
  kind: "photo" | "video";
  origin: "camera" | "upload";
  /** The photo, or a video's first keyframe. */
  dataUrl: string | null;
  videoUrl?: string;
  duration?: number;
  keyframes?: { t: number; dataUrl: string; annotated?: string }[];
  meta: PhotoMeta & {
    bytes?: number;
    width?: number;
    height?: number;
    /** Mean luma, 0-255, from the on-device read. */
    brightness?: number;
    lighting?: "on" | "off" | "unclear";
    people?: number;
    /** Where lat/lon came from. */
    locationFrom?: "exif" | "device";
  };
  geo?: GeoContext | null;
  details: CaptureDetails;
  adjust: Record<string, DeviceAdjust>;
  /** Room preset for the no-model fallback. */
  roomType: string;
  status: CaptureStatus;
  stage?: string;
  progress?: number;
  error?: string;
  /** The audit as the engine returned it. */
  result?: AnalysisResult;
  /** What the on-device detector read, kept as a fallback and for hints. */
  onDevice?: CategorizedObservation[];
}

let n = 0;
export const captureId = () => `c${Date.now().toString(36)}${(n++).toString(36)}`;

/** The settings one capture is priced with: its own location's tariff beats the building default. */
export function captureSettings(
  base: AuditSettings,
  c: Pick<Capture, "geo">,
  rateOverridden: boolean,
): { settings: AuditSettings; rateQuality: RateQuality } {
  if (rateOverridden) return { settings: base, rateQuality: "bill" };
  if (c.geo) {
    return {
      settings: { ...base, ratePerKwh: c.geo.ratePerKwh, co2PerKwh: c.geo.co2PerKwh },
      rateQuality: c.geo.rateQuality,
    };
  }
  return { settings: base, rateQuality: base.regionCode && base.regionCode !== "US" ? "state" : "national" };
}

/** Observations with the user's details and corrections applied. */
export function applyInputs(
  obs: readonly CategorizedObservation[],
  details: CaptureDetails,
  adjust: Record<string, DeviceAdjust>,
  settings: AuditSettings,
): CategorizedObservation[] {
  const out = obs.map((o) => ({ ...o }));
  const hours = (h: number | undefined) => (h !== undefined && Number.isFinite(h) && h >= 0 ? Math.min(24, h) * 365 : undefined);

  const captureHours = hours(details.hoursPerDay);
  if (captureHours !== undefined) for (const o of out) o.hoursPerYear = captureHours;

  // The capture-level wattage belongs to its main device: the one costing most.
  if (details.watts && details.watts > 0 && out.length) {
    const ranked = rankObservations(out, settings, "_");
    const top = ranked[0]?.categoryId;
    const target = out.find((o) => o.categoryId === top && o.state !== "off");
    if (target) target.userWatts = details.watts;
  }

  for (const o of out) {
    const a = adjust[o.categoryId];
    if (!a) continue;
    if (a.count !== undefined && a.count >= 0) o.count = Math.round(a.count);
    if (a.watts !== undefined && a.watts > 0) o.userWatts = a.watts;
    const h = hours(a.hoursPerDay);
    if (h !== undefined) o.hoursPerYear = h;
  }
  return out.filter((o) => o.count > 0);
}

/** The perception a capture's costing starts from. */
export function baseObservations(c: Capture): CategorizedObservation[] {
  const r = c.result;
  if (!r) return [];
  if (r.observations) return r.observations;
  // A room-profile estimate carries no observations; rebuild them from the preset.
  return r.mode === "fallback" ? fallbackObservations(c.roomType) : [];
}

/** A capture's offenders, priced with its own location and the user's inputs. */
export function costCapture(c: Capture, settings: AuditSettings): Offender[] {
  if (!c.result) return [];
  const obs = applyInputs(baseObservations(c), c.details, c.adjust, settings);
  return rankObservations(obs, settings, c.name).map((o) => ({ ...o, id: offenderKey(c.id, o.categoryId) }));
}

export const offenderKey = (captureId: string, categoryId: string) => `${captureId}::${categoryId}`;
export function parseOffenderKey(id: string): { captureId: string; categoryId: string } | null {
  const i = id.indexOf("::");
  return i > 0 ? { captureId: id.slice(0, i), categoryId: id.slice(i + 2) } : null;
}

// ---- context for the model --------------------------------------------------

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface TimeRead {
  label: string;
  afterHours: boolean | null;
}

/** "9:42 PM, Wednesday · after hours", from a local timestamp and the building's schedule. */
export function readTime(takenAt: string | undefined, schedule: WeeklySchedule | undefined): TimeRead | null {
  if (!takenAt) return null;
  const clock = localClock(takenAt);
  if (!clock) return null;
  const h12 = clock.hour % 12 || 12;
  const label = `${h12}:${String(clock.minute).padStart(2, "0")} ${clock.hour < 12 ? "AM" : "PM"}, ${DAY[clock.weekday]}`;
  const afterHours = schedule ? !isOccupiedAt(schedule, clock.weekday, clock.hour) : null;
  return { label, afterHours };
}

export function promptContext(c: Capture, schedule: WeeklySchedule | undefined) {
  const time = readTime(c.meta.takenAt, schedule);
  const hints: string[] = [];
  const isLight = (id: string) => id === "ceiling_light" || id === "downlight";
  const lights = c.onDevice?.filter((o) => isLight(o.categoryId)).reduce((s, o) => s + o.count, 0) ?? 0;
  if (lights) hints.push(`${lights} bright light fixture${lights > 1 ? "s" : ""} appear lit`);
  if (c.meta.lighting === "off") hints.push("the room looks dark");
  for (const o of c.onDevice ?? []) {
    if (isLight(o.categoryId)) continue;
    hints.push(`${o.count} ${o.device}${o.count > 1 ? "s" : ""} (${o.state === "standby" ? "screen dark" : "on"})`);
  }
  if (c.meta.people) hints.push(`${c.meta.people} person in frame`);
  return {
    when: time ? `${time.label}${time.afterHours === null ? "" : time.afterHours ? ", outside open hours" : ", during open hours"}` : undefined,
    place: c.geo?.place ?? undefined,
    note: c.details.note,
    hints: hints.slice(0, 6),
  };
}

/** The engine's reply, turned into the result a capture should show. */
export function resolveResult(
  server: AnalysisResult,
  onDevice: CategorizedObservation[] | undefined,
  engineLabel: string,
): AnalysisResult {
  if (server.mode === "live") return server;
  // The model looked and found nothing powered: that is an answer, not a reason to guess.
  if (server.fallbackReason === "nothing-found") {
    return { ...server, mode: "live", offenders: [], observations: [], notice: "No powered devices found in this capture." };
  }
  // No model reachable: the detector's own reading of this capture beats a room preset.
  if (onDevice?.length) {
    return {
      mode: "live",
      engine: engineLabel,
      source: server.source,
      offenders: [],
      observations: onDevice,
      notice: `${
        server.fallbackReason === "limited" ? "AI readings are paused for a few minutes." : "No AI vision engine is reachable."
      } Read on this device instead: screens, laptops, appliances and lit fixtures only.`,
    };
  }
  return server;
}
