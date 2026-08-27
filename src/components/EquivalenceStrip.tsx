"use client";

// Making the number mean something.
//
// "11.2 tonnes of CO2e" is a fact nobody can picture, which makes it a fact nobody
// acts on. The same figure as "roughly 2 cars taken off the road for a year" is a
// sentence that ends up in a school newsletter. Both are the same measurement;
// only one of them travels.

import { bestEquivalences, spendEquivalences, fmtEquiv } from "@/lib/equivalence";

const GLYPH: Record<string, string> = {
  car: "M3 13l1.6-4.2A2 2 0 016.5 7.5h11a2 2 0 011.9 1.3L21 13v5h-2.5v-1.5h-13V18H3v-5zm3 1.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zm12 0a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z",
  tree: "M12 2l5 7h-3l4 6h-4v7h-4v-7H6l4-6H7l5-7z",
  home: "M12 3l9 8h-3v10h-5v-6h-2v6H6V11H3l9-8z",
  road: "M4 21L9 3h2l-1 18H4zm10-18h2l5 18h-6l-1-18zM11.5 5h1v3h-1V5zm0 5.5h1v3h-1v-3zm0 5.5h1v3h-1v-3z",
  plane: "M21 15v-2l-8-5V3.5a1.5 1.5 0 00-3 0V8l-8 5v2l8-2.5V17l-2.5 1.5V20l4-1 4 1v-1.5L13 17v-4.5L21 15z",
  fuel: "M5 3h8a2 2 0 012 2v14h1v-6h2V9l-2-2V5l3 3v9a2 2 0 01-2 2h-4V5H5v16H3V5a2 2 0 012-2z",
};

export function EquivalenceStrip({
  co2Kg,
  dollars,
}: {
  co2Kg: number;
  dollars: number;
}) {
  const carbon = bestEquivalences(co2Kg, 3);
  const spend = spendEquivalences(dollars).slice(0, 3);

  if (!carbon.length && !spend.length) return null;

  return (
    <section className="panel ticked p-5 sm:p-6">
      <h3 className="mono-label">what that actually means</h3>

      {carbon.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {carbon.map((e, i) => (
            <div
              key={e.id}
              className="rise-in flex items-start gap-3 border border-line bg-surface2/50 p-3.5"
              style={{ "--i": i } as React.CSSProperties}
            >
              <svg
                viewBox="0 0 24 24"
                className="mt-0.5 h-5 w-5 shrink-0 fill-cyan/80"
                aria-hidden
              >
                <path d={GLYPH[e.icon] ?? GLYPH.tree} />
              </svg>
              <div className="min-w-0">
                <div className="font-mono text-lg font-bold text-fog tabular-nums">
                  {fmtEquiv(e.value)}{" "}
                  <span className="text-sm font-normal text-mist">{e.unit}</span>
                </div>
                <p className="mt-0.5 text-[0.8rem] leading-snug text-dim">{e.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {spend.length > 0 && (
        <div className="mt-4 border-l-2 border-lime/60 bg-surface2/40 px-4 py-3">
          <p className="mono-label text-lime">and the money</p>
          <p className="mt-1.5 text-sm leading-relaxed text-mist">
            Every year, this building is spending the equivalent of{" "}
            {spend.map((s, i) => (
              <span key={s.label}>
                {i > 0 && (i === spend.length - 1 ? ", or " : ", ")}
                <strong className="font-mono font-semibold text-fog tabular-nums">
                  {fmtEquiv(s.value)}
                </strong>{" "}
                {s.label}
              </span>
            ))}{" "}
            on electricity nobody is using.
          </p>
        </div>
      )}
    </section>
  );
}
