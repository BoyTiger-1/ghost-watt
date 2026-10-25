"use client";

// My places: the scans you've made, turned into a plan you can finish.
//
// A single scan answers "what is this room wasting?". The question that
// actually saves money comes after: across my whole home, school or office,
// what should I fix, have I done it, and did it work? So a place is its rooms
// (the latest scan of each, worst first), one to-do list of every fix across
// them, ticked off as you go, and a re-scan of a room checking whether the
// waste really went away. Everything stays in this browser.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { PlaceEditor } from "./PlaceEditor";
import { ReportBrief } from "./ReportBrief";
import { BenchmarkPanel, LoadMixPanel } from "./AuditPanels";
import { EfficiencyPanel } from "./EfficiencyPanel";
import { EquivalenceStrip } from "./EquivalenceStrip";
import { BillCompare, Card, EmptyTime, MoneyOverTime } from "./scan/Visuals";
import { BUILDING_TYPE_BY_ID } from "@/lib/benchmark";
import { regionOrDefault } from "@/lib/grid";
import { DeviceGlyph } from "./DeviceGlyph";
import { auditsFor, fixesFor, uid, type Building, type FixRecord, type SavedAudit } from "@/lib/storage";
import { rollupBuilding, type RoomRollup } from "@/lib/rollup";
import { listActions, rankActions, type ActionItem } from "@/lib/actions";
import { counted, fmtMoney, fmtMoneyFull } from "@/lib/energy";
import { exportStore, importStore, downloadText } from "@/lib/export";
import { readImport } from "@/lib/importData";
import { addAudit, addBuilding, addFix, currentStore, newBuilding, removeAudit, removeBuilding, removeFix, replaceStore, setActiveBuilding, updateBuilding, useStore } from "@/lib/useStore";
import type { Offender } from "@/lib/types";

/** One fix on the to-do list: the move, the device and room it is for, and whether it's done. */
interface Todo {
  action: ActionItem;
  offender: Offender;
  room: RoomRollup;
  done?: FixRecord;
}

const fixKey = (area: string, categoryId: string, title: string) => `${area.toLowerCase()}|${categoryId}|${title}`;

export function Places() {
  const store = useStore();
  const active = store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0] ?? null;
  // Rename and Edit from the Scanner's place menu arrive as ?place=<id>&action=rename|edit.
  const [intent, setIntent] = useState<{ tab: PlaceTab; rename: boolean; n: number }>({ tab: "overview", rename: false, n: 0 });
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const id = q.get("place");
      const action = q.get("action");
      if (id && currentStore().buildings.some((b) => b.id === id)) setActiveBuilding(id);
      if (action === "rename") setIntent({ tab: "overview", rename: true, n: 1 });
      else if (action === "edit") setIntent({ tab: "details", rename: false, n: 1 });
      else if (action === "bill") {
        setIntent({ tab: "details", rename: false, n: 1 });
        setTimeout(() => document.getElementById("place-bill")?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
      }
      if (id || action) window.history.replaceState(null, "", "/places");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!active) return <Empty />;
  return (
    <div className="space-y-6">
      <div className="no-print">
        <PlacePicker activeId={active.id} />
      </div>
      <Place key={`${active.id}:${intent.n}`} buildingId={active.id} initialTab={intent.tab} renameNow={intent.rename} />
      <div className="no-print space-y-6">
        {store.buildings.length > 1 && <AllPlaces />}
        <Backup />
      </div>
    </div>
  );
}

// ---- which place ----------------------------------------------------------

function PlacePicker({ activeId }: { activeId: string }) {
  const store = useStore();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {store.buildings.map((b) => {
        const on = b.id === activeId;
        return (
          <button
            key={b.id}
            onClick={() => setActiveBuilding(b.id)}
            aria-pressed={on}
            className={`rounded-full px-4 py-2 text-[0.88rem] font-medium transition-colors ${on ? "bg-fog text-ink" : "bg-fog/[0.05] text-mist hover:bg-fog/[0.09] hover:text-fog"}`}
          >
            {b.name}
          </button>
        );
      })}
      <button
        onClick={() => addBuilding(newBuilding(`Place ${store.buildings.length + 1}`))}
        className="rounded-full border border-dashed border-line2 px-4 py-2 text-[0.85rem] text-dim transition-colors hover:border-fog/40 hover:text-fog"
      >
        + Add a place
      </button>
    </div>
  );
}

