// Class mode: one building, many phones, one map.
//
// A single person auditing a high school is a weekend. Thirty students each taking
// one corridor is a lunch period. That is the entire argument for this feature, and
// it is also the difference between a project that was demonstrated and a project
// that was used.
//
// The privacy rule is absolute and it shapes the whole design: PHOTOS NEVER LEAVE
// THE PHONE. Perception happens on the contributor's own device (or their own
// browser session), and what gets sent to the session is the *computed offender
// rows* - device category, count, watts, dollars. A row saying "3 monitors, on,
// $312/yr" carries no image of the inside of a K-12 building, which is the thing
// that would actually be sensitive. Everything in this file operates on those rows.
//
// No accounts either. A six-character code is the whole auth model, sessions expire
// on their own, and a contributor is a display name they typed. That is proportionate
// for a class exercise and it means there is no student data to protect.

import type { Offender } from "./types";

/** How long a session stays alive without anyone touching it. */
export const SESSION_TTL_DAYS = 14;

/** Caps, so one session cannot grow without bound. */
export const MAX_CONTRIBUTIONS = 240;
export const MAX_OFFENDERS_PER_CONTRIBUTION = 60;
export const MAX_NAME_LEN = 40;

/**
 * Unambiguous alphabet: no O/0, no I/1/L. A code gets read aloud across a
 * classroom and typed by someone who is not looking at the board.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function makeCode(): string {
  let out = "";
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

export function isValidCode(raw: string): boolean {
  const c = normalizeCode(raw);
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
}

/** One person's scan of one area, as submitted. */
export interface Contribution {
  id: string;
  /** Room or area covered, e.g. "Room 214" or "West corridor". */
  area: string;
  /** Display name the contributor typed. Not an account. */
  contributor: string;
  /** ISO timestamp. */
  at: string;
  /** Whether a vision model read it or it came from a room profile. */
  mode: "live" | "fallback" | "mixed";
  offenders: Offender[];
}

export interface ClassSession {
  code: string;
  buildingName: string;
  regionCode: string;
  createdAt: string;
  contributions: Contribution[];
}

// ---- merging ------------------------------------------------------------

export interface MergedRow {
  categoryId: string;
  label: string;
  icon: string;
  count: number;
  kwhPerYear: number;
  costPerYear: number;
  co2KgPerYear: number;
  /** Areas this device category was found in. */
  areas: string[];
  /** Cheapest single fix cost seen for this category. */
  fixCost: number;
  annualSavings: number;
  actionLabel: string;
}

export interface ClassTotals {
  costPerYear: number;
  kwhPerYear: number;
  co2KgPerYear: number;
  recoverable: number;
  areaCount: number;
  contributorCount: number;
  liveShare: number;
}

/**
 * Combine every contribution into one ranked building map.
 *
 * Counts are summed across areas because two rooms genuinely contain two sets of
 * monitors. Fix cost is summed the same way and for the same reason - each room
 * needs its own smart strip - which is a modelling choice, not an obvious truth,
 * and is stated as such on the methodology page.
 */
export function mergeContributions(contributions: Contribution[]): MergedRow[] {
  const byCategory = new Map<string, MergedRow>();

  for (const c of contributions) {
    for (const o of c.offenders) {
      const existing = byCategory.get(o.categoryId);
      if (existing) {
        existing.count += o.count;
        existing.kwhPerYear += o.kwhPerYear;
        existing.costPerYear += o.costPerYear;
        existing.co2KgPerYear += o.co2KgPerYear;
        existing.fixCost += o.fixCost;
        existing.annualSavings += o.annualSavings;
        if (!existing.areas.includes(c.area)) existing.areas.push(c.area);
      } else {
        byCategory.set(o.categoryId, {
          categoryId: o.categoryId,
          label: o.label,
          icon: o.icon,
          count: o.count,
          kwhPerYear: o.kwhPerYear,
          costPerYear: o.costPerYear,
          co2KgPerYear: o.co2KgPerYear,
          areas: [c.area],
          fixCost: o.fixCost,
          annualSavings: o.annualSavings,
          actionLabel: o.action.label,
        });
      }
    }
  }

  return [...byCategory.values()].sort((a, b) => b.costPerYear - a.costPerYear);
}

export function classTotals(contributions: Contribution[]): ClassTotals {
  const rows = mergeContributions(contributions);
  const areas = new Set(contributions.map((c) => c.area.trim().toLowerCase()).filter(Boolean));
  const people = new Set(
    contributions.map((c) => c.contributor.trim().toLowerCase()).filter(Boolean),
  );
  const live = contributions.filter((c) => c.mode !== "fallback").length;

  return {
    costPerYear: rows.reduce((s, r) => s + r.costPerYear, 0),
    kwhPerYear: rows.reduce((s, r) => s + r.kwhPerYear, 0),
    co2KgPerYear: rows.reduce((s, r) => s + r.co2KgPerYear, 0),
    recoverable: rows.reduce((s, r) => s + r.annualSavings, 0),
    areaCount: areas.size,
    contributorCount: people.size,
    liveShare: contributions.length ? live / contributions.length : 0,
  };
}

