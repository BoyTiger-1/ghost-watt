"use client";

// A wattage tag on the live camera, opened: what it draws, the range for that
// kind of device, what it costs, and a way to say what it really is or whether
// it is on. The detector is fast but wrong often enough that a person who can
// see the room should get the last word.

import { useState } from "react";
import { fmtWatts } from "@/lib/energy";
import { itemColor } from "@/lib/media";
import { wattBand, type TagFix } from "@/lib/wattTags";
import type { LiveItem } from "@/lib/ondevice";
import type { AuditSettings, DeviceState } from "@/lib/types";
import { searchCatalog } from "./ManualEntry";
import { CostBreakdown } from "./CostBreakdown";
import { Icon } from "./icons";

const STATES: { id: DeviceState; label: string }[] = [
  { id: "on", label: "On" },
  { id: "standby", label: "Standby" },
  { id: "off", label: "Off" },
];

/** What it does when nobody is there: the scan report's afterHours, in the card's words. */
const AT_NIGHT: { id: DeviceState; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "standby", label: "Sleeps" },
  { id: "on", label: "Stays on" },
];

export function TagCard({
  item,
  inView,
  fixed,
  fix,
  settings,
  onFix,
  onClose,
}: {
  item: LiveItem;
  inView: boolean;
  fixed: boolean;
  /** What the person has set on this tag, when they have. */
  fix?: TagFix;
  settings: AuditSettings;
  onFix: (fix: TagFix | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState(false);
  const results = renaming ? searchCatalog(query, 6) : [];
  const band = wattBand(item);
  const person = item.kind === "person";
  const off = item.state === "off";
  const name = item.label.charAt(0).toUpperCase() + item.label.slice(1);

  return (
    <div className="rounded-2xl bg-black/75 p-3.5 text-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: itemColor(item) }} />
          <span className="truncate text-[0.95rem] font-semibold">{name}</span>
          {fixed && <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[0.62rem] font-medium">set by you</span>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>

      {person ? (
        <p className="mt-2 text-[0.84rem] leading-relaxed text-white/75">Someone is here, so the room is in use and what is on right now is not idle yet.</p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`font-mono text-[2.1rem] font-bold leading-none tabular-nums ${off ? "text-white/55" : ""}`}>{off ? "0 W" : fmtWatts(item.watts)}</span>
            <span className="text-[0.78rem] text-white/60">{off ? "switched off" : item.state === "standby" ? "on standby" : "drawing now"}</span>
          </div>
          {band && !off && (
            <p className="mt-1.5 font-mono text-[0.7rem] text-white/55">
              This kind of device: {fmtWatts(band.low)}–{fmtWatts(band.high)}
            </p>
          )}
          {!off && item.priced && (
            <div className="mt-3 rounded-xl bg-white/[0.07] px-2.5 py-2.5">
              <CostBreakdown offender={item.priced} place={settings.usageContext} dark />
            </div>
          )}

          {item.categoryId && (
            <div className="mt-3 flex rounded-full bg-white/[0.08] p-0.5" role="radiogroup" aria-label="Is it on?">
              {STATES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={item.state === s.id}
                  onClick={() => onFix({ ...fix, categoryId: item.categoryId!, state: s.id, label: item.label })}
                  className={`flex-1 rounded-full py-1.5 text-[0.76rem] font-medium transition-colors ${item.state === s.id ? "bg-white text-black" : "text-white/75 hover:text-white"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {item.categoryId && !off && !item.needed && (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="shrink-0 text-[0.72rem] text-white/60">At night it…</span>
              <div className="flex flex-1 rounded-full bg-white/[0.08] p-0.5" role="radiogroup" aria-label="At night it">
                {AT_NIGHT.map((a) => {
                  const current = item.priced?.afterHoursState;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={current === a.id}
                      onClick={() => onFix({ ...fix, categoryId: item.categoryId!, state: item.state ?? "on", label: item.label, afterHours: a.id })}
                      className={`flex-1 rounded-full py-1.5 text-[0.74rem] font-medium transition-colors ${current === a.id ? "bg-white text-black" : "text-white/75 hover:text-white"}`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {item.categoryId && !off && !item.needed && (
            <label className="mt-2 flex items-center gap-2 text-[0.72rem] text-white/60">
              <span className="shrink-0">Hours unused a day</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={24}
                step="any"
                value={fix?.idleHoursPerDay ?? ""}
                placeholder={item.priced?.hoursPerYear ? (item.priced.hoursPerYear / 365).toFixed(1) : "-"}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onFix({ ...fix, categoryId: item.categoryId!, state: item.state ?? "on", label: item.label, idleHoursPerDay: Number.isFinite(v) && v >= 0 ? Math.min(24, v) : undefined });
                }}
                className="w-16 rounded-lg border border-white/20 bg-white/[0.06] px-2 py-1 text-right font-mono text-base text-white outline-none placeholder:text-white/40 focus:border-[#ffd84d] sm:text-[0.8rem]"
              />
            </label>
          )}
        </>
      )}

      <div className="mt-3 border-t border-white/10 pt-2.5">
        {renaming ? (
          <div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
              placeholder="What is it? e.g. projector"
              className="w-full rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-[0.84rem] text-white outline-none placeholder:text-white/40 focus:border-[#ffd84d]"
            />
            {results.length > 0 && (
              <ul className="mt-1.5 max-h-44 overflow-y-auto">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onFix({ categoryId: c.id, state: item.state && !person ? item.state : "on", label: c.label.toLowerCase() });
                        setRenaming(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-[0.82rem] hover:bg-white/10"
                    >
                      <span className="truncate">{c.label}</span>
                      <span className="shrink-0 font-mono text-[0.7rem] text-white/55">{fmtWatts(c.wattsOn)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= 2 && results.length === 0 && <p className="mt-1.5 px-1 text-[0.74rem] text-white/50">Nothing by that name. Try a simpler word.</p>}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setRenaming(true)} className="text-[0.8rem] font-medium text-[#ffd84d] hover:underline">
              Not a {item.label}?
            </button>
            {fixed && (
              <button type="button" onClick={() => onFix(null)} className="text-[0.76rem] text-white/60 hover:text-white">
                Undo my change
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-2.5 text-[0.66rem] leading-relaxed text-white/45">
        {!inView ? "Out of view now. Your change applies when the camera finds it again. " : ""}
        Typical watts for this kind of device, not a meter reading. Priced like your report, at ${settings.ratePerKwh.toFixed(2)}/kWh.
      </p>
    </div>
  );
}
