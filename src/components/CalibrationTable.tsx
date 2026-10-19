"use client";

// Estimated against measured.
//
// The only accuracy figure this app will ever print. Every time someone types
// a plug-in meter reading for a device, the estimate it replaced is kept, and
// this table shows the two side by side with the mean absolute error across
// all of them. With no readings it says so, instead of quoting a percentage
// from nowhere.

import { useStore } from "@/lib/useStore";
import type { CalibrationRecord } from "@/lib/storage";

export function meanAbsoluteError(records: readonly CalibrationRecord[]): number | null {
  const usable = records.filter((r) => r.measuredWatts > 0 && r.estimatedWatts > 0);
  if (!usable.length) return null;
  const sum = usable.reduce((s, r) => s + Math.abs(r.estimatedWatts - r.measuredWatts) / r.measuredWatts, 0);
  return sum / usable.length;
}

export function CalibrationTable() {
  const store = useStore();
  const records = [...store.calibrations].sort((a, b) => b.at.localeCompare(a.at));
  const buildingName = (id: string) => store.buildings.find((b) => b.id === id)?.name ?? "—";
  const mae = meanAbsoluteError(records);

  if (!records.length) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line px-5 py-5 text-[0.9rem] leading-relaxed text-dim">
        No meter readings yet. On a scan, type a device&apos;s measured watts from a plug-in meter and the
        estimate it replaced is kept here, so this table fills with the only accuracy figure the app
        can honestly show: its own record on devices somebody checked.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.9rem] text-mist">
          {records.length} reading{records.length === 1 ? "" : "s"} on this device
        </span>
        {mae !== null && (
          <span className="font-mono text-[0.8rem] text-fog tabular-nums">
            mean absolute error {Math.round(mae * 100)}%
          </span>
        )}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-[0.84rem]">
          <thead>
            <tr className="border-b border-line text-[0.7rem] uppercase tracking-wider text-dim">
              <th className="py-2 pr-3 font-medium">Device</th>
              <th className="py-2 pr-3 font-medium">Building</th>
              <th className="py-2 pr-3 text-right font-medium">Estimated W</th>
              <th className="py-2 pr-3 text-right font-medium">Measured W</th>
              <th className="py-2 pr-3 text-right font-medium">Error</th>
              <th className="py-2 font-medium">Basis</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const err = r.measuredWatts > 0 ? (r.estimatedWatts - r.measuredWatts) / r.measuredWatts : null;
              return (
                <tr key={r.id} className="border-b border-line/60 text-mist">
                  <td className="py-2 pr-3 text-fog">{r.label}</td>
                  <td className="py-2 pr-3">{buildingName(r.buildingId)}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">{Math.round(r.estimatedWatts)}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">{Math.round(r.measuredWatts)}</td>
                  <td className={`py-2 pr-3 text-right font-mono tabular-nums ${err !== null && Math.abs(err) > 0.3 ? "text-amber" : ""}`}>
                    {err === null ? "—" : `${err >= 0 ? "+" : ""}${Math.round(err * 100)}%`}
                  </td>
                  <td className="py-2 text-dim">{r.estimateBasis === "ai" ? "model" : "catalogue"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[0.8rem] leading-relaxed text-dim">
        A positive error means the app estimated high. Readings are stored in this browser only.
      </p>
    </div>
  );
}
