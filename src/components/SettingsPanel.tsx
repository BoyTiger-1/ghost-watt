"use client";

// What is switched on, and what would switch on if you added a key.
//
// Ghost Watt is built so that every external service is an upgrade, never a
// dependency: with no keys at all it runs on stored EIA and eGRID tables and
// gives an answer it can defend. This page is the honest accounting of that -
// which providers are live, what each missing one would buy, and where to get it.
// Nothing here ever displays a key value; the server only reports booleans.

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "./PageHeader";
import { motion } from "framer-motion";
import { ScheduleEditor } from "./PlaceEditor";
import { REGIONS } from "@/lib/grid";
import { BUILDING_TYPES } from "@/lib/benchmark";
import { useStore, updateBuilding, setActiveBuilding, replaceStore } from "@/lib/useStore";
import { exportStore, importStore, downloadText } from "@/lib/export";
import { EMPTY_STORE, type Building } from "@/lib/storage";
import { BillScan } from "./BillScan";
import { AccessibilityPanel } from "./AccessibilityPanel";

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
    <section className="relative z-10 mx-auto max-w-4xl px-5 pb-20 pt-24 sm:px-6 sm:pt-32">
      <PageHeader eyebrow="Settings" title="What is" accent="switched on." className="mb-10">
        {/* Said from what this deployment actually has, not assumed. */}
        {engine === null && keys === null ? (
          "Checking which keys this site has…"
        ) : hostedActive ? (
          <>
            Scans are read by {hostedActive.label} ({hostedActive.model}) using this site&apos;s API key, so visitors
            don&apos;t need one of their own.{" "}
            <span className="hidden sm:inline">
              If the cloud is unreachable, the on-device detector takes over.{" "}
              {configured > 0 && `${configured} data ${configured === 1 ? "provider is" : "providers are"} live as well.`}
            </span>
          </>
        ) : (
          <>
            No vision API key is set on this site yet, so scans run on the device.{" "}
            <span className="hidden sm:inline">
              A vision key turns on Enhanced (cloud) reading, which recognises far more devices. The data providers below
              upgrade stored government tables to live figures.
            </span>
          </>
        )}
      </PageHeader>

      {/* ---- display & accessibility ---- */}
      <div className="mb-6">
        <AccessibilityPanel />
      </div>

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
            title="On-device detector"
            detail="Always available, in the browser. Reads screens, laptops, common appliances and lit fixtures without uploading anything; it misses other device types."
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
            <span className="mono-label">hosted options - set one or more; each is a fallback</span>
            <span className="text-[0.72rem] text-dim">
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
                    className="text-[0.66rem] text-cyan underline-offset-4 hover:underline"
                  >
                    get a key &rarr;
                  </a>
                )}
                <span
                  className={`ml-auto text-[0.72rem] ${
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
                  className={`ml-auto text-[0.72rem] ${
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
                  className="mt-2 inline-block text-[0.7rem] text-cyan underline-offset-4 hover:underline"
                >
                  Free key →
                </a>
              )}
            </motion.li>
          ))}
        </ul>

        <div className="mt-5 border-t border-line pt-4">
          <span className="mono-label">to switch one on</span>
          <pre className="mt-2 overflow-x-auto border border-line bg-ink px-3 py-2 font-mono text-[0.72rem] leading-relaxed text-mist">
            <code>{`# .env.local (or Vercel → Settings → Environment Variables)\nEIA_API_KEY=…            # prices + live grid mix (free)\nOPENWEATHER_API_KEY=…    # degree days (free)\nNREL_API_KEY=…           # utility rates, free at api.data.gov\n\n# vision: one is enough, each extra one is a fallback (all have free tiers):\nGEMINI_API_KEY=…         # aistudio.google.com - best free option\nGROQ_API_KEY=…           # fastest\nMISTRAL_API_KEY=…\nOPENROUTER_API_KEY=…     # ':free' models as a last resort\nANTHROPIC_API_KEY=…      # best recognition, paid\n\n# only if a whole class will scan at once (free tier):\nUPSTASH_REDIS_REST_URL=…\nUPSTASH_REDIS_REST_TOKEN=…`}</code>
          </pre>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-dim">
            None is required. Without a vision key the scanner runs on the device; with one it
            reads far more, and with two or more a rate limit or a retired model on one falls
            through to the next. Without the data keys Ghost Watt uses EIA state averages and eGRID
            carbon intensity from stored tables, and says so in the methodology.
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
              className="mt-4 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
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
              <span className="mono-label">Name</span>
              <input
                value={building.name}
                onChange={(e) => updateBuilding(building.id, { name: e.target.value })}
                className="mt-1.5 w-full border border-line bg-surface px-3 py-2 text-sm text-fog outline-none focus:border-cyan rounded-xl"
              />
            </label>
            <label className="block">
              <span className="mono-label">Floor area (sq ft)</span>
              <input
                type="number"
                min={0}
                step={500}
                value={building.floorAreaSqFt || ""}
                onChange={(e) =>
                  updateBuilding(building.id, { floorAreaSqFt: parseFloat(e.target.value) || 0 })
                }
                className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
              />
            </label>
            <label className="block">
              <span className="mono-label">State / region</span>
              <select
                value={building.regionCode}
                onChange={(e) => updateBuilding(building.id, { regionCode: e.target.value })}
                className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
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
              <span className="mono-label">Building type</span>
              <select
                value={building.typeId}
                onChange={(e) => updateBuilding(building.id, { typeId: e.target.value })}
                className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
              >
                {BUILDING_TYPES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-surface">
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/*
            Two dropdowns that buy more accuracy than anything else on this page.
            Every watt a device draws leaves it as heat, so in a cooled building its
            real cost is its electricity plus the cooling that removes the heat, and
            in an electrically heated one part of that comes back in winter. Nothing
            is applied until both are answered: a correction nobody can check is
            worse than no correction.
          */}
          <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <label className="block">
              <span className="mono-label">Heated by</span>
              <select
                value={building.heating ?? ""}
                onChange={(e) =>
                  updateBuilding(building.id, {
                    heating: (e.target.value || undefined) as Building["heating"],
                  })
                }
                className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
              >
                <option value="" className="bg-surface">Not sure</option>
                <option value="gas" className="bg-surface">Gas or oil</option>
                <option value="heat-pump" className="bg-surface">Heat pump</option>
                <option value="electric-resistance" className="bg-surface">Electric baseboard or furnace</option>
                <option value="none" className="bg-surface">Not heated</option>
              </select>
            </label>
            <label className="block">
              <span className="mono-label">Cooled by</span>
              <select
                value={building.cooling ?? ""}
                onChange={(e) =>
                  updateBuilding(building.id, {
                    cooling: (e.target.value || undefined) as Building["cooling"],
                  })
                }
                className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
              >
                <option value="" className="bg-surface">Not sure</option>
                <option value="electric" className="bg-surface">Air conditioning</option>
                <option value="none" className="bg-surface">No cooling</option>
              </select>
            </label>
            <p className="text-[0.78rem] leading-relaxed text-dim sm:col-span-2">
              {building.heating && building.cooling ? (
                <>
                  Costs now include what the building spends reacting to each
                  device&apos;s heat — about a third of a watt of cooling per watt in
                  summer, and a credit against electric heat in winter.{" "}
                  <Link href="/methodology#hvac" className="text-cyan underline-offset-4 hover:underline">
                    How that is worked out
                  </Link>
                  .
                </>
              ) : (
                <>
                  Answer both and every cost gains a term most estimates leave out: a
                  device&apos;s heat is a load on the building too. Left unanswered, no
                  heating or cooling correction is applied at all.
                </>
              )}
            </p>
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
            className="border border-line px-3 py-1.5 text-[0.8rem] text-mist transition-colors hover:border-fog/40 hover:text-fog rounded-full"
          >
            Export backup
          </button>
          <label className="cursor-pointer border border-line px-3 py-1.5 text-[0.8rem] text-mist transition-colors hover:border-fog/40 hover:text-fog rounded-full">
            Import backup
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
            className="border border-line px-3 py-1.5 text-[0.72rem] text-dim transition-colors hover:border-ember hover:text-ember"
          >
            Erase everything
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
  return "No cloud vision model is configured. Scans are read by the detector in the browser, which finds fewer kinds of device.";
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
            <span className="text-[0.72rem] text-cyan">
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
        <span className="text-[0.72rem] text-dim">
          weather + utility rate
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          onClick={locate}
          disabled={busy}
          className="border border-line px-3 py-1.5 text-[0.8rem] text-mist transition-colors hover:border-fog/40 hover:text-fog disabled:opacity-50 rounded-full"
        >
          {busy ? "Locating…" : has ? "Update from this device" : "Use this device’s location"}
        </button>
        {has && (
          <>
            <code className="font-mono text-[0.7rem] text-cyan tabular-nums">
              {building.lat!.toFixed(4)}, {building.lon!.toFixed(4)}
            </code>
            <button
              onClick={() => updateBuilding(building.id, { lat: undefined, lon: undefined })}
              className="text-[0.7rem] text-dim underline-offset-4 hover:text-ember hover:underline"
            >
              Clear
            </button>
          </>
        )}
      </div>

      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mono-label">Latitude</span>
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
            className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
          />
        </label>
        <label className="block">
          <span className="mono-label">Longitude</span>
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
            className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
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
        <span className="text-[0.72rem] text-dim">
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
            className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
          />
        </label>
        <label className="block">
          <span className="mono-label">Total charged ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={bill?.dollars ?? ""}
            placeholder="9880"
            onChange={(e) => set({ dollars: Number(e.target.value) })}
            className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
          />
        </label>
        <label className="block">
          <span className="mono-label">Days in period</span>
          <input
            type="number"
            min="1"
            max="400"
            value={bill?.days ?? ""}
            placeholder="30"
            onChange={(e) => set({ days: Number(e.target.value) })}
            className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
          />
        </label>
        <label className="block">
          <span className="mono-label">Period ended</span>
          <input
            type="date"
            value={bill?.periodEnd ?? ""}
            onChange={(e) => set({ periodEnd: e.target.value })}
            className="mt-1.5 w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan rounded-xl"
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
            className="text-[0.7rem] text-dim underline-offset-4 hover:text-ember hover:underline"
          >
            clear bill
          </button>
        )}
      </div>

      <p className="mt-2 text-[0.76rem] leading-relaxed text-dim">
        Use the totals printed on the bill, including delivery and taxes - the blended figure is
        what a savings estimate actually needs. The figures are stored in this browser with the
        rest of the building record and never sent anywhere.
      </p>

      <div className="mt-3">
        <BillScan onAccept={(b) => updateBuilding(building.id, { bill: b })} />
      </div>
    </div>
  );
}
