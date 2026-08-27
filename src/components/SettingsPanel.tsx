"use client";

// What is switched on, and what would switch on if you added a key.
//
// Ghost Watt is built so that every external service is an upgrade, never a
// dependency: with no keys at all it runs on stored EIA and eGRID tables and
// gives an answer it can defend. This page is the honest accounting of that -
// which providers are live, what each missing one would buy, and where to get it.
// Nothing here ever displays a key value; the server only reports booleans.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ScheduleEditor } from "./BuildingBar";
import { REGIONS } from "@/lib/grid";
import { BUILDING_TYPES } from "@/lib/benchmark";
import { useStore, updateBuilding, setActiveBuilding, replaceStore } from "@/lib/useStore";
import { exportStore, importStore, downloadText } from "@/lib/export";
import { EMPTY_STORE, type Building } from "@/lib/storage";

interface KeyInfo {
  env: string;
  label: string;
  configured: boolean;
  buys: string;
  signup: string;
  required: boolean;
  optionalNote?: string;
}

interface HostedInfo {
  id: string;
  label: string;
  env: string;
  model: string;
  signup: string;
  note: string;
  configured: boolean;
}

interface EngineStatus {
  ready: boolean;
  active: "local" | "hosted" | "none";
  activeLabel: string;
  activeModel: string;
  local: { reachable: boolean; hasModel: boolean; model: string; host: string; models: string[] };
  hosted: HostedInfo[];
}

