"use client";

// One way in to a team, whichever backend this deployment has.
//
//   server: Upstash Redis behind /api/class (durable for two weeks)
//   relay:  encrypted messages over ntfy.sh, straight from the browser (teamRelay.ts)
//
// The choice is made per deployment, not per team: every phone on the same site asks
// the same /api/class and gets the same answer, so a code typed on one phone always
// reaches the board on another.

import { useEffect, useState } from "react";
import { areaSummaries, classTotals, makeCode, mergeContributions, type AreaSummary, type ClassTotals, type Contribution, type MergedRow } from "./classroom";
import type { Offender } from "./types";
import { relayCreate, relaySubmit, relaySubscribe } from "./teamRelay";

export type TeamVia = "server" | "relay";

export interface TeamBoard {
  code: string;
  buildingName: string;
  regionCode: string;
  createdAt: string;
  durable: boolean;
  via: TeamVia;
  rows: MergedRow[];
  totals: ClassTotals;
  areas: AreaSummary[];
}

let viaPromise: Promise<TeamVia> | null = null;

export function teamVia(): Promise<TeamVia> {
  viaPromise ??= fetch("/api/class", { cache: "no-store" })
    .then((r) => r.json())
    .then((j: { durable?: boolean }) => (j.durable ? "server" : "relay") as TeamVia)
    .catch(() => "relay" as TeamVia);
  return viaPromise;
}

export async function createTeam(buildingName: string, regionCode: string): Promise<string> {
  if ((await teamVia()) === "server") {
    const res = await fetch("/api/class", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildingName, regionCode }),
    });
    const json = (await res.json()) as { code?: string; error?: string };
    if (!res.ok || !json.code) throw new Error(json.error ?? "Couldn't start a team.");
    return json.code;
  }
  const code = makeCode();
  try {
    await relayCreate(code, buildingName.trim().slice(0, 60) || "Our building", regionCode);
  } catch {
    throw new Error("Couldn't reach the team relay. If you're on a school network it may be blocked; try a phone hotspot.");
  }
  return code;
}

export async function submitToTeam(
  code: string,
  c: { area: string; contributor: string; mode: Contribution["mode"]; offenders: Offender[] },
): Promise<void> {
  if ((await teamVia()) === "server") {
    const res = await fetch(`/api/class/${code}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) throw new Error(json.error ?? "The team didn't accept that.");
    return;
  }
  try {
    await relaySubmit(code, c);
  } catch (e) {
    throw new Error(
      e instanceof Error && e.message === "busy"
        ? "Lots of scans arriving at once. Wait a few seconds and send again."
        : "Couldn't reach the team relay. Check your connection.",
    );
  }
}

const POLL_MS = 6000;

/** Follow a team's board live. */
export function useTeamBoard(code: string): { data: TeamBoard | null; error: string | null; via: TeamVia | null } {
  const [data, setData] = useState<TeamBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [via, setVia] = useState<TeamVia | null>(null);

  useEffect(() => {
    if (!code) return;
    let stop = () => {};
    let cancelled = false;

    void teamVia().then((v) => {
      if (cancelled) return;
      setVia(v);

      if (v === "relay") {
        stop = relaySubscribe(code, ({ session, loaded, error }) => {
          if (session) {
            const c = session.contributions;
            setData({
              code,
              buildingName: session.buildingName,
              regionCode: session.regionCode,
              createdAt: session.createdAt,
              durable: false,
              via: "relay",
              rows: mergeContributions(c),
              totals: classTotals(c),
              areas: areaSummaries(c),
            });
            setError(error);
          } else if (loaded) {
            setError(error ?? "No team with that code yet. Check the code, or ask whoever started it to keep their team page open.");
          }
        });
        return;
      }

      const load = async () => {
        try {
          const res = await fetch(`/api/class/${code}`, { cache: "no-store" });
          const json = (await res.json()) as Omit<TeamBoard, "via"> & { error?: string };
          if (cancelled) return;
          if (!res.ok) {
            setError(json.error ?? "That team couldn't be found. Codes expire after two weeks.");
            setData(null);
            return;
          }
          setData({ ...json, via: "server" });
          setError(null);
        } catch {
          if (!cancelled) setError("Couldn't reach the team. Check your connection.");
        }
      };
      void load();
      const t = setInterval(load, POLL_MS);
      stop = () => clearInterval(t);
    });

    return () => {
      cancelled = true;
      stop();
      setData(null);
      setError(null);
    };
  }, [code]);

  return { data, error, via };
}
