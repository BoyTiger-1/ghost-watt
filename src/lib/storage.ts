// Persistence.
//
// Everything used to live in one useState and die on refresh, which meant Ghost
// Watt could show you a problem but never that you had fixed it. A saved history
// is what turns a one-shot estimate into an accountability record: here is what we
// said in September, here is the timer we installed in October, here is the same
// room re-scanned in November.
//
// localStorage on purpose. No accounts, no server, no database, nothing about a
// school building leaving the device - which keeps the privacy promise on the
// landing page literally true. The schema is versioned so a future migration has
// something to migrate from.

import type { AuditSettings, Offender } from "./types";
import type { WeeklySchedule } from "./schedule";
import type { UtilityBill } from "./calibration";

export const SCHEMA_VERSION = 1;
const KEY = "ghostwatt.store.v1";

export interface SavedAudit {
  id: string;
  buildingId: string;
  /** ISO timestamp. */
  at: string;
  /** Room / area name this audit covered. */
  areas: string[];
  offenders: Offender[];
  settings: AuditSettings;
  /** "live" if any offender came from a real model reading. */
  mode: "live" | "fallback" | "mixed";
  engine: string;
  note?: string;
}

export interface FixRecord {
  id: string;
  buildingId: string;
  /** Which device category was fixed. */
  categoryId: string;
  /** The area it was fixed in. */
  area: string;
  label: string;
  actionLabel: string;
  costPaid: number;
  expectedAnnualSavings: number;
  /** ISO date the fix was installed. */
  installedAt: string;
  /** Set once a later audit confirms the load is gone. */
  verifiedAt?: string;
  /** Annual savings actually observed by re-scan, if verified. */
  verifiedAnnualSavings?: number;
}

export interface Building {
  id: string;
  name: string;
  typeId: string;
  regionCode: string;
  floorAreaSqFt: number;
  schedule: WeeklySchedule;
  createdAt: string;
  /**
   * Where the building physically is, if the user chose to say.
   *
   * Optional on purpose, and optional in both directions: a building saved
   * before this field existed still loads, and a user who declines the browser
   * location prompt loses nothing but the weather and utility-rate panels. Both
   * are additive, so neither is allowed to become a prerequisite for an audit.
   */
  lat?: number;
  lon?: number;
  /**
   * One line off one real utility bill, if anybody has typed it in.
   *
   * This is the highest-value optional field in the whole record: it replaces the
   * state-average electricity price with the price this building actually pays,
   * and it lets the app check its own output against a meter reading. Optional
   * like everything else here - without it the report still runs on published
   * averages and says so.
   */
  bill?: UtilityBill;
}

export interface Store {
  version: number;
  buildings: Building[];
  audits: SavedAudit[];
  fixes: FixRecord[];
  activeBuildingId: string | null;
}

export const EMPTY_STORE: Store = {
  version: SCHEMA_VERSION,
  buildings: [],
  audits: [],
  fixes: [],
  activeBuildingId: null,
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadStore(): Store {
  if (!isBrowser()) return EMPTY_STORE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STORE;
    const parsed = JSON.parse(raw) as Partial<Store>;
    if (typeof parsed !== "object" || parsed === null) return EMPTY_STORE;
    return {
      version: SCHEMA_VERSION,
      buildings: Array.isArray(parsed.buildings) ? parsed.buildings : [],
      audits: Array.isArray(parsed.audits) ? parsed.audits : [],
      fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
      activeBuildingId: parsed.activeBuildingId ?? null,
    };
  } catch {
    // A corrupt store should never take the app down with it.
    return EMPTY_STORE;
  }
}

export function saveStore(store: Store): boolean {
  if (!isBrowser()) return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...store, version: SCHEMA_VERSION }));
    return true;
  } catch {
    // Quota exceeded, private mode, or site data blocked. Not fatal.
    return false;
  }
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---- derived views ------------------------------------------------------

/** Audits for one building, newest first. */
export function auditsFor(store: Store, buildingId: string): SavedAudit[] {
  return store.audits
    .filter((a) => a.buildingId === buildingId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function fixesFor(store: Store, buildingId: string): FixRecord[] {
  return store.fixes
    .filter((f) => f.buildingId === buildingId)
    .sort((a, b) => Date.parse(b.installedAt) - Date.parse(a.installedAt));
}

export interface BuildingProgress {
  auditCount: number;
  firstAuditAt: string | null;
  latestAuditAt: string | null;
  /** Annual waste at the first audit. */
  baselineCost: number;
  /** Annual waste at the most recent audit. */
  currentCost: number;
  /** Difference between baseline and current, positive = improvement. */
  reducedCost: number;
  reducedPct: number;
  fixesInstalled: number;
  fixesVerified: number;
  spent: number;
  /** Expected annual savings from everything installed so far. */
  claimedSavings: number;
}

export function buildingProgress(store: Store, buildingId: string): BuildingProgress {
  const audits = auditsFor(store, buildingId);
  const fixes = fixesFor(store, buildingId);

  const totalOf = (a: SavedAudit) => a.offenders.reduce((s, o) => s + o.costPerYear, 0);
  const latest = audits[0] ?? null;
  const first = audits[audits.length - 1] ?? null;

  const baselineCost = first ? totalOf(first) : 0;
  const currentCost = latest ? totalOf(latest) : 0;
  const reducedCost = baselineCost - currentCost;

  return {
    auditCount: audits.length,
    firstAuditAt: first?.at ?? null,
    latestAuditAt: latest?.at ?? null,
    baselineCost,
    currentCost,
    reducedCost,
    reducedPct: baselineCost > 0 ? reducedCost / baselineCost : 0,
    fixesInstalled: fixes.length,
    fixesVerified: fixes.filter((f) => f.verifiedAt).length,
    spent: fixes.reduce((s, f) => s + f.costPaid, 0),
    claimedSavings: fixes.reduce((s, f) => s + f.expectedAnnualSavings, 0),
  };
}

/**
 * Compare two audits of the same building, category by category.
 * This is the verification loop: what actually changed between visits.
 */
export interface DeltaRow {
  categoryId: string;
  label: string;
  beforeCost: number;
  afterCost: number;
  change: number;
  status: "resolved" | "reduced" | "unchanged" | "worse" | "new";
}

export function compareAudits(before: SavedAudit, after: SavedAudit): DeltaRow[] {
  const sum = (list: Offender[]) => {
    const m = new Map<string, { label: string; cost: number }>();
    for (const o of list) {
      const cur = m.get(o.categoryId);
      if (cur) cur.cost += o.costPerYear;
      else m.set(o.categoryId, { label: o.label, cost: o.costPerYear });
    }
    return m;
  };

  const b = sum(before.offenders);
  const a = sum(after.offenders);
  const ids = new Set([...b.keys(), ...a.keys()]);

  const rows: DeltaRow[] = [];
  for (const id of ids) {
    const beforeCost = b.get(id)?.cost ?? 0;
    const afterCost = a.get(id)?.cost ?? 0;
    const change = afterCost - beforeCost;
    const label = a.get(id)?.label ?? b.get(id)?.label ?? id;

    let status: DeltaRow["status"];
    if (beforeCost === 0) status = "new";
    else if (afterCost === 0) status = "resolved";
    else if (change < -1) status = "reduced";
    else if (change > 1) status = "worse";
    else status = "unchanged";

    rows.push({ categoryId: id, label, beforeCost, afterCost, change, status });
  }

  return rows.sort((x, y) => x.change - y.change);
}
