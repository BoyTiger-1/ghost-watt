import type { AnalysisMode } from "@/lib/types";

export function ModeBadge({ mode, engine }: { mode: AnalysisMode; engine?: string }) {
  const live = mode === "live";
  return (
    <span
      className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[0.62rem] tracking-[0.14em] uppercase"
      style={{
        borderColor: live ? "var(--color-cyan)" : "var(--color-amber)",
        color: live ? "var(--color-cyan)" : "var(--color-amber)",
        background: live ? "rgba(47,230,207,0.08)" : "rgba(255,178,77,0.08)",
      }}
      title={
        live
          ? `Identified by the local vision model${engine ? ` (${engine})` : ""}.`
          : "Estimated from a typical room profile — the local model didn't read this one."
      }
    >
      <span
        className="h-1.5 w-1.5"
        style={{ background: live ? "var(--color-cyan)" : "var(--color-amber)" }}
      />
      {live ? "live model" : "estimated"}
    </span>
  );
}
