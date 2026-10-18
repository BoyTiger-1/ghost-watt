"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { summarizeEfficiency, type Assessment } from "@/lib/efficiency";
import { fmtMoney } from "@/lib/energy";
import type { AuditSettings, Offender } from "@/lib/types";

const GRADE_COLOR: Record<Assessment["grade"], string> = {
  A: "var(--color-lime)",
  B: "#5c8a3a",
  C: "var(--color-amber)",
  D: "#d0711f",
  F: "var(--color-ember)",
};

/**
 * The audit as three to-do lists: what to replace, what to stop doing, what is
 * fine. A facilities budget and a family both decide in exactly these terms.
 */
export function EfficiencyPanel({ offenders, settings }: { offenders: Offender[]; settings: AuditSettings }) {
  const s = useMemo(() => summarizeEfficiency(offenders, settings), [offenders, settings]);
  const [open, setOpen] = useState<"replace" | "habit" | "fine" | null>(s.replace.length ? "replace" : "habit");
  const groups = [
    { id: "replace" as const, title: "Replace", sub: s.replace.length ? `saves ~${fmtMoney(s.replaceSavings)}/yr in normal use` : "nothing inefficient found", items: s.replace, tone: "text-ember" },
    { id: "habit" as const, title: "Fix the habit", sub: "efficient hardware, left on or idling", items: s.habit, tone: "text-amber" },
    { id: "fine" as const, title: "Fine", sub: "efficient, nothing to do", items: s.fine, tone: "text-lime" },
  ];

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel overflow-hidden" aria-label="Efficiency">
      <div className="border-b border-line px-4 py-3">
        <div className="mono-label text-cyan">efficiency check</div>
        <p className="mt-1 text-[0.85rem] leading-relaxed text-mist">
          Each device against an efficient modern equivalent: is it bad hardware, or good hardware used badly?
        </p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setOpen(open === g.id ? null : g.id)}
            aria-expanded={open === g.id}
            className={`px-3 py-3 text-left transition-colors ${open === g.id ? "bg-surface2/70" : "hover:bg-surface2/40"}`}
          >
            <div className={`font-mono text-2xl font-bold ${g.tone}`}>{g.items.length}</div>
            <div className="text-[0.82rem] font-medium text-fog">{g.title}</div>
            <div className="hidden text-[0.7rem] leading-snug text-dim sm:block">{g.sub}</div>
          </button>
        ))}
      </div>
      {open && (
        <ul className="divide-y divide-line">
          {groups
            .find((g) => g.id === open)!
            .items.map(({ offender: o, a }) => (
              <li key={o.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-[1.05rem] font-bold text-white"
                  style={{ background: GRADE_COLOR[a.grade] }}
                  title={a.assumed ? "Graded on a typical unit of this kind" : "Graded on this unit's reading"}
                >
                  {a.grade}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-[0.9rem] font-medium text-fog">
                      {o.label}
                      {o.count > 1 ? <span className="text-mist"> ×{o.count}</span> : null}
                    </span>
                    {a.replace && (open === "replace") && (
                      <span className="font-mono text-[0.75rem] text-lime">+{fmtMoney(a.replace.savingsPerYear)}/yr</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[0.8rem] leading-relaxed text-mist">{a.detail}</p>
                  {a.assumed && <p className="mt-0.5 text-[0.7rem] text-dim">Typical unit assumed. Add its wattage, or scan with AI, for a real grade.</p>}
                </div>
              </li>
            ))}
          {groups.find((g) => g.id === open)!.items.length === 0 && (
            <li className="px-4 py-4 text-center text-[0.84rem] text-dim">Nothing here.</li>
          )}
        </ul>
      )}
    </motion.section>
  );
}

export { GRADE_COLOR };
