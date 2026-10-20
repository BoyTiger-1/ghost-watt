// A capture: one photo or one video, everything known about it, and its audit.
//
// Perception and costing are kept apart on purpose. The expensive part - the
// vision model - runs once per capture and returns *observations* (what is there,
// in what state, roughly what it draws). Costing those is local arithmetic, so
// anything the user types afterwards - a wattage off a nameplate, how many hours
// it runs, a different count - re-prices the capture instantly and for free.

import type { CategorizedObservation } from "./parse";
import { rankObservations } from "./energy";
import { CATALOG_BY_ID } from "./devices";
import { localClock, type PhotoMeta } from "./exif";
import { isOccupiedAt, type WeeklySchedule } from "./schedule";
import type { RateQuality } from "./estimate";
import type { AnalysisResult, AnalyzeErrorCode, AuditSettings, Offender } from "./types";

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
  /** Kind of room, for the typical-use hours. */
  roomType?: string;
  /**
   * What happens here after hours, for every device seen on: it stays on as seen
   * ("on"), or goes to standby. Default: what was seen if the picture was taken
   * after hours, standby if it was taken during open hours.
   */
  afterHours?: "on" | "standby";
}

/** Per-device corrections, keyed by catalog category. */
export interface DeviceAdjust {
  count?: number;
  watts?: number;
  hoursPerDay?: number;
  /** The user looked and says it is real: an unverified line becomes counted. */
  confirmed?: boolean;
  /** The user says it is not there. */
  deleted?: boolean;
  /** The user says the model named the wrong kind of device. */
  categoryId?: string;
  /** The state this device is in after hours, when the user knows: left on, asleep, or switched off. */
  afterHours?: "on" | "standby" | "off";
}

export type CaptureStatus = "pending" | "working" | "done" | "error";

export interface Capture {
  id: string;
  name: string;
  kind: "photo" | "video";
  /** "manual": typed in with no picture (Type it in). */
  origin: "camera" | "upload" | "manual";
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
    /** How long the on-device read of this picture took, ms. */
    onDeviceMs?: number;
    lighting?: "on" | "off" | "unclear";
    people?: number;
    /** Where lat/lon came from. */
    locationFrom?: "exif" | "device";
  };
  geo?: GeoContext | null;
  details: CaptureDetails;
  adjust: Record<string, DeviceAdjust>;
  /** What kind of room this is: sets how many hours a day each device is typically in use. */
  roomType: string;
  status: CaptureStatus;
  stage?: string;
  progress?: number;
  error?: string;
  /** The audit as the engine returned it. */
  result?: AnalysisResult;
  /** Why the last analysis failed, when it did. */
  errorCode?: AnalyzeErrorCode;
  /** What the on-device detector read, kept as a fallback and for hints. */
  onDevice?: CategorizedObservation[];
}

let n = 0;
export const captureId = () => `c${Date.now().toString(36)}${(n++).toString(36)}`;

/** The settings one capture is priced with: its own location's tariff beats the building default. */
export function captureSettings(
  base: AuditSettings,
  c: Pick<Capture, "geo">,
  baseQuality: RateQuality | boolean,
): { settings: AuditSettings; rateQuality: RateQuality } {
  // A bill or a typed rate is the building's own price; nothing looked up beats it.
  if (baseQuality === true || baseQuality === "bill") return { settings: base, rateQuality: "bill" };
  if (baseQuality === "utility") return { settings: base, rateQuality: "utility" };
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
  if (details.afterHours) for (const o of out) if (o.state === "on") o.afterHours = details.afterHours;

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
    if (a.deleted) {
      o.count = 0;
      continue;
    }
    if (a.count !== undefined && a.count >= 0) o.count = Math.round(a.count);
    if (a.watts !== undefined && a.watts > 0) o.userWatts = a.watts;
    const h = hours(a.hoursPerDay);
    if (h !== undefined) o.hoursPerYear = h;
    if (a.confirmed) o.verification = "confirmed";
    if (a.afterHours) o.afterHours = a.afterHours;
    if (a.categoryId && CATALOG_BY_ID[a.categoryId] && a.categoryId !== o.categoryId) {
      o.categoryId = a.categoryId;
      o.device = CATALOG_BY_ID[a.categoryId].label;
      // A device the user re-identified is a device the user looked at.
      o.verification = "confirmed";
      // The model's wattage read was for the thing it thought it saw.
      delete o.wattsHint;
    }
  }
  return out.filter((o) => o.count > 0);
}

/** The perception a capture's costing starts from. */
export function baseObservations(c: Capture): CategorizedObservation[] {
  return c.result?.observations ?? [];
}

/** The settings one capture is priced with: its room type and whether it was taken after hours. */
export function captureContext(c: Pick<Capture, "meta" | "details" | "roomType">, settings: AuditSettings, schedule?: WeeklySchedule): AuditSettings {
  const time = readTime(c.meta.takenAt, schedule);
  return {
    ...settings,
    roomType: c.details.roomType ?? (c.roomType !== "unknown" ? c.roomType : undefined),
    capturedAfterHours: time ? time.afterHours : null,
  };
}

/** A capture's offenders, priced with its own location, room and the user's inputs. */
export function costCapture(c: Capture, settings: AuditSettings, schedule?: WeeklySchedule): Offender[] {
  if (!c.result) return [];
  const s = captureContext(c, settings, schedule);
  const obs = applyInputs(baseObservations(c), c.details, c.adjust, s);
  return rankObservations(obs, s, c.name).map((o) => ({ ...o, id: offenderKey(c.id, o.categoryId, o.unverified) }));
}

export const offenderKey = (captureId: string, categoryId: string, unverified?: boolean) =>
  `${captureId}::${categoryId}${unverified ? "::?" : ""}`;
export function parseOffenderKey(id: string): { captureId: string; categoryId: string } | null {
  const i = id.indexOf("::");
  if (i <= 0) return null;
  const rest = id.slice(i + 2);
  const j = rest.indexOf("::");
  return { captureId: id.slice(0, i), categoryId: j === -1 ? rest : rest.slice(0, j) };
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
