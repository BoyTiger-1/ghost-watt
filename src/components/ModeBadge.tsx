import type { AnalysisMode } from "@/lib/types";

export function ModeBadge({ mode, engine }: { mode: AnalysisMode; engine?: string }) {
  const live = mode === "live";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium"
      style={{
        borderColor: live ? "var(--color-cyan)" : "var(--color-amber)",
        color: live ? "var(--color-cyan)" : "var(--color-amber)",
        background: live ? "rgba(58,69,102,0.08)" : "rgba(239,157,46,0.12)",
      }}
      title={
        live
          ? `Identified by the local vision model${engine ? ` (${engine})` : ""}.`
          : "Estimated from a typical room profile - the local model didn't read this one."
      }
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: live ? "var(--color-cyan)" : "var(--color-amber)" }}
      />
      {live ? "live model" : "estimated"}
    </span>
  );
}
