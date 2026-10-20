"use client";

// The lookup table, unredacted.
//
// This is the part of Ghost Watt that most energy tools keep behind a login: the
// actual number used for every device, the published range it sits inside, and
// where it came from. If a judge or a facilities director wants to argue with a
// figure, this page is where they find the one to argue with - which is the whole
// point. An estimate you cannot audit is a guess with better typography.

import { useDeferredValue, useMemo, useState } from "react";
import { DEVICE_CATALOG } from "@/lib/devices";
import { GROUP_LABELS, type DeviceGroup } from "@/lib/types";
import { groupColor } from "./Charts";

const GROUPS = Object.keys(GROUP_LABELS) as DeviceGroup[];

function fmtW(w: number) {
  return w >= 1000 ? `${(w / 1000).toFixed(1)}k` : String(Math.round(w));
}

/** Rows shown at first, and how many more each "See more" adds. */
const FIRST = 20;
const STEP = 40;

export function CatalogTable() {
  const [group, setGroup] = useState<DeviceGroup | "all">("all");
  const [query, setQuery] = useState("");
  // Typing stays instant; the thousand-row filter catches up a beat later.
  const deferred = useDeferredValue(query);
  // How many rows are showing, per filter: a new filter or search starts short again.
  const [shownFor, setShownFor] = useState({ key: "", n: FIRST });
  const key = `${group}|${deferred}`;
  const shown = shownFor.key === key ? shownFor.n : FIRST;

  const rows = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    return DEVICE_CATALOG.filter((c) => {
      if (group !== "all" && (c.group ?? "specialty") !== group) return false;
      if (!q) return true;
      return (
        c.label.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q)) ||
        c.action.label.toLowerCase().includes(q)
      );
    });
  }, [group, deferred]);
  const visible = rows.slice(0, shown);

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
          className="ml-auto min-w-[12rem] flex-1 border border-line bg-surface px-3 py-1.5 font-mono text-xs text-fog outline-none placeholder:text-dim focus:border-cyan sm:flex-none rounded-xl"
        />
      </div>

      <div className="mt-4 overflow-x-auto border border-line">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="bg-surface2 text-[0.75rem] text-dim">
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
            {visible.map((c, i) => (
                <tr
                  key={c.id}
                  // Rows revealed by "See more" fade up in a short cascade; the first ones just appear.
                  className={`${i % 2 ? "bg-surface" : "bg-surface/40"} ${i >= FIRST ? "row-in" : ""}`}
                  style={i >= FIRST ? { animationDelay: `${Math.min(((i - FIRST) % STEP) * 18, 500)}ms` } : undefined}
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
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {rows.length > shown && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setShownFor({ key, n: shown + STEP })}
            className="rounded-full bg-fog px-5 py-2.5 text-[0.88rem] font-medium text-ink transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            See more · {Math.min(STEP, rows.length - shown)} of {rows.length - shown} left
          </button>
          {shown > FIRST && (
            <button type="button" onClick={() => setShownFor({ key, n: FIRST })} className="text-[0.84rem] text-dim hover:text-fog">
              Show fewer
            </button>
          )}
        </div>
      )}

      {rows.length === 0 && (
        <p className="mt-3 text-sm text-dim">Nothing in the table matches that.</p>
      )}

      <p className="mt-3 font-mono text-[0.7rem] leading-relaxed text-dim">
        Showing {visible.length} of {rows.length}
        {rows.length < DEVICE_CATALOG.length ? ` matching (${DEVICE_CATALOG.length} in all)` : ""} devices. The Range column is the
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
      className={`rounded-full border px-3 py-1 text-[0.78rem] transition-colors ${
        on ? "border-fog bg-fog text-ink" : "border-line text-dim hover:text-mist"
      }`}
      style={on && tint ? { borderColor: tint, background: tint, color: "#fff" } : undefined}
    >
      {label}
    </button>
  );
}
