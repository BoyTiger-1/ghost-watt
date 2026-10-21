"use client";

// The 3D school page. First visit: one search box, "find your school". After
// that: the building in 3D at night, every room lit by what it wastes, with the
// worst rooms ranked beside it and the setup (floor plans, rooms) tucked below.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { updateBuilding, useStore, setActiveBuilding } from "@/lib/useStore";
import { DEFAULT_FIT, campusId, emptyCampus, gridRooms, heatColor, projectOutline, roomKey, roomWaste, type Campus, type Floor, type Footprint } from "@/lib/campus";
import { fmtMoneyFull } from "@/lib/energy";
import { PlanEditor } from "./PlanEditor";
import { placeRooms } from "./CampusScene";

const CampusScene = dynamic(() => import("./CampusScene").then((m) => m.CampusScene), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[0.86rem] text-moon/50">Building the 3D model…</div>,
});

const LAYERS: { id: string; label: string; groups: string[] | null }[] = [
  { id: "all", label: "All waste", groups: null },
  { id: "light", label: "Lighting", groups: ["lighting"] },
  { id: "screens", label: "Screens", groups: ["display"] },
  { id: "computers", label: "Computers", groups: ["computing", "network", "office"] },
  { id: "hvac", label: "Heating & cooling", groups: ["hvac"] },
  { id: "kitchen", label: "Kitchen", groups: ["kitchen", "refrigeration"] },
  { id: "other", label: "Other", groups: ["specialty"] },
];

interface SchoolResult {
  name: string;
  place: string;
  lat: number;
  lon: number;
  outline: [number, number][] | null;
  kind: "grounds" | "building" | "point";
  osmId: string;
  levels: number | null;
}
type Candidate = Footprint & { area: number; inside: boolean; school: boolean };

