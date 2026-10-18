"use client";

// Which engine a scan would use, right now.
//
// This pill used to answer one question - is Ollama up - and so it only had two
// states worth showing. Now that perception falls through local, then hosted,
// then the deterministic estimator, it has to say *which* of the three is about
// to run, because that changes what the user should expect from the next scan.

import { useEffect, useState } from "react";

interface VisionStatus {
  ready: boolean;
  active: "local" | "hosted" | "none";
  activeLabel: string;
  activeModel: string;
  local: { reachable: boolean; hasModel: boolean; model: string; host: string };
  hosted: { id: string; label: string; configured: boolean }[];
}

const TINT: Record<VisionStatus["active"], string> = {
  local: "var(--color-lime)",
  hosted: "var(--color-cyan)",
  none: "var(--color-sodium)",
};

const LABEL: Record<VisionStatus["active"], string> = {
  local: "Live · on this machine",
  hosted: "Live · hosted model",
  none: "Estimate mode",
};

export function StatusPill({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<VisionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const data = (await res.json()) as VisionStatus;
        if (alive) setStatus(data);
      } catch {
        if (alive) setStatus(null);
      } finally {
        if (alive) setLoading(false);
      }
    };
    check();
    const id = setInterval(check, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const active = status?.active ?? "none";
  const color = loading ? "var(--color-dim)" : TINT[active];
  const label = loading ? "Checking…" : LABEL[active];

  return (
    <div
      className={`flex h-9 items-center gap-2 rounded-full border border-line bg-surface text-[0.8rem] text-mist ${compact ? "w-9 justify-center" : "px-3"}`}
      title={title(status, loading)}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${status?.ready ? "pulse-dot" : ""}`}
        style={{ background: color }}
      />
      {!compact && <span>{label}</span>}
    </div>
  );
}

function title(status: VisionStatus | null, loading: boolean): string {
  if (loading) return "Checking which vision engine is available…";
  if (!status) return "Status unavailable - scans will use the room-profile estimate.";

  if (status.active === "local") {
    return `Reading photos locally with ${status.activeModel} at ${status.local.host}. Nothing is uploaded.`;
  }
  if (status.active === "hosted") {
    return `Reading photos with ${status.activeLabel}, ${status.activeModel}. Photos are sent to that provider for the scan and are not stored.`;
  }
  if (status.local.reachable) {
    return `Ollama is running but ${status.local.model} is not pulled. Run: ollama pull ${status.local.model}`;
  }
  return "No vision engine reachable - scans fall back to the room-profile estimate, which still produces a full costed audit.";
}
