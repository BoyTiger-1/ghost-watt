"use client";

// Rooms into buildings.
//
// A scan is one room. This page adds the latest scan of every room together into
// a building total, ranks the rooms by what they waste after hours, and compares
// buildings side by side. All of it is computed from scans saved on this device,
// so it works with no server and no account. Sharing a session across phones is
// a separate, optional feature underneath, and it says plainly when a deployment
// cannot support it.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClassMode } from "./ClassMode";
import { DeviceGlyph } from "./DeviceGlyph";
import { ModeBadge } from "./ModeBadge";
import { auditsFor } from "@/lib/storage";
import { rollupBuilding } from "@/lib/rollup";
import { fmtCo2, fmtKwh, fmtMoney, fmtMoneyFull } from "@/lib/energy";
import { addBuilding, newBuilding, setActiveBuilding, useStore } from "@/lib/useStore";

export function Buildings() {
  const store = useStore();
  const [showShared, setShowShared] = useState(false);
  const active = store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0] ?? null;
  const rollup = useMemo(() => (active ? rollupBuilding(auditsFor(store, active.id)) : null), [store, active]);

  if (!active || !rollup) {
    return <EmptyBuildings />;
  }

  const maxRoom = rollup.rooms[0]?.afterHoursCost ?? 0;

  return (
    <div className="space-y-6">
      {/* building picker */}
      <div className="flex flex-wrap items-center gap-2">
        {store.buildings.map((b) => {
          const on = b.id === active.id;
          return (
            <button
              key={b.id}
              onClick={() => setActiveBuilding(b.id)}
              aria-pressed={on}
              className={`rounded-full border px-3.5 py-1.5 text-[0.85rem] transition-colors ${
                on ? "border-fog bg-fog text-ink" : "border-line text-dim hover:border-line2 hover:text-mist"
              }`}
            >
              {b.name}
            </button>
          );
        })}
        <button
          onClick={() => addBuilding(newBuilding(`Building ${store.buildings.length + 1}`))}
          className="rounded-full border border-dashed border-line2 px-3 py-1.5 text-xs text-dim transition-colors hover:border-fog/40 hover:text-fog"
        >
          + Building
        </button>
      </div>

      {/* the total */}
      <section className="panel ticked relative overflow-hidden p-5 sm:p-6" aria-label={`${active.name} totals`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-fog">{active.name}</h2>
            <p className="mt-1 text-[0.85rem] text-dim">
              {rollup.rooms.length} room{rollup.rooms.length === 1 ? "" : "s"} · {rollup.devices} device{rollup.devices === 1 ? "" : "s"} ·{" "}
              {rollup.latestAt ? `last scan ${new Date(rollup.latestAt).toLocaleDateString()}` : "no scans"}
            </p>
          </div>
          {rollup.rooms.length > 0 && <ModeBadge mode={rollup.mode === "mixed" ? "on-device" : rollup.mode} />}
        </div>

        {rollup.rooms.length === 0 ? (
          <p className="mt-5 border-t border-line pt-4 text-sm text-mist">
            No rooms scanned for this building yet.{" "}
            <Link href="/scan" className="text-cyan underline-offset-4 hover:underline">
              Scan a room →
            </Link>
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Big label="after-hours waste / yr" value={fmtMoneyFull(rollup.afterHoursCost)} accent />
            <Big label="at typical use / yr" value={fmtMoneyFull(rollup.typicalCost)} />
            <Big label="recoverable / yr" value={fmtMoneyFull(rollup.recoverable)} />
            <Big label="CO₂ / yr" value={fmtCo2(rollup.co2Kg)} />
          </div>
        )}
        {rollup.rooms.length > 0 && (
          <p className="mt-4 text-[0.78rem] leading-relaxed text-dim">
            After-hours waste is what the rooms cost if every device stays as it was seen through the building&apos;s empty hours;
            typical use is what the same devices cost in normal use. Each room counts once: its latest scan.
          </p>
        )}
      </section>

      {/* leaderboard */}
      {rollup.rooms.length > 0 && (
        <section className="panel overflow-hidden" aria-label="Rooms ranked by after-hours waste">
          <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
            <h3 className="text-lg font-semibold text-fog">Rooms, worst first</h3>
            <span className="mono-label">after-hours waste</span>
          </header>
          <ol className="divide-y divide-line">
            {rollup.rooms.map((r, i) => {
              const top = r.audit.offenders.find((o) => !o.unverified);
              const prev = r.history[0];
              const prevCost = prev ? prev.offenders.reduce((s, o) => s + o.costPerYear, 0) : null;
              const change = prevCost === null ? null : r.afterHoursCost - prevCost;
              return (
                <li key={r.audit.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                  <span className="w-6 shrink-0 font-mono text-[0.78rem] text-dim tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  {r.audit.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.audit.thumb} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-surface2 text-dim">
                      {top ? <DeviceGlyph icon={top.icon} className="h-5 w-5" /> : null}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-sm font-medium text-fog">{r.room}</span>
                      <span className="font-mono text-[0.7rem] text-dim">
                        {r.devices} device{r.devices === 1 ? "" : "s"}
                        {top ? ` · worst: ${top.label.toLowerCase()}` : ""}
                        {r.unverified > 0 ? ` · ${r.unverified} unverified left out` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${maxRoom > 0 ? Math.max(3, (r.afterHoursCost / maxRoom) * 100) : 0}%`,
                          background: "linear-gradient(90deg,var(--color-sodium),var(--color-flare))",
                        }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-semibold text-fog tabular-nums">{fmtMoneyFull(r.afterHoursCost)}</div>
                    <div className="font-mono text-[0.66rem] text-dim tabular-nums">
                      {change === null ? `${fmtMoney(r.typicalCost)} typical` : change <= -1 ? `↓ ${fmtMoney(-change)} since last scan` : change >= 1 ? `↑ ${fmtMoney(change)} since last scan` : "unchanged"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="border-t border-line px-5 py-3 text-[0.76rem] leading-relaxed text-dim sm:px-6">
            Ranked by what each room costs if left as it was seen, counting only devices that were verified or confirmed. A room scanned again
            replaces its earlier scan here; the change since the last scan is shown where there is one. {fmtKwh(rollup.kwh)} a year across the
            building.
          </p>
        </section>
      )}

      {/* across buildings */}
      {store.buildings.length > 1 && (
        <section className="panel p-5 sm:p-6" aria-label="Buildings compared">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-lg font-semibold text-fog">Buildings compared</h3>
            <span className="mono-label">after-hours waste / yr</span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {store.buildings
              .map((b) => ({ b, r: rollupBuilding(auditsFor(store, b.id)) }))
              .sort((x, y) => y.r.afterHoursCost - x.r.afterHoursCost)
              .map(({ b, r }, i, all) => {
                const max = all[0]?.r.afterHoursCost || 1;
                return (
                  <li key={b.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-mist">
                        {b.name} <span className="text-dim">· {r.rooms.length} room{r.rooms.length === 1 ? "" : "s"}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs font-semibold text-fog tabular-nums">{fmtMoneyFull(r.afterHoursCost)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-surface2">
                      <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.max(2, (r.afterHoursCost / max) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      {/* shared session, optional */}
      <section className="panel overflow-hidden">
        <button
          onClick={() => setShowShared((s) => !s)}
          aria-expanded={showShared}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6"
        >
          <span>
            <span className="block text-[0.95rem] font-semibold text-fog">Scan with a class</span>
            <span className="block text-[0.8rem] text-mist">Many phones, one building. Each phone sends its device rows, never its photos.</span>
          </span>
          <span className="font-mono text-[0.7rem] text-dim">{showShared ? "Hide" : "Open"}</span>
        </button>
        {showShared && (
          <div className="border-t border-line p-5 sm:p-6">
            <ClassMode />
          </div>
        )}
      </section>
    </div>
  );
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className={`font-mono text-xl font-bold tabular-nums sm:text-2xl ${accent ? "grad-energy" : "text-fog"}`}>{value}</div>
      <div className="mono-label mt-1">{label}</div>
    </div>
  );
}

function EmptyBuildings() {
  return (
    <div className="panel grid min-h-[280px] place-items-center p-8 text-center">
      <div className="max-w-md">
        <h3 className="text-lg font-semibold text-fog">No buildings yet</h3>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          Scan a room and it is saved to a building automatically. Rooms add up here into a building total and a ranking of where the after-hours waste is.
        </p>
        <Link href="/scan" className="mt-5 inline-block rounded-full bg-fog px-4 py-2.5 text-xs font-medium text-ink transition-colors hover:bg-fog/85">
          Scan a room
        </Link>
      </div>
    </div>
  );
}