// ---- one place ---------------------------------------------------------------

type PlaceTab = "overview" | "charts" | "report" | "details";

function Place({ buildingId, initialTab, renameNow }: { buildingId: string; initialTab: PlaceTab; renameNow: boolean }) {
  const store = useStore();
  const building = store.buildings.find((b) => b.id === buildingId)!;
  const audits = useMemo(() => auditsFor(store, buildingId), [store, buildingId]);
  const fixes = useMemo(() => fixesFor(store, buildingId), [store, buildingId]);
  const rollup = useMemo(() => rollupBuilding(audits), [audits]);
  const [tab, setTab] = useState<PlaceTab>(initialTab);
  const [renaming, setRenaming] = useState(renameNow);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) nameRef.current?.select();
  }, [renaming]);

  // Every fix across every room, best value first, each matched to whether it's been done.
  const todos = useMemo<Todo[]>(() => {
    const doneBy = new Map(fixes.map((f) => [fixKey(f.area, f.categoryId, f.actionLabel), f]));
    const list: Todo[] = [];
    for (const room of rollup.rooms) {
      const offenders = counted(room.audit.offenders).map((o) => ({ ...o, source: room.room }));
      const byId = new Map(offenders.map((o) => [o.id, o]));
      for (const action of listActions(offenders, room.audit.settings)) {
        const offender = byId.get(action.offenderId);
        if (!offender) continue;
        list.push({ action, offender, room, done: doneBy.get(fixKey(room.room, offender.categoryId, action.title)) });
      }
    }
    const order = rankActions(list.map((t) => t.action));
    return order.map((a) => list.find((t) => t.action === a)!);
  }, [rollup, fixes]);

  const doneTodos = todos.filter((t) => t.done);
  const savedSoFar = doneTodos.reduce((s, t) => s + t.action.annualSavings, 0);
  const stillToDo = todos.filter((t) => !t.done).reduce((s, t) => s + t.action.annualSavings, 0);
  const share = savedSoFar + stillToDo > 0 ? savedSoFar / (savedSoFar + stillToDo) : 0;
  const type = BUILDING_TYPE_BY_ID[building.typeId];

  const tabs: { id: PlaceTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "charts", label: "Charts" },
    { id: "report", label: "Report" },
    { id: "details", label: "Details" },
  ];

  return (
    <div className="space-y-6">
      {/* the place, in a sentence */}
      <section className="no-print panel relative overflow-hidden p-5 sm:p-7">
        <div aria-hidden className="absolute inset-0 -z-10 opacity-70" style={{ background: "radial-gradient(60% 100% at 100% 0%, rgba(239,157,46,0.1), transparent 60%)" }} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setRenaming(false);
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  ref={nameRef}
                  value={building.name}
                  onChange={(e) => updateBuilding(building.id, { name: e.target.value })}
                  onBlur={() => setRenaming(false)}
                  aria-label="Place name"
                  className="font-editorial min-w-0 flex-1 rounded-xl border border-cyan bg-surface px-3 py-1 text-[1.8rem] leading-tight text-fog outline-none sm:text-[2.1rem]"
                />
                <button type="submit" className="rounded-full bg-fog px-4 py-2 text-[0.85rem] font-medium text-ink">
                  Save
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-editorial text-[2rem] leading-tight text-fog sm:text-[2.4rem]">{building.name}</h2>
                <button onClick={() => setRenaming(true)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8rem] text-dim hover:bg-fog/[0.05] hover:text-fog">
                  <PencilIcon />
                  Rename
                </button>
              </div>
            )}
            <p className="mt-1 text-[0.86rem] text-dim">
              {type?.label ?? "Place"} · {regionOrDefault(building.regionCode).name} · {rollup.rooms.length} room{rollup.rooms.length === 1 ? "" : "s"}
              {rollup.latestAt ? ` · last scan ${ago(rollup.latestAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/campus" className="rounded-full border border-line px-4 py-2 text-[0.85rem] text-fog transition-colors hover:border-fog/40">
              3D building
            </Link>
            {rollup.rooms.length > 0 && (
              <Link
                href={`/stickers?building=${building.id}`}
                className="rounded-full border border-line px-4 py-2 text-[0.85rem] text-fog transition-colors hover:border-fog/40"
              >
                Room stickers
              </Link>
            )}
            <Link href="/scan" className="rounded-full bg-fog px-4 py-2 text-[0.85rem] font-medium text-ink transition-colors hover:bg-fog/85">
              Scan a room
            </Link>
          </div>
        </div>

        {rollup.rooms.length > 0 ? (
          <>
            <p className="mt-5 max-w-[46ch] text-[1.15rem] leading-snug text-fog sm:text-[1.3rem]">
              Things left on here waste about <strong className="font-semibold text-ember">{fmtMoneyFull(rollup.afterHoursCost)} a year</strong>{" "}
              while nobody&apos;s around.
            </p>
            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.86rem]">
                <span className="text-mist">
                  Fixes done: <strong className="font-semibold text-fog">{doneTodos.length}</strong> of {todos.length}
                </span>
                <span className="text-mist">
                  Saving <strong className="font-semibold text-lime">{fmtMoneyFull(savedSoFar)}</strong> a year so far
                  {stillToDo > 0 && <> · {fmtMoneyFull(stillToDo)} more to go</>}
                </span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface2">
                <motion.div className="h-full rounded-full bg-lime" initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
              </div>
            </div>
          </>
        ) : (
          <p className="mt-5 max-w-[56ch] text-[0.95rem] leading-relaxed text-mist">
            No rooms here yet. Scan a room, then tap <span className="font-medium text-fog">Add to place</span> and pick {building.name}. Add a few, and this page
            tells you which room is the problem and what to fix first.
          </p>
        )}

        {/* the place's own sections */}
        <div className="mt-6 flex gap-1 overflow-x-auto rounded-full bg-fog/[0.05] p-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-[0.88rem] font-medium transition-colors ${
                tab === t.id ? "bg-surface text-fog shadow-[0_1px_2px_rgba(28,27,24,0.08)]" : "text-dim hover:text-mist"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {tab === "overview" &&
        (rollup.rooms.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
            <Rooms rooms={rollup.rooms} />
            <TodoList todos={todos} buildingId={buildingId} audits={audits} />
          </div>
        ) : (
          <NoRoomsYet name={building.name} />
        ))}

      {tab === "charts" && (rollup.rooms.length > 0 ? <PlaceCharts building={building} audits={audits} /> : <NoRoomsYet name={building.name} />)}

      {tab === "report" && (rollup.rooms.length > 0 ? <ReportBrief /> : <NoRoomsYet name={building.name} />)}

      {tab === "details" && (
        <section className="panel p-5 sm:p-7">
          <PlaceEditor building={building} />
          <div className="mt-8 border-t border-line pt-5">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ember/[0.07] px-3.5 py-2.5 text-[0.86rem]">
                <span className="text-mist">
                  Delete {building.name} and its {rollup.rooms.length} room{rollup.rooms.length === 1 ? "" : "s"}? This can&apos;t be undone.
                </span>
                <button onClick={() => removeBuilding(building.id)} className="rounded-full bg-ember px-3.5 py-1.5 text-[0.82rem] font-medium text-white">
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-1.5 text-[0.82rem] text-mist hover:text-fog">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-[0.86rem] text-dim hover:text-ember">
                Delete this place
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function NoRoomsYet({ name }: { name: string }) {
  return (
    <div className="panel p-8 text-center">
      <p className="mx-auto max-w-md text-[0.92rem] leading-relaxed text-mist">
        Nothing to show for {name} yet. Scan a room on the Scanner and tap <span className="font-medium text-fog">Add to place</span>.
      </p>
      <Link href="/scan" className="mt-4 inline-block rounded-full bg-fog px-4 py-2 text-[0.85rem] font-medium text-ink hover:bg-fog/85">
        Go to the Scanner
      </Link>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
    </svg>
  );
}

// ---- the place's charts ------------------------------------------------------------

function PlaceCharts({ building, audits }: { building: Building; audits: SavedAudit[] }) {
  const rollup = useMemo(() => rollupBuilding(audits), [audits]);
  const settings = rollup.rooms[0]?.audit.settings;
  const offenders = rollup.offenders;

  // The place's total waste after each scan day: the latest scan of every room known by then.
  const timeline = useMemo(() => {
    const days = [...new Set(audits.map((a) => a.at.slice(0, 10)))].sort();
    return days.map((d) => ({ day: d, waste: rollupBuilding(audits.filter((a) => a.at.slice(0, 10) <= d)).afterHoursCost }));
  }, [audits]);
  const tMax = Math.max(1, ...timeline.map((t) => t.waste));
  const rMax = Math.max(1, ...rollup.rooms.map((r) => r.afterHoursCost + r.typicalCost));

  if (!settings) return null;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Each room's yearly cost" sub="Needed while people use it, and wasted while it's empty">
          <ul className="space-y-3">
            {rollup.rooms.map((r) => (
              <li key={r.room}>
                <div className="flex items-baseline justify-between gap-3 text-[0.84rem]">
                  <span className="truncate text-fog">{r.room}</span>
                  <span className="font-mono text-mist">
                    {fmtMoney(r.typicalCost)} + <span className="text-ember">{fmtMoney(r.afterHoursCost)}</span>
                  </span>
                </div>
                <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-surface2">
                  <span className="h-full bg-cyan/60" style={{ width: `${(r.typicalCost / rMax) * 100}%` }} />
                  <span className="h-full bg-ember" style={{ width: `${(r.afterHoursCost / rMax) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Waste over time" sub="The whole place's yearly waste after each day you scanned">
          {timeline.length < 2 ? (
            <p className="text-[0.86rem] leading-relaxed text-mist">
              Scan a room again after fixing something and this shows whether the total is going down.
            </p>
          ) : (
            <div className="flex h-40 items-end gap-2">
              {timeline.map((t, i) => (
                <div key={t.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="font-mono text-[0.68rem] text-mist">{fmtMoney(t.waste)}</span>
                  <span className={`w-full max-w-12 rounded-t-md ${i === timeline.length - 1 ? "bg-ember" : "bg-ember/40"}`} style={{ height: `${Math.max(4, (t.waste / tMax) * 110)}px` }} />
                  <span className="truncate text-[0.66rem] text-dim">{new Date(t.day + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <BillCompare offenders={offenders} settings={settings} />
        <EmptyTime settings={settings} home={building.typeId === "home"} />
      </div>
      <MoneyOverTime offenders={offenders} settings={settings} />
      <div className="grid gap-5 md:grid-cols-2">
        <LoadMixPanel offenders={offenders} />
        {offenders.length > 0 && <EfficiencyPanel offenders={offenders} settings={settings} />}
      </div>
      <EquivalenceStrip co2Kg={rollup.co2Kg} dollars={rollup.afterHoursCost} />
      <BenchmarkPanel offenders={offenders} building={building} settings={settings} />
    </div>
  );
}

// ---- rooms, worst first -------------------------------------------------------

function Rooms({ rooms }: { rooms: RoomRollup[] }) {
  const max = Math.max(1, ...rooms.map((r) => r.afterHoursCost));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="panel overflow-hidden" aria-label="Rooms">
      <header className="border-b border-line px-5 py-4">
        <h3 className="text-[1.05rem] font-semibold text-fog">Rooms, worst first</h3>
        <p className="mt-0.5 text-[0.8rem] text-dim">What each room wastes a year, from its latest scan.</p>
      </header>
      <ul className="divide-y divide-line">
        {rooms.map((r) => (
          <RoomRow key={r.room} room={r} max={max} open={open === r.room} onToggle={() => setOpen(open === r.room ? null : r.room)} />
        ))}
      </ul>
    </section>
  );
}

function RoomRow({ room: r, max, open, onToggle }: { room: RoomRollup; max: number; open: boolean; onToggle: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const previous = r.history[0];
  const before = previous ? counted(previous.offenders).reduce((s, o) => s + o.costPerYear, 0) : null;
  const change = before !== null ? r.afterHoursCost - before : null;
  const top = counted(r.audit.offenders)
    .filter((o) => o.costPerYear > 0)
    .sort((a, b) => b.costPerYear - a.costPerYear)
    .slice(0, 4);

  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-fog/[0.025]">
        {r.audit.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.audit.thumb} alt="" className="h-12 w-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="grid h-12 w-14 shrink-0 place-items-center rounded-lg bg-surface2 text-dim">
            <DeviceGlyph icon="light" className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem] font-medium text-fog">{r.room}</span>
          <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface2">
            <span className="block h-full rounded-full bg-ember" style={{ width: `${(r.afterHoursCost / max) * 100}%` }} />
          </span>
          <span className="mt-1 block text-[0.74rem] text-dim">
            {r.devices} device{r.devices === 1 ? "" : "s"} · scanned {ago(r.audit.at)}
            {change !== null && Math.abs(change) >= 1 && (
              <span className={change < 0 ? "text-lime" : "text-ember"}>
                {" "}
                · {change < 0 ? "down" : "up"} {fmtMoney(Math.abs(change))} since last time
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[1rem] font-semibold text-ember">{fmtMoney(r.afterHoursCost)}</span>
          <span className="block text-[0.68rem] text-dim">a year</span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 px-5 pb-4">
              {top.length ? (
                <ul className="space-y-1.5 rounded-xl bg-surface2/60 px-3.5 py-3 text-[0.84rem]">
                  {top.map((o) => (
                    <li key={o.id} className="flex items-center gap-2.5">
                      <DeviceGlyph icon={o.icon} className="h-4 w-4 shrink-0 text-dim" />
                      <span className="min-w-0 flex-1 truncate text-fog">
                        {o.label}
                        {o.count > 1 && <span className="text-dim"> ×{o.count}</span>}
                      </span>
                      <span className="font-mono text-mist">{fmtMoney(o.costPerYear)}/yr</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.84rem] text-mist">Nothing in this room is wasting power. Nice.</p>
              )}
              {r.history.length > 0 && <History room={r} />}
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/scan?room=${encodeURIComponent(r.room)}`} className="rounded-full bg-fog px-3.5 py-1.5 text-[0.8rem] font-medium text-ink hover:bg-fog/85">
                  Scan this room again
                </Link>
                {confirm ? (
                  <>
                    <button
                      onClick={() => [r.audit, ...r.history].forEach((a) => removeAudit(a.id))}
                      className="rounded-full bg-ember px-3.5 py-1.5 text-[0.8rem] font-medium text-white"
                    >
                      Remove {r.history.length ? `all ${r.history.length + 1} scans` : "it"}
                    </button>
                    <button onClick={() => setConfirm(false)} className="px-2 text-[0.8rem] text-mist hover:text-fog">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setConfirm(true)} className="rounded-full px-3 py-1.5 text-[0.8rem] text-dim hover:text-ember">
                    Remove room
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Every scan of one room, oldest to newest, as a row of bars. */
function History({ room }: { room: RoomRollup }) {
  const scans = [room.audit, ...room.history].reverse();
  const costs = scans.map((a) => counted(a.offenders).reduce((s, o) => s + o.costPerYear, 0));
  const max = Math.max(1, ...costs);
  return (
    <div className="rounded-xl border border-line px-3.5 py-3">
      <div className="text-[0.76rem] font-medium text-mist">Every scan of this room</div>
      <div className="mt-2 flex h-20 items-end gap-2">
        {scans.map((a, i) => (
          <div key={a.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="font-mono text-[0.66rem] text-mist">{fmtMoney(costs[i])}</span>
            <span className={`w-full max-w-10 rounded-t-md ${i === scans.length - 1 ? "bg-ember" : "bg-ember/40"}`} style={{ height: `${Math.max(4, (costs[i] / max) * 52)}px` }} />
            <span className="truncate text-[0.62rem] text-dim">{new Date(a.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- the to-do list -----------------------------------------------------------

function TodoList({ todos, buildingId, audits }: { todos: Todo[]; buildingId: string; audits: SavedAudit[] }) {
  const [showDone, setShowDone] = useState(true);
  const shown = showDone ? todos : todos.filter((t) => !t.done);

  function toggle(t: Todo) {
    if (t.done) {
      removeFix(t.done.id);
      return;
    }
    addFix({
      id: uid("fix"),
      buildingId,
      categoryId: t.offender.categoryId,
      area: t.room.room,
      label: t.offender.label,
      actionLabel: t.action.title,
      costPaid: t.action.cost,
      expectedAnnualSavings: t.action.annualSavings,
      installedAt: new Date().toISOString(),
    });
  }

  return (
    <section className="panel overflow-hidden" aria-label="To-do list">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <h3 className="text-[1.05rem] font-semibold text-fog">Your to-do list</h3>
          <p className="mt-0.5 text-[0.8rem] text-dim">Every fix across your rooms, best value first. Tick one off when it&apos;s done.</p>
        </div>
        {todos.some((t) => t.done) && (
          <button onClick={() => setShowDone((v) => !v)} className="rounded-full px-2.5 py-1 text-[0.76rem] text-dim hover:text-fog">
            {showDone ? "Hide done" : "Show done"}
          </button>
        )}
      </header>
      {todos.length === 0 ? (
        <p className="px-5 py-6 text-[0.9rem] text-mist">Nothing to fix. Everything scanned here is already switched off.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((t) => (
            <li key={t.action.id + t.room.room} className={`flex gap-3 px-5 py-3.5 ${t.done ? "bg-lime/[0.04]" : ""}`}>
              <button
                role="checkbox"
                aria-checked={!!t.done}
                aria-label={`${t.action.title}, ${t.done ? "done" : "not done"}`}
                onClick={() => toggle(t)}
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                  t.done ? "border-lime bg-lime text-white" : "border-line2 hover:border-lime"
                }`}
              >
                {t.done && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-[0.92rem] font-medium ${t.done ? "text-mist line-through decoration-line2" : "text-fog"}`}>{t.action.title}</div>
                <div className="mt-0.5 text-[0.78rem] text-dim">
                  {t.offender.label}
                  {t.offender.count > 1 ? ` ×${t.offender.count}` : ""} · {t.room.room}
                </div>
                {t.done && <Worked todo={t} audits={audits} />}
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[0.92rem] font-semibold text-lime">{fmtMoney(t.action.annualSavings)}/yr</div>
                <div className="text-[0.72rem] text-dim">{t.action.cost > 0 ? `costs ${fmtMoneyFull(t.action.cost)}` : "free"}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Did a done fix work? Only a scan of the room taken after it can say. */
function Worked({ todo, audits }: { todo: Todo; audits: SavedAudit[] }) {
  const fix = todo.done!;
  const room = todo.room.room.toLowerCase();
  const scans = audits.filter((a) => (a.areas[0] ?? "").trim().toLowerCase() === room).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const at = Date.parse(fix.installedAt);
  const before = [...scans].reverse().find((a) => Date.parse(a.at) <= at);
  const after = scans.find((a) => Date.parse(a.at) > at);
  const costOf = (a: SavedAudit) => counted(a.offenders).filter((o) => o.categoryId === fix.categoryId).reduce((s, o) => s + o.costPerYear, 0);

  if (!after || !before) {
    return (
      <p className="mt-1.5 text-[0.76rem] text-mist">
        Done {ago(fix.installedAt)}.{" "}
        <Link href={`/scan?room=${encodeURIComponent(todo.room.room)}`} className="font-medium text-cyan hover:underline">
          Scan the room again
        </Link>{" "}
        to check it worked.
      </p>
    );
  }
  const drop = costOf(before) - costOf(after);
  return drop > 1 ? (
    <p className="mt-1.5 text-[0.76rem] font-medium text-lime">Checked: the new scan shows {fmtMoney(drop)} a year less waste here.</p>
  ) : (
    <p className="mt-1.5 text-[0.76rem] text-amber">The new scan doesn&apos;t show a drop yet. Worth a second look.</p>
  );
}

// ---- every place --------------------------------------------------------------

function AllPlaces() {
  const store = useStore();
  const rows = store.buildings
    .map((b) => {
      const r = rollupBuilding(auditsFor(store, b.id));
      return { b, waste: r.afterHoursCost, rooms: r.rooms.length };
    })
    .sort((a, b) => b.waste - a.waste);
  const max = Math.max(1, ...rows.map((r) => r.waste));
  return (
    <section className="panel p-5">
      <h3 className="text-[1.05rem] font-semibold text-fog">All your places</h3>
      <ul className="mt-3 space-y-2.5">
        {rows.map(({ b, waste, rooms }) => (
          <li key={b.id}>
            <button onClick={() => setActiveBuilding(b.id)} className="grid w-full grid-cols-[minmax(0,10rem)_minmax(0,1fr)_5rem] items-center gap-3 text-left text-[0.86rem]">
              <span className="truncate text-fog">
                {b.name} <span className="text-dim">· {rooms} rooms</span>
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-surface2">
                <span className="block h-full rounded-full bg-ember" style={{ width: `${(waste / max) * 100}%` }} />
              </span>
              <span className="text-right font-mono text-fog">{fmtMoney(waste)}/yr</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- keeping a copy -----------------------------------------------------------

function Backup() {
  const store = useStore();
  const active = store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0];
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pendingBackup, setPendingBackup] = useState<string | null>(null);

  async function onFile(f: File | undefined) {
    if (!f || !active) return;
    const text = await f.text();
    const r = readImport(f.name, text, active.id);
    if (r.kind === "error") setMessage({ text: r.error, bad: true });
    else if (r.kind === "backup") setPendingBackup(text);
    else {
      r.audits.forEach(addAudit);
      setMessage({ text: `Added ${r.audits.length} room${r.audits.length === 1 ? "" : "s"} to ${active.name}: ${r.audits.map((a) => a.areas[0]).join(", ")}.` });
    }
  }

  return (
    <section className="rounded-2xl border border-line px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0">
          <div className="text-[0.92rem] font-medium text-fog">Your data</div>
          <p className="mt-0.5 text-[0.8rem] leading-relaxed text-dim">
            Saved in this browser only. Lost a photo or switched devices? Import a CSV or report data file from an earlier scan and its rooms come back here.
          </p>
        </div>
        <label className="cursor-pointer rounded-full bg-fog px-4 py-2 text-[0.84rem] font-medium text-ink transition-colors hover:bg-fog/85">
          Import a file
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button
          onClick={() => downloadText(`ghostwatt-backup-${new Date().toISOString().slice(0, 10)}.json`, exportStore(store), "application/json")}
          className="rounded-full border border-line px-4 py-2 text-[0.84rem] text-fog transition-colors hover:border-fog/40"
        >
          Download a full copy
        </button>
      </div>
      <p className="mt-2 text-[0.74rem] text-dim">Imports go into {active?.name ?? "the selected place"}. Accepts the CSV for facilities, report data (.json) and full copies.</p>
      {pendingBackup && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber/[0.08] px-3.5 py-2.5 text-[0.84rem]">
          <span className="text-mist">That&apos;s a full copy. Loading it replaces everything saved here.</span>
          <button
            onClick={() => {
              const r = importStore(pendingBackup);
              if (r.ok && r.store) {
                replaceStore(r.store);
                setMessage({ text: "Loaded the full copy." });
              } else setMessage({ text: r.error ?? "That file couldn't be read.", bad: true });
              setPendingBackup(null);
            }}
            className="rounded-full bg-fog px-3.5 py-1.5 text-[0.8rem] font-medium text-ink"
          >
            Replace with the copy
          </button>
          <button onClick={() => setPendingBackup(null)} className="px-2 text-[0.8rem] text-mist hover:text-fog">
            Cancel
          </button>
        </div>
      )}
      {message && <p className={`mt-2 text-[0.82rem] ${message.bad ? "text-ember" : "text-lime"}`}>{message.text}</p>}
    </section>
  );
}

function Empty() {
  return (
    <div className="panel grid min-h-[320px] place-items-center p-8 text-center">
      <div className="max-w-md">
        <h2 className="text-xl font-semibold text-fog">Nothing saved yet</h2>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-mist">
          Every room you scan is saved here, grouped by place: your home, an office, a school. You&apos;ll see which room wastes the most, get one to-do list
          for all of them, and check your fixes worked.
        </p>
        <Link href="/scan" className="mt-5 inline-block rounded-full bg-fog px-5 py-2.5 text-[0.9rem] font-medium text-ink hover:bg-fog/85">
          Scan your first room
        </Link>
      </div>
    </div>
  );
}

function ago(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