/** Per-area rollup, for the coverage view. */
export interface AreaSummary {
  area: string;
  contributor: string;
  at: string;
  mode: Contribution["mode"];
  deviceCount: number;
  costPerYear: number;
}

export function areaSummaries(contributions: Contribution[]): AreaSummary[] {
  return contributions
    .map((c) => ({
      area: c.area,
      contributor: c.contributor,
      at: c.at,
      mode: c.mode,
      deviceCount: c.offenders.reduce((s, o) => s + o.count, 0),
      costPerYear: c.offenders.reduce((s, o) => s + o.costPerYear, 0),
    }))
    .sort((a, b) => b.costPerYear - a.costPerYear);
}

// ---- input hygiene ------------------------------------------------------

function clampString(v: unknown, max: number, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return fallback;
  // Strip control characters; this text is rendered on a shared page.
  return s.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max) || fallback;
}

/**
 * Plausibility ceilings for one submitted row.
 *
 * These are not type guards - they are sanity bounds, and they are deliberately
 * much tighter than "what fits in a double". A whole school's annual electricity
 * bill is on the order of a few hundred thousand dollars, so a single device
 * category in a single room claiming more than $250k is not a real reading, it is
 * either a bug or somebody playing with the endpoint. Either way it must not be
 * allowed to dominate a ranked list that thirty other people are looking at.
 */
const CAP = {
  count: 2000,
  perUnitWatts: 20000,
  totalWatts: 500000,
  kwh: 2_000_000,
  dollars: 250000,
  co2Kg: 1_000_000,
  fixCost: 100000,
  paybackMonths: 1200,
} as const;

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Accept an offender row from an untrusted client.
 *
 * Every numeric field is re-clamped rather than trusted, because a contributor
 * posting `costPerYear: 1e9` would otherwise poison a shared page that other
 * students are looking at. Returns null for anything unusable.
 */
export function sanitizeOffender(raw: unknown): Offender | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const categoryId = clampString(o.categoryId, 60, "");
  if (!categoryId) return null;

  const state = o.state === "on" || o.state === "standby" || o.state === "off" ? o.state : "on";
  const confidence =
    o.confidence === "high" || o.confidence === "medium" || o.confidence === "low"
      ? o.confidence
      : "medium";

  const action = (o.action ?? {}) as Record<string, unknown>;

  return {
    id: clampString(o.id, 60, categoryId),
    categoryId,
    label: clampString(o.label, 80, categoryId),
    icon: clampString(o.icon, 40, "plug"),
    count: Math.min(CAP.count, Math.max(0, Math.round(num(o.count, 1)))),
    state,
    perUnitWatts: Math.min(CAP.perUnitWatts, Math.max(0, num(o.perUnitWatts))),
    totalWatts: Math.min(CAP.totalWatts, Math.max(0, num(o.totalWatts))),
    kwhPerYear: Math.min(CAP.kwh, Math.max(0, num(o.kwhPerYear))),
    costPerYear: Math.min(CAP.dollars, Math.max(0, num(o.costPerYear))),
    co2KgPerYear: Math.min(CAP.co2Kg, Math.max(0, num(o.co2KgPerYear))),
    costLowPerYear: Math.min(CAP.dollars, Math.max(0, num(o.costLowPerYear))),
    costHighPerYear: Math.min(CAP.dollars, Math.max(0, num(o.costHighPerYear))),
    group: (typeof o.group === "string" ? o.group : "office") as Offender["group"],
    action: {
      label: clampString(action.label, 120, "Review this device"),
      type: (typeof action.type === "string" ? action.type : "policy") as Offender["action"]["type"],
      cost: Math.min(CAP.fixCost, Math.max(0, num(action.cost))),
      savingsFraction: Math.min(1, Math.max(0, num(action.savingsFraction, 0.5))),
      note: clampString(action.note, 400, ""),
    },
    fixCost: Math.min(CAP.fixCost, Math.max(0, num(o.fixCost))),
    annualSavings: Math.min(CAP.dollars, Math.max(0, num(o.annualSavings))),
    paybackMonths:
      o.paybackMonths === null || o.paybackMonths === undefined
        ? null
        : Math.min(CAP.paybackMonths, Math.max(0, num(o.paybackMonths))),
    confidence,
    source: clampString(o.source, 80, "shared scan"),
  };
}

/** Validate a whole submitted contribution. Returns null if it is not usable. */
export function sanitizeContribution(raw: unknown, id: string): Contribution | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;

  const offendersRaw = Array.isArray(c.offenders) ? c.offenders : [];
  const offenders = offendersRaw
    .slice(0, MAX_OFFENDERS_PER_CONTRIBUTION)
    .map(sanitizeOffender)
    .filter((o): o is Offender => o !== null);

  if (offenders.length === 0) return null;

  const mode =
    c.mode === "live" || c.mode === "fallback" || c.mode === "mixed" ? c.mode : "fallback";

  return {
    id,
    area: clampString(c.area, MAX_NAME_LEN, "Unnamed area"),
    contributor: clampString(c.contributor, MAX_NAME_LEN, "Anonymous"),
    at: new Date().toISOString(),
    mode,
    offenders,
  };
}
