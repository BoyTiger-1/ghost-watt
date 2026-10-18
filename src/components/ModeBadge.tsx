import type { AnalysisMode } from "@/lib/types";

/** Which path read this result. Shown on every offender card. */
export function ModeBadge({ mode, engine }: { mode: AnalysisMode; engine?: string }) {
  const cloud = mode === "enhanced";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium"
      style={{
        borderColor: cloud ? "var(--color-cyan)" : "var(--color-lime)",
        color: cloud ? "var(--color-cyan)" : "var(--color-lime)",
        background: cloud ? "rgba(58,69,102,0.08)" : "rgba(46,107,79,0.08)",
      }}
      title={
        cloud
          ? `Read by the cloud vision model${engine ? ` (${engine})` : ""}. The photo was sent for the scan and not stored.`
          : "Read by the small detector in this browser. The photo never left the device. Fewer device types are recognised."
      }
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cloud ? "var(--color-cyan)" : "var(--color-lime)" }} />
      {cloud ? "Enhanced · cloud" : "On-device"}
    </span>
  );
}
