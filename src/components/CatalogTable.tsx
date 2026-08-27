"use client";

// The lookup table, unredacted.
//
// This is the part of Ghost Watt that most energy tools keep behind a login: the
// actual number used for every device, the published range it sits inside, and
// where it came from. If a judge or a facilities director wants to argue with a
// figure, this page is where they find the one to argue with - which is the whole
// point. An estimate you cannot audit is a guess with better typography.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DEVICE_CATALOG } from "@/lib/devices";
import { GROUP_LABELS, type DeviceGroup } from "@/lib/types";
import { groupColor } from "./Charts";

const GROUPS = Object.keys(GROUP_LABELS) as DeviceGroup[];

function fmtW(w: number) {
  return w >= 1000 ? `${(w / 1000).toFixed(1)}k` : String(Math.round(w));
}

export function CatalogTable() {
  const [group, setGroup] = useState<DeviceGroup | "all">("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEVICE_CATALOG.filter((c) => {
      if (group !== "all" && (c.group ?? "specialty") !== group) return false;
      if (!q) return true;
      return (
        c.label.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q)) ||
        c.action.label.toLowerCase().includes(q)
      );
    });
  }, [group, query]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of DEVICE_CATALOG) {
      const g = c.group ?? "specialty";
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  }, []);

  return (
    <div>
      {/* filters */}
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        <FilterChip
          label={`all · ${DEVICE_CATALOG.length}`}
          on={group === "all"}
          onClick={() => setGroup("all")}
        />
        {GROUPS.map((g) => (
          <FilterChip
            key={g}
            label={`${GROUP_LABELS[g]} · ${counts.get(g) ?? 0}`}
            tint={groupColor(g)}
            on={group === g}
            onClick={() => setGroup(g)}
          />
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search device or fix…"
          className="ml-auto min-w-[12rem] flex-1 border border-line bg-surface2 px-3 py-1.5 font-mono text-xs text-fog outline-none placeholder:text-dim focus:border-cyan sm:flex-none"
        />
      </div>

      <div className="mt-4 overflow-x-auto border border-line">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="bg-surface2 font-mono text-[0.66rem] uppercase tracking-wider text-dim">
              <th className="px-3 py-2.5 font-medium">Device</th>
              <th className="px-3 py-2.5 text-right font-medium">On (W)</th>
              <th className="px-3 py-2.5 text-right font-medium">Range</th>
              <th className="px-3 py-2.5 text-right font-medium">Standby</th>
              <th className="px-3 py-2.5 text-right font-medium">Duty</th>
              <th className="px-3 py-2.5 font-medium">Recommended fix</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            <AnimatePresence initial={false}>
              {rows.map((c, i) => (
                <motion.tr
                  key={c.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className={i % 2 ? "bg-surface" : "bg-surface/40"}
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 shrink-0"
                        style={{ background: groupColor(c.group ?? "specialty") }}
                      />
                      <span className="font-sans text-sm text-fog">{c.label}</span>
                      {c.thermostatic && (
                        <span className="shrink-0 text-[0.6rem] text-amber">cycling</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-mist tabular-nums">
                    {fmtW(c.wattsOn)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-dim tabular-nums">
                    {c.wattsLow != null && c.wattsHigh != null
                      ? `${fmtW(c.wattsLow)}–${fmtW(c.wattsHigh)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-mist tabular-nums">
                    {fmtW(c.wattsStandby)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-mist tabular-nums">
                    {c.dutyCycle.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 font-sans text-[0.8rem] text-mist">
                    {c.action.label}
                    <span className="ml-1.5 font-mono text-[0.62rem] text-dim">
                      {c.action.cost > 0 ? `$${c.action.cost}` : "free"} ·{" "}
                      {Math.round(c.action.savingsFraction * 100)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[0.66rem] text-dim">{c.source ?? "—"}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-3 text-sm text-dim">Nothing in the table matches that.</p>
      )}

      <p className="mt-3 font-mono text-[0.7rem] leading-relaxed text-dim">
        Showing {rows.length} of {DEVICE_CATALOG.length} categories. The Range column is the
        published spread for that device class - Ghost Watt carries it through every calculation
        and reports the result as a band, because a single number to the dollar would be a
        precision the input does not have.
      </p>
    </div>
  );
}

function FilterChip({
  label,
  on,
  tint,
  onClick,
}: {
  label: string;
  on: boolean;
  tint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`border px-2.5 py-1 font-mono text-[0.66rem] tracking-wider transition-colors ${
        on ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-line text-dim hover:text-mist"
      }`}
      style={on && tint ? { borderColor: tint, color: tint } : undefined}
    >
      {label}
    </button>
  );
}
