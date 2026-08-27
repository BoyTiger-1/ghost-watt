"use client";

// One shared copy of the saved store across every page.
//
// localStorage is the source of truth, but three pages read it at once and a
// change on any of them has to show up on the others immediately. Rather than
// pulling in a state library for four fields, this keeps a module-level snapshot
// and a set of subscribers, and feeds React through useSyncExternalStore - which
// is exactly the problem that hook exists to solve, including the server-render
// case where there is no localStorage at all.

import { useCallback, useSyncExternalStore } from "react";
import {
  EMPTY_STORE,
  loadStore,
  saveStore,
  uid,
  type Building,
  type FixRecord,
  type SavedAudit,
  type Store,
} from "./storage";
import { BUILDING_TYPES } from "./benchmark";
import { SCHEDULE_BY_ID, SCHEDULE_PRESETS } from "./schedule";
import { US_AVERAGE } from "./grid";

let snapshot: Store | null = null;
const listeners = new Set<() => void>();

function current(): Store {
  if (snapshot === null) snapshot = loadStore();
  return snapshot;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Another tab writing the same key should update this one too.
  const onStorage = () => {
    snapshot = loadStore();
    emit();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** Apply a change, persist it, and tell every subscriber. */
export function mutate(fn: (s: Store) => Store): Store {
  const next = fn(current());
  snapshot = next;
  saveStore(next);
  emit();
  return next;
}

export function useStore(): Store {
  return useSyncExternalStore(subscribe, current, () => EMPTY_STORE);
}

/**
 * The store as it is right now, outside of React's render cycle.
 *
 * During hydration useStore() necessarily hands back EMPTY_STORE - the server had
 * no localStorage to read - so an effect that fires on mount and closes over that
 * value will think there are no saved buildings and helpfully create a duplicate.
 * Effects that decide whether to write should ask this instead.
 */
export function currentStore(): Store {
  return current();
}

// ---- convenience actions ------------------------------------------------

export function newBuilding(name: string, typeId = "k12", regionCode = "US"): Building {
  const type = BUILDING_TYPES.find((t) => t.id === typeId) ?? BUILDING_TYPES[0];
  const preset = SCHEDULE_BY_ID[type.schedulePreset] ?? SCHEDULE_PRESETS[0];
  return {
    id: uid("b"),
    name: name.trim() || "Untitled building",
    typeId: type.id,
    regionCode,
    floorAreaSqFt: 0,
    schedule: preset.schedule,
    createdAt: new Date().toISOString(),
  };
}

export function addBuilding(b: Building) {
  mutate((s) => ({
    ...s,
    buildings: [...s.buildings, b],
    activeBuildingId: b.id,
  }));
}

export function updateBuilding(id: string, patch: Partial<Building>) {
  mutate((s) => ({
    ...s,
    buildings: s.buildings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  }));
}

export function removeBuilding(id: string) {
  mutate((s) => ({
    ...s,
    buildings: s.buildings.filter((b) => b.id !== id),
    audits: s.audits.filter((a) => a.buildingId !== id),
    fixes: s.fixes.filter((f) => f.buildingId !== id),
    activeBuildingId: s.activeBuildingId === id ? null : s.activeBuildingId,
  }));
}

export function setActiveBuilding(id: string | null) {
  mutate((s) => ({ ...s, activeBuildingId: id }));
}

export function addAudit(audit: SavedAudit) {
  mutate((s) => ({ ...s, audits: [...s.audits, audit] }));
}

export function removeAudit(id: string) {
  mutate((s) => ({ ...s, audits: s.audits.filter((a) => a.id !== id) }));
}

export function addFix(fix: FixRecord) {
  mutate((s) => ({ ...s, fixes: [...s.fixes, fix] }));
}

export function verifyFix(id: string, verifiedAnnualSavings: number) {
  mutate((s) => ({
    ...s,
    fixes: s.fixes.map((f) =>
      f.id === id
        ? { ...f, verifiedAt: new Date().toISOString(), verifiedAnnualSavings }
        : f,
    ),
  }));
}

export function removeFix(id: string) {
  mutate((s) => ({ ...s, fixes: s.fixes.filter((f) => f.id !== id) }));
}

export function replaceStore(store: Store) {
  mutate(() => store);
}

/** A first building, so a new user is never looking at an empty selector. */
export function ensureBuilding(store: Store): Building {
  const active = store.buildings.find((b) => b.id === store.activeBuildingId);
  if (active) return active;
  if (store.buildings[0]) {
    setActiveBuilding(store.buildings[0].id);
    return store.buildings[0];
  }
  const b = newBuilding("My building", "k12", US_AVERAGE.code);
  addBuilding(b);
  return b;
}