export function SettingsPanel() {
  const store = useStore();
  const [keys, setKeys] = useState<KeyInfo[] | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const building =
    store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0] ?? null;

  useEffect(() => {
    let live = true;
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d: { keys: KeyInfo[] }) => live && setKeys(d.keys))
      .catch(() => live && setKeys([]));
    fetch("/api/status")
      .then((r) => r.json())
      .then((d: EngineStatus) => live && setEngine(d))
      .catch(() => live && setEngine(null));
    return () => {
      live = false;
    };
  }, []);

  const configured = keys?.filter((k) => k.configured).length ?? 0;
  const hostedActive = engine?.hosted.find((h) => h.configured) ?? null;

  return (
    <section className="relative z-10 mx-auto max-w-4xl px-4 pb-20 pt-24 sm:px-6">
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 grad-energy-bg" />
          <span className="mono-label text-cyan">configuration</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-fog sm:text-4xl">
          What is switched on
        </h1>
        <p className="mt-3 max-w-2xl text-mist">
          Ghost Watt runs with no API keys at all. Every provider below is an upgrade from a
          stored government table to a live figure - none of them is required, and none of them
          changes whether the app works.
        </p>
      </header>

      {/* ---- the vision engine ---- */}
      <div className="panel ticked p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-fog">Vision engine</h2>
          <span className="mono-label">local first, hosted as backup</span>
        </div>

        <div
          className="mt-4 flex items-center gap-3 border-l-2 bg-surface2/40 px-4 py-3"
          style={{ borderColor: engineTint(engine) }}
        >
          <span
            className={`h-2 w-2 shrink-0 ${engine?.ready ? "breathe" : ""}`}
            style={{ background: engineTint(engine) }}
          />
          <div className="min-w-0">
            <p className="text-sm text-fog">{engineSentence(engine)}</p>
            <p className="truncate font-mono text-[0.66rem] text-dim">
              {engine?.active === "local"
                ? engine.local.host
                : engine?.active === "hosted"
                  ? engine.activeModel
                  : "no engine"}
            </p>
          </div>
        </div>

        {/* The chain, in the order it is actually tried. */}
        <ol className="mt-4 space-y-2">
          <ChainStep
            n={1}
            title="Ollama on this machine"
            detail={
              engine?.local.hasModel
                ? `${engine.local.model} loaded. Photos never leave the device.`
                : engine?.local.reachable
                  ? `Running, but ${engine.local.model} is not pulled yet.`
                  : "Not reachable. Optional - this is the private, zero-cost path."
            }
            state={
              engine?.active === "local" ? "active" : engine?.local.hasModel ? "ready" : "off"
            }
          />
          <ChainStep
            n={2}
            title="Hosted model"
            detail={
              hostedActive
                ? `${hostedActive.label} · ${hostedActive.model}. Visitors need no key of their own.`
                : "No key set. Add one below so anyone can scan a real photo without installing anything."
            }
            state={engine?.active === "hosted" ? "active" : hostedActive ? "ready" : "off"}
          />
          <ChainStep
            n={3}
            title="Room-profile estimate"
            detail="Always available. Produces a full costed audit with no model at all."
            state={engine?.active === "none" ? "active" : "ready"}
          />
        </ol>

        {engine && engine.local.reachable && !engine.local.hasModel && (
          <pre className="mt-3 overflow-x-auto border border-line bg-ink px-3 py-2 font-mono text-[0.72rem] text-mist">
            <code>ollama pull {engine.local.model}</code>
          </pre>
        )}

        {/* Hosted options. Only one is ever needed. */}
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="mono-label">hosted options - set any one</span>
            <span className="font-mono text-[0.62rem] uppercase tracking-wider text-dim">
              {engine
                ? `${engine.hosted.filter((h) => h.configured).length} of ${engine.hosted.length} set`
                : "checking…"}
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {(engine?.hosted ?? []).map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-surface2/30 px-3 py-2.5"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0"
                  style={{
                    background: h.configured ? "var(--color-lime)" : "var(--color-line2)",
                  }}
                />
                <span className="text-sm font-medium text-fog">{h.label}</span>
                <code className="font-mono text-[0.66rem] text-dim">{h.env}</code>
                {!h.configured && (
                  <a
                    href={h.signup}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[0.66rem] text-cyan underline-offset-4 hover:underline"
                  >
                    get a key &rarr;
                  </a>
                )}
                <span
                  className={`ml-auto font-mono text-[0.6rem] uppercase tracking-wider ${
                    h.configured ? "text-lime" : "text-dim"
                  }`}
                >
                  {h.configured ? "set" : "not set"}
                </span>
                <p className="w-full text-[0.76rem] leading-relaxed text-dim">{h.note}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-4 text-[0.8rem] leading-relaxed text-dim">
          The model only reads what is in a photo. Every watt, dollar, kilogram and payback figure
          downstream is computed in plain TypeScript from published equipment data - which is why
          the numbers stay identical whether the model is running locally, running in someone
          else&rsquo;s datacentre, or not running at all.
        </p>
      </div>

      {/* ---- providers ---- */}
      <div className="panel mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-fog">Data providers</h2>
          <span className="mono-label">
            {keys ? `${configured} of ${keys.length} configured` : "checking…"}
          </span>
        </div>

        <ul className="mt-4 space-y-3">
          {(keys ?? []).map((k, i) => (
            <motion.li
              key={k.env}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="border border-line bg-surface2/40 p-4"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className="h-1.5 w-1.5 shrink-0"
                  style={{
                    background: k.configured ? "var(--color-cyan)" : "var(--color-line2)",
                  }}
                />
                <span className="font-semibold text-fog">{k.label}</span>
                <code className="font-mono text-[0.68rem] text-dim">{k.env}</code>
                <span
                  className={`ml-auto font-mono text-[0.62rem] uppercase tracking-wider ${
                    k.configured ? "text-cyan" : "text-dim"
                  }`}
                >
                  {k.configured ? "live" : "using stored table"}
                </span>
              </div>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-mist">{k.buys}</p>
              {k.optionalNote && (
                <p className="mt-1.5 font-mono text-[0.7rem] leading-relaxed text-dim">
                  {k.optionalNote}
                </p>
              )}
              {!k.configured && (
                <a
                  href={k.signup}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block font-mono text-[0.7rem] text-cyan underline-offset-4 hover:underline"
                >
                  free key →
                </a>
              )}
            </motion.li>
          ))}
        </ul>

        <div className="mt-5 border-t border-line pt-4">
          <span className="mono-label">to switch one on</span>
          <pre className="mt-2 overflow-x-auto border border-line bg-ink px-3 py-2 font-mono text-[0.72rem] leading-relaxed text-mist">
            <code>{`# .env.local\nEIA_API_KEY=…            # prices + live grid mix\nOPENWEATHER_API_KEY=…    # degree days\nNREL_API_KEY=…           # optional, DEMO_KEY works\n\n# any one of these, so visitors need no key:\nANTHROPIC_API_KEY=…\n\n# only if a whole class will scan at once:\nUPSTASH_REDIS_REST_URL=…\nUPSTASH_REDIS_REST_TOKEN=…`}</code>
          </pre>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-dim">
            All of these are free and none is required. Without them Ghost Watt uses EIA state
            averages and eGRID subregion carbon intensity from stored tables, and says so in the
            methodology. The EIA key is the one worth having - it covers both current prices and
            the hourly grid mix that live carbon intensity is computed from.
          </p>
        </div>
      </div>

      {/* ---- defaults ---- */}
      {building && (
        <div className="panel mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-fog">Building defaults</h2>
            <span className="mono-label">{building.name}</span>
          </div>

          {store.buildings.length > 1 && (
            <select
              value={building.id}
              onChange={(e) => setActiveBuilding(e.target.value)}
              className="mt-4 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
            >
              {store.buildings.map((b) => (
                <option key={b.id} value={b.id} className="bg-surface">
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mono-label">name</span>
              <input
                value={building.name}
                onChange={(e) => updateBuilding(building.id, { name: e.target.value })}
                className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 text-sm text-fog outline-none focus:border-cyan"
              />
            </label>
            <label className="block">
              <span className="mono-label">floor area (sq ft)</span>
              <input
                type="number"
                min={0}
                step={500}
                value={building.floorAreaSqFt || ""}
                onChange={(e) =>
                  updateBuilding(building.id, { floorAreaSqFt: parseFloat(e.target.value) || 0 })
                }
                className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
              />
            </label>
            <label className="block">
              <span className="mono-label">state / region</span>
              <select
                value={building.regionCode}
                onChange={(e) => updateBuilding(building.id, { regionCode: e.target.value })}
                className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
              >
                <option value="US" className="bg-surface">
                  United States (average)
                </option>
                {REGIONS.map((r) => (
                  <option key={r.code} value={r.code} className="bg-surface">
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mono-label">building type</span>
              <select
                value={building.typeId}
                onChange={(e) => updateBuilding(building.id, { typeId: e.target.value })}
                className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
              >
                {BUILDING_TYPES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-surface">
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <LocationField building={building} />
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <BillField building={building} />
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <ScheduleEditor
              schedule={building.schedule}
              onChange={(schedule) => updateBuilding(building.id, { schedule })}
            />
          </div>
        </div>
      )}

      {/* ---- data ---- */}
      <div className="panel mt-6 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-fog">Your data</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          {store.buildings.length} building{store.buildings.length === 1 ? "" : "s"},{" "}
          {store.audits.length} saved audit{store.audits.length === 1 ? "" : "s"},{" "}
          {store.fixes.length} logged fix{store.fixes.length === 1 ? "" : "es"} - all of it in
          this browser only. Photos are never stored and never leave the machine they were
          uploaded from.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() =>
              downloadText(
                `ghostwatt-backup-${new Date().toISOString().slice(0, 10)}.json`,
                exportStore(store),
                "application/json",
              )
            }
            className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-cyan hover:text-cyan"
          >
            export backup
          </button>
          <label className="cursor-pointer border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-cyan hover:text-cyan">
            import backup
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const result = importStore(await file.text());
                if (result.ok && result.store) {
                  replaceStore(result.store);
                  setImportMsg("Restored.");
                } else {
                  setImportMsg(result.error ?? "That file could not be read.");
                }
              }}
            />
          </label>
          <button
            onClick={() => {
              if (confirm("Erase every building, audit and fix stored in this browser?")) {
                replaceStore(EMPTY_STORE);
                setImportMsg("Cleared.");
              }
            }}
            className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-dim transition-colors hover:border-ember hover:text-ember"
          >
            erase everything
          </button>
        </div>
        {importMsg && <p className="mt-2 font-mono text-xs text-cyan">{importMsg}</p>}
      </div>
    </section>
  );
}

// ---- vision-chain helpers ----------------------------------------------

function engineTint(engine: EngineStatus | null): string {
  if (!engine) return "var(--color-line2)";
  if (engine.active === "local") return "var(--color-cyan)";
  if (engine.active === "hosted") return "var(--color-lime)";
  return "var(--color-amber)";
}

function engineSentence(engine: EngineStatus | null): string {
  if (engine === null) return "Checking…";
  if (engine.active === "local") {
    return `${engine.activeModel} is answering locally. No photo leaves this machine.`;
  }
  if (engine.active === "hosted") {
    return `${engine.activeLabel} is answering. Visitors can scan without installing anything.`;
  }
  return "No vision engine available - scans fall back to the room-profile estimate.";
}

function ChainStep({
  n,
  title,
  detail,
  state,
}: {
  n: number;
  title: string;
  detail: string;
  state: "active" | "ready" | "off";
}) {
  const tint =
    state === "active"
      ? "var(--color-cyan)"
      : state === "ready"
        ? "var(--color-mist)"
        : "var(--color-line2)";
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-0.5 w-5 shrink-0 font-mono text-[0.68rem] tabular-nums"
        style={{ color: tint }}
      >
        {String(n).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: state === "off" ? "var(--color-dim)" : "var(--color-fog)" }}
          >
            {title}
          </span>
          {state === "active" && (
            <span className="font-mono text-[0.6rem] uppercase tracking-wider text-cyan">
              in use
            </span>
          )}
        </div>
        <p className="text-[0.78rem] leading-relaxed text-dim">{detail}</p>
      </div>
    </li>
  );
}

/**
 * Optional coordinates for the building.
 *
 * Two providers need a point rather than a state - OpenWeather, to weight HVAC
 * findings against what it is doing outside, and NREL, to name the utility that
 * actually serves the address instead of averaging the whole state. Neither is
 * worth a mandatory field, so this is a single opt-in control that degrades to
 * nothing at all when declined.
 */
function LocationField({ building }: { building: Building }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const has = typeof building.lat === "number" && typeof building.lon === "number";

  const locate = () => {
    if (!navigator.geolocation) {
      setError("This browser does not offer location.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateBuilding(building.id, {
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
        });
        setBusy(false);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location declined. Everything else still works."
            : "Could not get a location fix.",
        );
        setBusy(false);
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="mono-label">location (optional)</span>
        <span className="font-mono text-[0.62rem] uppercase tracking-wider text-dim">
          weather + utility rate
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          onClick={locate}
          disabled={busy}
          className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-cyan hover:text-cyan disabled:opacity-50"
        >
          {busy ? "locating…" : has ? "update from this device" : "use this device’s location"}
        </button>
        {has && (
          <>
            <code className="font-mono text-[0.7rem] text-cyan tabular-nums">
              {building.lat!.toFixed(4)}, {building.lon!.toFixed(4)}
            </code>
            <button
              onClick={() => updateBuilding(building.id, { lat: undefined, lon: undefined })}
              className="font-mono text-[0.7rem] text-dim underline-offset-4 hover:text-ember hover:underline"
            >
              clear
            </button>
          </>
        )}
      </div>

      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mono-label">latitude</span>
          <input
            type="number"
            step="0.0001"
            value={building.lat ?? ""}
            placeholder="38.5816"
            onChange={(e) =>
              updateBuilding(building.id, {
                lat: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
          />
        </label>
        <label className="block">
          <span className="mono-label">longitude</span>
          <input
            type="number"
            step="0.0001"
            value={building.lon ?? ""}
            placeholder="-121.4944"
            onChange={(e) =>
              updateBuilding(building.id, {
                lon: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
          />
        </label>
      </div>

      {error && <p className="mt-2 font-mono text-[0.7rem] text-amber">{error}</p>}
      <p className="mt-2 text-[0.76rem] leading-relaxed text-dim">
        Stored in this browser with the rest of the building record and sent to the weather and
        utility-rate lookups only. Leave it blank and those two panels simply do not appear.
      </p>
    </div>
  );
}

/**
 * One line off one utility bill.
 *
 * Three numbers, and they replace the single largest assumption in the report. The
 * form asks for exactly what is printed on the paper - total kWh, total dollars,
 * days in the period - rather than asking anyone to separate energy charges from
 * delivery charges, because the blended figure is the one a savings estimate needs
 * and it is the one nobody has to interpret to find.
 */
function BillField({ building }: { building: Building }) {
  const bill = building.bill;
  const set = (patch: Partial<NonNullable<Building["bill"]>>) => {
    const base = bill ?? { kwh: 0, dollars: 0, days: 30, periodEnd: "" };
    updateBuilding(building.id, { bill: { ...base, ...patch } });
  };

  const rate = bill && bill.kwh > 0 ? bill.dollars / bill.kwh : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="mono-label">utility bill (optional)</span>
        <span className="font-mono text-[0.62rem] uppercase tracking-wider text-dim">
          calibrates every dollar figure
        </span>
      </div>

      <div className="mt-2.5 grid gap-3 @lg:grid-cols-4 sm:grid-cols-2">
        <label className="block">
          <span className="mono-label">kWh billed</span>
          <input
            type="number"
            min="0"
            value={bill?.kwh ?? ""}
            placeholder="41200"
            onChange={(e) => set({ kwh: Number(e.target.value) })}
            className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
          />
        </label>
        <label className="block">
          <span className="mono-label">total charged ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={bill?.dollars ?? ""}
            placeholder="9880"
            onChange={(e) => set({ dollars: Number(e.target.value) })}
            className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
          />
        </label>
        <label className="block">
          <span className="mono-label">days in period</span>
          <input
            type="number"
            min="1"
            max="400"
            value={bill?.days ?? ""}
            placeholder="30"
            onChange={(e) => set({ days: Number(e.target.value) })}
            className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
          />
        </label>
        <label className="block">
          <span className="mono-label">period ended</span>
          <input
            type="date"
            value={bill?.periodEnd ?? ""}
            onChange={(e) => set({ periodEnd: e.target.value })}
            className="mt-1.5 w-full border border-line bg-surface2 px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
          />
        </label>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        {rate !== null && rate > 0 && (
          <span className="font-mono text-[0.72rem] text-lime tabular-nums">
            blended rate ${rate.toFixed(3)}/kWh
          </span>
        )}
        {bill && (
          <button
            onClick={() => updateBuilding(building.id, { bill: undefined })}
            className="font-mono text-[0.7rem] text-dim underline-offset-4 hover:text-ember hover:underline"
          >
            clear bill
          </button>
        )}
      </div>

      <p className="mt-2 text-[0.76rem] leading-relaxed text-dim">
        Use the totals printed on the bill, including delivery and taxes - the blended figure is
        what a savings estimate actually needs. Stored in this browser with the rest of the
        building record and never sent anywhere.
      </p>
    </div>
  );
}
