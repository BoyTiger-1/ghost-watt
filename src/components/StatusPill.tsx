"use client";

import { useEffect, useState } from "react";

interface Status {
  reachable: boolean;
  hasModel: boolean;
  model: string;
  host: string;
}

export function StatusPill({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const data = (await res.json()) as Status;
        if (alive) setStatus(data);
      } catch {
        if (alive) setStatus({ reachable: false, hasModel: false, model: "", host: "" });
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

  const live = !!status?.reachable && !!status?.hasModel;
  const color = loading ? "var(--color-dim)" : live ? "var(--color-cyan)" : "var(--color-amber)";
  const label = loading
    ? "checking"
    : live
      ? "live"
      : status?.reachable
        ? "model missing"
        : "fallback mode";

  return (
    <div
      className="flex items-center gap-2 border border-line bg-surface/70 px-2.5 py-1.5 font-mono text-[0.68rem] tracking-wider"
      title={
        live
          ? `Local vision model ready at ${status?.host}`
          : status?.reachable
            ? `Ollama is running but ${status?.model} isn't pulled. Run: ollama pull ${status?.model}`
            : "Ollama not reachable — audits use the room-profile estimator. Start Ollama to go live."
      }
    >
      <span
        className={`inline-block h-2 w-2 ${live ? "pulse-dot" : ""}`}
        style={{ background: color }}
      />
      {!compact && <span style={{ color }}>{label}</span>}
    </div>
  );
}
