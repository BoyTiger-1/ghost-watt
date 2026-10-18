"use client";

// Which path reads the picture, and whether it can right now.
//
// Two paths exist and the user must always be able to tell which one is about
// to run, because they differ in exactly one way that matters: whether the
// picture leaves the phone.
//
//   on-device   the small detector in the browser. Nothing is uploaded. Finds
//               screens, laptops, appliances and lit fixtures; cannot tell a
//               projector from a printer.
//   enhanced    the frame is sent to the vision-language model behind
//               /api/analyze and read there. Finds many more device types and
//               judges on / standby / off. Needs the network and a configured
//               engine on the server.
//
// The mode shown everywhere is the one that will actually run: the server's
// engine status, the user's own choice, and the network, resolved here once so
// the header pill, the camera and the scanner cannot disagree.

import { useSyncExternalStore } from "react";
import type { AnalysisMode } from "./types";

export interface EngineStatus {
  ready: boolean;
  active: "local" | "hosted" | "none";
  activeLabel: string;
  activeModel: string;
}

export interface EngineState {
  /** What the server says it can do. Null until the first probe answers. */
  server: EngineStatus | null;
  /** The probe itself failed: no answer from /api/status at all. */
  unreachable: boolean;
  /** The user's choice. Enhanced is preferred when it is available. */
  preference: AnalysisMode;
  online: boolean;
}

export interface EngineMode {
  /** The path a scan started now would take. */
  mode: AnalysisMode;
  /** Short label for the pill. */
  label: string;
  /** One sentence on what that means for the picture. */
  detail: string;
  /** Enhanced is configured on the server and the user could switch to it. */
  enhancedAvailable: boolean;
  /** Still waiting for the first status probe. */
  checking: boolean;
  offline: boolean;
  state: EngineState;
}

const PREF_KEY = "gw-engine";

let state: EngineState = {
  server: null,
  unreachable: false,
  preference: "enhanced",
  online: true,
};
const listeners = new Set<() => void>();
let started = false;

function emit() {
  for (const l of listeners) l();
}

function set(patch: Partial<EngineState>) {
  state = { ...state, ...patch };
  emit();
}

async function probe() {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as EngineStatus;
    set({ server: { ready: !!data.ready, active: data.active, activeLabel: data.activeLabel, activeModel: data.activeModel }, unreachable: false });
  } catch {
    set({ unreachable: true });
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const saved = localStorage.getItem(PREF_KEY);
    if (saved === "on-device" || saved === "enhanced") state = { ...state, preference: saved };
  } catch {
    // Storage blocked: the default stands.
  }
  state = { ...state, online: navigator.onLine };
  window.addEventListener("online", () => {
    set({ online: true });
    probe();
  });
  window.addEventListener("offline", () => set({ online: false }));
  probe();
  setInterval(probe, 30000);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  start();
  return () => {
    listeners.delete(fn);
  };
}

const SERVER_SNAPSHOT: EngineState = { server: null, unreachable: false, preference: "enhanced", online: true };

export function setEnginePreference(p: AnalysisMode) {
  try {
    localStorage.setItem(PREF_KEY, p);
  } catch {
    // Not remembered, still applied.
  }
  set({ preference: p });
}

/** Ask the server again now, e.g. after the user changed a key. */
export function recheckEngine() {
  return probe();
}

/** The resolved mode, from a raw state. Pure, so it can be tested. */
export function resolveEngine(s: EngineState): EngineMode {
  const checking = s.server === null && !s.unreachable;
  const enhancedAvailable = !!s.server?.ready;
  const offline = !s.online;
  const wants = s.preference === "enhanced";
  const mode: AnalysisMode = wants && enhancedAvailable && !offline ? "enhanced" : "on-device";

  let label: string;
  let detail: string;
  if (offline) {
    label = "Offline · on-device";
    detail = "No connection. Scans are read by the detector in this browser and nothing is uploaded. Cloud reading resumes when you are back online.";
  } else if (mode === "enhanced") {
    label = "Enhanced (cloud)";
    detail = `Photos you scan are sent to ${s.server?.activeLabel ?? "the vision model"} (${s.server?.activeModel ?? ""}) to be read, then discarded. Nothing else leaves the device.`;
  } else if (checking) {
    label = "Checking…";
    detail = "Finding out whether a cloud model is available.";
  } else if (!enhancedAvailable) {
    label = "On-device";
    detail = s.unreachable
      ? "The server could not be reached, so scans are read in this browser and nothing is uploaded."
      : "No cloud vision model is configured on this deployment, so scans are read in this browser. Nothing is uploaded.";
  } else {
    label = "On-device";
    detail = "You chose to keep pictures on this device. Scans are read by the detector in this browser and nothing is uploaded.";
  }
  return { mode, label, detail, enhancedAvailable, checking, offline, state: s };
}

export function useEngine(): EngineMode {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER_SNAPSHOT);
  return resolveEngine(s);
}

/** Engine label for an on-device result, kept in one place. */
export const ON_DEVICE_ENGINE = "On-device · EfficientDet + scene analysis";

/** Plain words for an error the analysis endpoint returned. */
export function describeAnalyzeError(status: number, body: { error?: string; code?: string; retryAfterSeconds?: number } | null): string {
  if (body?.error) return body.error;
  if (status === 413) return "That picture is too large to send.";
  if (status === 429) return "Too many scans from this network in the last few minutes. Try again shortly.";
  if (status === 503) return "No cloud vision model is available right now.";
  return `The server answered ${status}.`;
}