/** A floor plan photo, downscaled so a few floors fit in the browser's storage. */
async function readPlan(file: File): Promise<{ dataUrl: string; aspect: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image the browser can open. A photo or screenshot of the plan works."));
      i.src = url;
    });
    const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL("image/jpeg", 0.72), aspect: c.width / c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function OutlineThumb({ outline, className = "", tone = "light" }: { outline: [number, number][]; className?: string; tone?: "light" | "night" }) {
  const { points } = projectOutline(outline);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.max(maxX - minX, maxY - minY) || 1;
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${(((x - minX) / s) * 86 + 7).toFixed(1)} ${(((maxY - y) / s) * 86 + 7).toFixed(1)}`).join(" ") + "Z";
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d={d} fill={tone === "night" ? "rgba(255,199,119,0.18)" : "rgba(58,69,102,0.14)"} stroke={tone === "night" ? "#ffc777" : "currentColor"} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

/* ---- find your school ------------------------------------------------------------ */

function SchoolSearch({ onPick, autoFocus = false }: { onPick: (r: SchoolResult) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SchoolResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) return;
    let alive = true;
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/school-search?q=${encodeURIComponent(text)}`);
        const json = (await res.json()) as { results?: SchoolResult[]; error?: string };
        if (!alive) return;
        if (!res.ok) throw new Error(json.error ?? "Search didn't answer.");
        setResults(json.results ?? []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Search didn't answer.");
      } finally {
        if (alive) setBusy(false);
      }
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="relative text-left">
      <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-3.5 transition-colors focus-within:border-[#ffc777]/60">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-moon/60" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length < 3) setResults(null);
          }}
          placeholder="Your school's name, e.g. Lincoln High School Portland"
          aria-label="Search for your school"
          className="min-w-0 flex-1 bg-transparent text-[1.02rem] text-moon outline-none placeholder:text-moon/40"
        />
        {busy && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#ffc777] border-t-transparent" />}
      </div>
      {error && <p className="mt-2 text-[0.82rem] text-[#ff9a7a]">{error}</p>}
      {results && q.trim().length >= 3 && (
        <ul className="mt-2 max-h-[22rem] overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1f33]/95 p-1.5">
          {results.length === 0 && !busy && <li className="px-3 py-3 text-[0.88rem] text-moon/60">No schools found. Try adding the city.</li>}
          {results.map((r) => (
            <li key={r.osmId}>
              <button type="button" onClick={() => onPick(r)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-moon">
                  {r.outline ? <OutlineThumb outline={r.outline} className="h-9 w-9" tone="night" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem] font-medium text-moon">{r.name}</span>
                  <span className="block truncate text-[0.8rem] text-moon/55">{r.place || "Location unknown"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---- the page ---------------------------------------------------------------------- */

export function CampusView() {
  const store = useStore();
  const building = store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0] ?? null;
  const campus: Campus = building?.campus ?? emptyCampus();
  const waste = useMemo(() => (building ? roomWaste(store.audits, building.id) : new Map()), [store.audits, building]);

  const [layer, setLayer] = useState("all");
  const [explode, setExplode] = useState(0.3);
  const [onlyLevel, setOnlyLevel] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ school: SchoolResult; candidates: Candidate[] | null; error?: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const setupRef = useRef<HTMLDivElement>(null);

  const groups = LAYERS.find((l) => l.id === layer)!.groups;
  const placed = useMemo(() => placeRooms(campus, waste, groups), [campus, waste, groups]);
  const save = (next: Campus) => building && updateBuilding(building.id, { campus: next });
  const setFloor = (id: string, patch: Partial<Floor>) => save({ ...campus, floors: campus.floors.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

  const placedKeys = new Set(campus.floors.flatMap((f) => f.rooms.map((r) => roomKey(r.name))));
  const unplaced = [...waste.values()].filter((w) => !placedKeys.has(roomKey(w.name)));
  const ranked = [...placed.rooms].sort((a, b) => (b.waste ? b.value : -1) - (a.waste ? a.value : -1));
  const scanned = placed.rooms.filter((r) => r.waste);
  const total = scanned.reduce((s, r) => s + r.value, 0);
  const sel = placed.rooms.find((r) => r.floorId + r.id === selected) ?? null;
  const hasRooms = campus.floors.some((f) => f.rooms.length > 0);
  const started = Boolean(campus.footprint || campus.floors.length);

  /** A school picked from search: find the buildings on its grounds to choose from. */
  const pickSchool = async (r: SchoolResult) => {
    setPicking({ school: r, candidates: null });
    setChanging(false);
    if (building) {
      const generic = /^(my building|untitled building)$/i.test(building.name.trim());
      updateBuilding(building.id, { lat: Number(r.lat.toFixed(5)), lon: Number(r.lon.toFixed(5)), ...(generic ? { name: r.name } : {}) });
    }
    const own: Candidate[] = r.outline
      ? [{ outline: r.outline, levels: r.levels, name: r.kind === "grounds" ? `${r.name} (whole campus)` : r.name, osmId: r.osmId, kind: r.kind, area: 0, inside: true, school: true }]
      : [];
    try {
      const res = await fetch(`/api/footprint?lat=${r.lat}&lon=${r.lon}`);
      const json = (await res.json()) as { candidates?: Candidate[] };
      const near = (json.candidates ?? []).filter((c) => c.osmId !== r.osmId);
      // The school's own building first: inside its grounds, or tagged as a school.
      const all = [...near.filter((c) => c.inside || c.school), ...own, ...near.filter((c) => !c.inside && !c.school)].slice(0, 8);
      setPicking({ school: r, candidates: all });
    } catch {
      setPicking({ school: r, candidates: own, error: own.length ? undefined : "Couldn't load this school's buildings. Try again." });
    }
  };

  const pickBuilding = (c: Candidate, school: SchoolResult) => {
    const fp: Footprint = { outline: c.outline, levels: c.levels, name: c.name, osmId: c.osmId, kind: c.kind };
    const want = Math.max(campus.floors.length, c.levels ?? 1, 1);
    const floors = [...campus.floors];
    for (let i = floors.length; i < Math.min(want, 8); i++) floors.push({ id: campusId("f"), level: i, name: i === 0 ? "Ground floor" : `Floor ${i + 1}`, rooms: [], fit: { ...DEFAULT_FIT } });
    save({ ...campus, footprint: fp, floors, school: { name: school.name, place: school.place, osmId: school.osmId } });
    setPicking(null);
    setSelected(null);
  };

  const addFloor = () => {
    const level = campus.floors.length;
    save({ ...campus, floors: [...campus.floors, { id: campusId("f"), level, name: level === 0 ? "Ground floor" : `Floor ${level + 1}`, rooms: [], fit: { ...DEFAULT_FIT } }] });
  };

  const autoPlace = () => {
    const names = unplaced.map((w) => w.name);
    if (!names.length) return;
    const floors = campus.floors.length ? [...campus.floors] : [{ id: campusId("f"), level: 0, name: "Ground floor", rooms: [], fit: { ...DEFAULT_FIT } }];
    const target = floors.find((f) => !f.plan) ?? floors[0];
    save({ ...campus, floors: floors.map((f) => (f.id === target.id ? { ...f, rooms: gridRooms([...target.rooms.map((r) => r.name), ...names]) } : f)) });
  };

  if (!building) {
    return (
      <div className="panel p-10 text-center">
        <h2 className="font-editorial text-[1.8rem] text-fog">Scan a room first</h2>
        <p className="mx-auto mt-2 max-w-md text-[0.95rem] text-mist">The 3D school colours each room by what its scan found, so it starts with a scan.</p>
        <Link href="/scan" className="mt-5 inline-block rounded-full bg-fog px-5 py-2.5 text-[0.9rem] font-medium text-ink">
          Open the scanner
        </Link>
      </div>
    );
  }

  // ---- first visit, or changing school: find it, then pick its building ----
  if (!started || picking || changing) {
    return (
      <section className="grain relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,#1b1f33_0%,#151827_60%,#121420_100%)] px-6 py-14 text-moon sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,170,80,0.18),transparent)]" />
        {picking ? (
          <div className="relative mx-auto max-w-3xl">
            <button onClick={() => setPicking(null)} className="text-[0.82rem] text-moon/60 hover:text-moon">
              ← Search again
            </button>
            <h2 className="font-editorial mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-tight">
              Which building is <span className="italic text-[#ffc777]">{picking.school.name}?</span>
            </h2>
            <p className="mt-1 text-[0.9rem] text-moon/60">{picking.school.place} · outlines from OpenStreetMap</p>
            {!picking.candidates ? (
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/[0.05]" />
                ))}
              </div>
            ) : picking.candidates.length ? (
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {picking.candidates.map((c, i) => (
                  <li key={c.osmId}>
                    <button
                      onClick={() => pickBuilding(c, picking.school)}
                      className={`group flex h-full w-full flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors hover:border-[#ffc777]/70 hover:bg-white/[0.06] ${i === 0 ? "border-[#ffc777]/40 bg-white/[0.05]" : "border-white/10"}`}
                    >
                      <OutlineThumb outline={c.outline} className="h-20 w-20 transition-transform group-hover:scale-105" tone="night" />
                      <span className="line-clamp-2 text-[0.86rem] font-medium">{c.name ?? (c.school ? "School building" : "Building")}</span>
                      <span className="text-[0.74rem] text-moon/50">
                        {c.area ? `${Math.round(c.area * 10.764).toLocaleString("en-US")} sq ft` : "school grounds"}
                        {c.levels ? ` · ${c.levels} floors` : ""}
                      </span>
                      {i === 0 && <span className="rounded-full bg-[#ffc777]/15 px-2 py-0.5 text-[0.68rem] text-[#ffc777]">best match</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-[0.92rem] text-[#ff9a7a]">{picking.error ?? "No building outlines are mapped for this school yet. You can still use floor plans on their own."}</p>
            )}
          </div>
        ) : (
          <div className="relative mx-auto max-w-2xl text-center">
            <p className="text-[0.78rem] uppercase tracking-[0.16em] text-[#ffc777]/80">Step 1 of 3</p>
            <h2 className="font-editorial mt-3 text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.02]">
              Find your <span className="italic text-[#ffc777]">school.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[1rem] leading-relaxed text-moon/65">
              Its real outline and floor count come from OpenStreetMap. Then add your floor plans and every scanned room lights up.
            </p>
            <div className="mt-8">
              <SchoolSearch onPick={pickSchool} autoFocus />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.84rem]">
              {changing && (
                <button onClick={() => setChanging(false)} className="text-moon/60 hover:text-moon">
                  Cancel
                </button>
              )}
              {!started && (
                <button onClick={addFloor} className="text-moon/60 underline decoration-moon/25 underline-offset-4 hover:text-moon">
                  Not on the map? Start with floor plans instead
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---- the model ---- */}
      <section className="grain relative isolate h-[min(78vh,46rem)] min-h-[30rem] overflow-hidden rounded-[2rem] bg-[radial-gradient(120%_80%_at_50%_0%,#252b46_0%,#161a2b_55%,#101320_100%)] text-moon">
        <CampusScene
          key={`${campus.footprint?.osmId ?? "plan"}:${campus.floors.length}`}
          campus={campus}
          placed={placed}
          explode={explode}
          onlyLevel={onlyLevel}
          selected={selected}
          onSelect={setSelected}
        />

        {/* school + totals */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div className="pointer-events-auto max-w-[min(26rem,100%)]">
            <h2 className="font-editorial truncate text-[1.6rem] leading-tight sm:text-[1.9rem]">{campus.school?.name ?? building.name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.8rem] text-moon/55">
              {campus.school?.place && <span>{campus.school.place}</span>}
              <button onClick={() => setChanging(true)} className="text-[#ffc777]/90 hover:text-[#ffc777]">
                Change school
              </button>
              {store.buildings.length > 1 && (
                <select
                  value={building.id}
                  onChange={(e) => {
                    setActiveBuilding(e.target.value);
                    setSelected(null);
                  }}
                  aria-label="Place"
                  className="rounded-full border border-white/15 bg-transparent px-2 py-0.5 text-moon/80"
                >
                  {store.buildings.map((b) => (
                    <option key={b.id} value={b.id} className="text-black">
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </p>
          </div>
          <dl className="pointer-events-auto flex gap-2">
            {[
              ["Wasted / yr", fmtMoneyFull(total)],
              ["Rooms scanned", `${scanned.length}/${placed.rooms.length || 0}`],
            ].map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-white/10 bg-[#161a2b]/70 px-3.5 py-2 backdrop-blur-md">
                <dt className="text-[0.68rem] uppercase tracking-[0.08em] text-moon/50">{l}</dt>
                <dd className="font-mono text-[1.05rem] font-semibold text-[#ffc777]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* nothing placed yet */}
        {!hasRooms && (
          <div className="absolute inset-x-0 bottom-24 flex justify-center px-4">
            <div className="rounded-2xl border border-white/10 bg-[#161a2b]/85 px-5 py-4 text-center backdrop-blur-md">
              <p className="text-[0.95rem] font-medium">Now add a floor plan and mark the rooms</p>
              <p className="mt-0.5 text-[0.8rem] text-moon/55">Each room you name the way it was scanned lights up here.</p>
              <button onClick={() => setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="mt-3 rounded-full bg-[#ffc777] px-4 py-1.5 text-[0.84rem] font-medium text-[#1c1b18]">
                Add floor plans ↓
              </button>
            </div>
          </div>
        )}

        {/* layers, floors, legend */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
          <div className="pointer-events-auto flex max-w-full flex-wrap gap-1.5">
            {LAYERS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLayer(l.id)}
                className={`rounded-full border px-3 py-1.5 text-[0.78rem] backdrop-blur-md transition-colors ${layer === l.id ? "border-[#ffc777] bg-[#ffc777] text-[#1c1b18]" : "border-white/15 bg-[#161a2b]/60 text-moon/75 hover:text-moon"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            {hasRooms && (
              <div className="rounded-2xl border border-white/10 bg-[#161a2b]/70 px-3 py-2 text-[0.7rem] text-moon/60 backdrop-blur-md">
                <div className="h-1.5 w-44 rounded-full" style={{ background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.25)}, ${heatColor(0.5)}, ${heatColor(0.75)}, ${heatColor(1)})` }} />
                <div className="mt-1 flex justify-between">
                  <span>$0</span>
                  <span>{fmtMoneyFull(placed.max)}/yr</span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#161a2b]/70 px-3 py-1.5 text-[0.74rem] text-moon/70 backdrop-blur-md">
              <select value={onlyLevel ?? ""} onChange={(e) => setOnlyLevel(e.target.value === "" ? null : Number(e.target.value))} aria-label="Floors shown" className="bg-transparent text-moon outline-none">
                <option value="" className="text-black">
                  All floors
                </option>
                {campus.floors.map((f) => (
                  <option key={f.id} value={f.level} className="text-black">
                    {f.name}
                  </option>
                ))}
              </select>
              <span className="h-3 w-px bg-white/15" />
              <label className="flex items-center gap-1.5">
                Pull apart
                <input type="range" min={0} max={1} step={0.05} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="w-20 accent-[#ffc777]" />
              </label>
            </div>
          </div>
        </div>

        {/* the room you picked */}
        {sel && (
          <div className="absolute right-4 top-24 w-72 max-w-[calc(100%-2rem)] rounded-2xl border border-white/10 bg-[#161a2b]/90 p-4 shadow-2xl backdrop-blur-md sm:right-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[1.05rem] font-semibold">{sel.name}</p>
                <p className="text-[0.74rem] text-moon/50">{campus.floors.find((f) => f.id === sel.floorId)?.name}</p>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="text-lg leading-none text-moon/50 hover:text-moon">
                ×
              </button>
            </div>
            {sel.waste ? (
              <>
                <p className="mt-2 font-mono text-[1.5rem] font-bold" style={{ color: heatColor(sel.value / placed.max) }}>
                  {fmtMoneyFull(sel.waste.waste)}
                  <span className="text-[0.8rem] font-normal text-moon/50"> a year</span>
                </p>
                <ul className="mt-2 space-y-1.5">
                  {sel.waste.devices.slice(0, 5).map((d) => (
                    <li key={d.label} className="flex justify-between gap-2 text-[0.82rem]">
                      <span className="truncate text-moon/75">
                        {d.count > 1 ? `${d.count} × ` : ""}
                        {d.label}
                      </span>
                      <span className="shrink-0 font-mono text-moon">{fmtMoneyFull(d.cost)}</span>
                    </li>
                  ))}
                  {sel.waste.devices.length === 0 && <li className="text-[0.82rem] text-[#7fc9a3]">Everything was off.</li>}
                </ul>
                <p className="mt-2 text-[0.7rem] text-moon/40">Scanned {new Date(sel.waste.at).toLocaleDateString()}</p>
              </>
            ) : (
              <p className="mt-2 text-[0.86rem] text-moon/60">Not scanned yet.</p>
            )}
            <Link href={`/scan?room=${encodeURIComponent(sel.name)}`} className="mt-3 inline-block rounded-full bg-[#ffc777] px-4 py-1.5 text-[0.8rem] font-medium text-[#1c1b18]">
              {sel.waste ? "Scan again" : "Scan this room"}
            </Link>
          </div>
        )}
      </section>
      <p className="-mt-2 text-center text-[0.74rem] text-dim">Drag to turn · scroll or pinch to zoom · click a room · outline © OpenStreetMap contributors</p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* ---- rooms, worst first ---- */}
        <section className="panel overflow-hidden">
          <header className="flex items-baseline justify-between border-b border-line px-5 py-4">
            <h3 className="text-[1.02rem] font-semibold text-fog">Rooms, worst first</h3>
            <span className="text-[0.78rem] text-dim">{LAYERS.find((l) => l.id === layer)!.label}</span>
          </header>
          {ranked.length === 0 ? (
            <p className="px-5 py-6 text-[0.88rem] text-mist">No rooms on the model yet. Add a floor plan and mark its rooms.</p>
          ) : (
            <ol className="max-h-[28rem] divide-y divide-line overflow-y-auto">
              {ranked.map((r, i) => {
                const on = selected === r.floorId + r.id;
                return (
                  <li key={r.floorId + r.id}>
                    <button onClick={() => setSelected(on ? null : r.floorId + r.id)} className={`flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors ${on ? "bg-fog/[0.06]" : "hover:bg-fog/[0.03]"}`}>
                      <span className="w-5 text-right font-mono text-[0.72rem] text-dim">{r.waste ? i + 1 : ""}</span>
                      <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: r.waste ? heatColor(r.value / placed.max) : "transparent", border: r.waste ? "none" : "1.5px dashed var(--color-line2)" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9rem] text-fog">{r.name || "Unnamed room"}</span>
                        <span className="block text-[0.72rem] text-dim">{campus.floors.find((f) => f.id === r.floorId)?.name}</span>
                      </span>
                      <span className={`shrink-0 font-mono text-[0.86rem] ${r.waste ? "text-fog" : "text-dim"}`}>{r.waste ? `${fmtMoneyFull(r.value)}/yr` : "not scanned"}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* ---- setup ---- */}
        <section ref={setupRef} className="panel scroll-mt-24 p-5">
          <h3 className="text-[1.02rem] font-semibold text-fog">Set up</h3>
          <ol className="mt-4 space-y-5">
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime text-[0.72rem] font-semibold text-ink">✓</span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9rem] font-medium text-fog">School</p>
                <p className="truncate text-[0.8rem] text-dim">
                  {campus.footprint ? `${campus.footprint.name ?? "Mapped building"}${campus.footprint.levels ? ` · ${campus.footprint.levels} floors mapped` : ""}` : "Using floor plans only"}
                </p>
                <button onClick={() => setChanging(true)} className="mt-0.5 text-[0.78rem] text-cyan hover:underline">
                  {campus.footprint ? "Change" : "Find the school on the map"}
                </button>
              </div>
            </li>

            <li className="flex gap-3">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.72rem] font-semibold ${campus.floors.some((f) => f.plan) ? "bg-lime text-ink" : "bg-fog text-ink"}`}>
                {campus.floors.some((f) => f.plan) ? "✓" : "2"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <p className="text-[0.9rem] font-medium text-fog">Floor plans</p>
                  <button onClick={addFloor} className="text-[0.78rem] text-cyan hover:underline">
                    + Add floor
                  </button>
                </div>
                <p className="text-[0.78rem] text-dim">A photo of the fire-evacuation map by the door works.</p>
                {msg && <p className="mt-1 text-[0.78rem] text-ember">{msg}</p>}
                <ul className="mt-2.5 space-y-2">
                  {campus.floors.map((f) => (
                    <li key={f.id} className="rounded-xl border border-line p-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {f.plan ? <img src={f.plan.dataUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-[0.62rem] text-dim">no plan</span>}
                        </span>
                        <div className="min-w-0 flex-1">
                          <input value={f.name} onChange={(e) => setFloor(f.id, { name: e.target.value.slice(0, 30) })} aria-label="Floor name" className="w-full bg-transparent text-[0.86rem] font-medium text-fog outline-none" />
                          <p className="text-[0.72rem] text-dim">{f.rooms.length ? `${f.rooms.length} rooms marked` : f.plan ? "No rooms marked yet" : "Upload its plan"}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <label className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-[0.74rem] text-mist hover:text-fog">
                          {f.plan ? "Replace plan" : "Upload plan"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                setMsg(null);
                                setFloor(f.id, { plan: await readPlan(file), rooms: [] });
                                setEditing(f.id);
                              } catch (err) {
                                setMsg(err instanceof Error ? err.message : "Couldn't read that image.");
                              }
                            }}
                          />
                        </label>
                        {f.plan && (
                          <button onClick={() => setEditing(f.id)} className="rounded-full bg-fog px-2.5 py-1 text-[0.74rem] font-medium text-ink">
                            Mark rooms
                          </button>
                        )}
                        <button onClick={() => save({ ...campus, floors: campus.floors.filter((x) => x.id !== f.id).map((x, i) => ({ ...x, level: i })) })} className="ml-auto text-[0.72rem] text-dim hover:text-ember">
                          Remove
                        </button>
                      </div>
                      {f.plan && f.rooms.length > 0 && campus.footprint && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[0.74rem] text-mist">Line it up with the outline</summary>
                          <div className="mt-2 grid gap-1.5 text-[0.72rem] text-dim">
                            {(
                              [
                                ["Rotate", "rotation", -180, 180, 1, "°"],
                                ["Size", "scale", 0.5, 1.6, 0.01, "×"],
                                ["East / west", "dx", -60, 60, 0.5, " m"],
                                ["North / south", "dy", -60, 60, 0.5, " m"],
                              ] as const
                            ).map(([label, k, min, max, step, unit]) => (
                              <label key={k} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2">
                                {label}
                                <input type="range" min={min} max={max} step={step} value={f.fit[k]} onChange={(e) => setFloor(f.id, { fit: { ...f.fit, [k]: Number(e.target.value) } })} className="accent-[var(--color-cyan)]" />
                                <span className="text-right tabular-nums">
                                  {f.fit[k]}
                                  {unit}
                                </span>
                              </label>
                            ))}
                            <div className="flex gap-3">
                              <button onClick={() => setFloor(f.id, { fit: { ...DEFAULT_FIT } })} className="text-cyan hover:underline">
                                Reset
                              </button>
                              <button onClick={() => save({ ...campus, floors: campus.floors.map((x) => ({ ...x, fit: { ...f.fit } })) })} className="text-cyan hover:underline">
                                Use for every floor
                              </button>
                            </div>
                          </div>
                        </details>
                      )}
                      {editing === f.id &&
                        f.plan &&
                        createPortal(
                          <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[#0f1120]/70 p-4 backdrop-blur-sm sm:p-8" onClick={() => setEditing(null)}>
                            <div className="w-full max-w-5xl rounded-[1.5rem] bg-surface p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-[1.05rem] font-semibold text-fog">Mark the rooms · {f.name}</h3>
                                  <p className="text-[0.8rem] text-dim">Name each room the way it was scanned (&quot;Room 214&quot;, &quot;Gym&quot;) so its waste shows on the model.</p>
                                </div>
                                <button onClick={() => setEditing(null)} className="shrink-0 rounded-full bg-fog px-5 py-2 text-[0.88rem] font-medium text-ink">
                                  Done
                                </button>
                              </div>
                              <PlanEditor floor={f} knownRooms={[...waste.values()].map((w) => w.name)} onChange={(rooms) => setFloor(f.id, { rooms })} />
                            </div>
                          </div>,
                          document.body,
                        )}
                    </li>
                  ))}
                </ul>
              </div>
            </li>

            <li className="flex gap-3">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.72rem] font-semibold ${unplaced.length === 0 && hasRooms ? "bg-lime text-ink" : "bg-fog text-ink"}`}>
                {unplaced.length === 0 && hasRooms ? "✓" : "3"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9rem] font-medium text-fog">Match your scans</p>
                {unplaced.length === 0 ? (
                  <p className="text-[0.78rem] text-dim">{waste.size ? "Every scanned room is on the model." : "Scanned rooms show up here to place."}</p>
                ) : (
                  <>
                    <p className="text-[0.78rem] text-dim">Not on the model yet: {unplaced.map((w) => w.name).join(", ")}</p>
                    <button onClick={autoPlace} className="mt-1.5 rounded-full border border-line px-3 py-1 text-[0.76rem] text-fog hover:border-fog/40">
                      Place them automatically
                    </button>
                  </>
                )}
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
