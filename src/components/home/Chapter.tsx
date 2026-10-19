/** A quiet chapter marker: "01 ——— See". */
export function Chapter({ n, label, tone = "dark" }: { n: string; label: string; tone?: "dark" | "light" }) {
  const ink = tone === "dark" ? "text-graphite" : "text-moon";
  const rule = tone === "dark" ? "bg-graphite/25" : "bg-moon/30";
  return (
    <p className={`flex items-center gap-3 text-[0.85rem] ${ink}`}>
      <span className="font-numeric text-[0.78rem] opacity-60">{n}</span>
      <span className={`h-px w-10 ${rule}`} />
      <span>{label}</span>
    </p>
  );
}
