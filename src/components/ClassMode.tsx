"use client";

// One building, many phones.
//
// The landing page has always said "crowdsource a photo-audit". Until now that was
// aspirational: everything lived in one browser's localStorage, so a whole-school
// audit meant one person walking every corridor. This is the page that makes the
// sentence true.
//
// Two roles, one screen. Whoever starts the session gets a code and a live map that
// fills in as scans arrive. Everyone else types the code, scans their own corridor
// on their own phone, and sends the result. No accounts, no logins, no email
// addresses - and critically, no photographs: what travels is the computed device
// rows, which is the part anyone actually needs and the part that carries nothing
// sensitive about the inside of a school.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { CODE_LENGTH, isValidCode, normalizeCode, type MergedRow, type AreaSummary, type ClassTotals } from "@/lib/classroom";
import { useStore, ensureBuilding } from "@/lib/useStore";
import { DeviceGlyph } from "./DeviceGlyph";

interface MapResponse {
  code: string;
  buildingName: string;
  regionCode: string;
  createdAt: string;
  durable: boolean;
  rows: MergedRow[];
  totals: ClassTotals;
  areas: AreaSummary[];
  error?: string;
}

const POLL_MS = 6000;
const CODE_KEY = "ghostwatt.class.code";

export function ClassMode() {
  const store = useStore();
  const building = ensureBuilding(store);

  const [code, setCode] = useState<string>("");
  const [entry, setEntry] = useState("");
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState<{ durable: boolean } | null>(null);

  // Remember the session across reloads - a student who backgrounds the tab
  // mid-audit should not have to find the code again.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CODE_KEY);
      if (saved && isValidCode(saved)) setCode(saved);
    } catch {
      /* private mode; the feature still works, it just forgets */
    }
    fetch("/api/class", { cache: "no-store" })
      .then((r) => r.json())
      .then(setTier)
      .catch(() => setTier(null));
  }, []);

  const load = useCallback(async (c: string) => {
    try {
      const res = await fetch(`/api/class/${c}`, { cache: "no-store" });
      const json = (await res.json()) as MapResponse;
      if (!res.ok) {
        setError(json.error ?? "Could not load that session.");
        setData(null);
        return;
      }
      setData(json);
      setError(null);
    } catch {
      setError("Could not reach the session.");
    }
  }, []);

  // Poll while a session is open. Six seconds is frequent enough that a scan
  // arriving feels immediate to a room watching a projector, and slow enough
  // that thirty phones do not hammer the store.
  useEffect(() => {
    if (!code) return;
    load(code);
    const t = setInterval(() => load(code), POLL_MS);
    return () => clearInterval(t);
  }, [code, load]);

  const open = (c: string) => {
    setCode(c);
    try {
      localStorage.setItem(CODE_KEY, c);
    } catch {
      /* ignore */
    }
  };

  const leave = () => {
    setCode("");
    setData(null);
    setError(null);
    try {
      localStorage.removeItem(CODE_KEY);
    } catch {
      /* ignore */
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingName: building.name,
          regionCode: building.regionCode,
        }),
      });
      const json = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !json.code) {
        setError(json.error ?? "Could not open a session.");
        return;
      }
      open(json.code);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const join = () => {
    const c = normalizeCode(entry);
    if (!isValidCode(c)) {
      setError(`A code is ${CODE_LENGTH} letters and numbers.`);
      return;
    }
    setError(null);
    open(c);
  };

  if (!code) {
    return (
      <StartScreen
        buildingName={building.name}
        entry={entry}
        setEntry={setEntry}
        onCreate={create}
        onJoin={join}
        busy={busy}
        error={error}
        durable={tier?.durable ?? false}
      />
    );
  }

  return (
    <LiveMap
      code={code}
      data={data}
      error={error}
      onLeave={leave}
      onRefresh={() => load(code)}
    />
  );
}

// ---- start ---------------------------------------------------------------

function StartScreen({
  buildingName,
  entry,
  setEntry,
  onCreate,
  onJoin,
  busy,
  error,
  durable,
}: {
  buildingName: string;
  entry: string;
  setEntry: (v: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  busy: boolean;
  error: string | null;
  durable: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 @3xl:grid-cols-2">
        {/* host */}
        <section className="panel ticked p-5 sm:p-6">
          <div className="mono-label text-lime">start a session</div>
          <h2 className="mt-2 text-xl font-bold text-fog">Map {buildingName} together</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            You get a six-character code. Everyone in the room types it in, scans one corridor
            each on their own phone, and the results merge into one ranked map here — live, as
            they arrive.
          </p>
          <button
            onClick={onCreate}
            disabled={busy}
            className="mt-4 w-full border border-lime bg-lime/10 px-4 py-2.5 font-mono text-sm tracking-wider text-lime transition-colors hover:bg-lime/20 disabled:opacity-50"
          >
            {busy ? "opening…" : "open a session"}
          </button>
        </section>

        {/* join */}
        <section className="panel p-5 sm:p-6">
          <div className="mono-label text-cyan">join one</div>
          <h2 className="mt-2 text-xl font-bold text-fog">Somebody gave you a code</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            Type it below. Then scan your area as usual and press <em>send to session</em> on the
            results — your rows join everyone else&rsquo;s.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={entry}
              onChange={(e) => setEntry(normalizeCode(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && onJoin()}
              placeholder="ABC234"
              maxLength={CODE_LENGTH}
              aria-label="Session code"
              className="min-w-0 flex-1 border border-line bg-surface2 px-3 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-fog uppercase outline-none focus:border-cyan"
            />
            <button
              onClick={onJoin}
              className="shrink-0 border border-cyan bg-cyan/10 px-4 py-2.5 font-mono text-sm tracking-wider text-cyan transition-colors hover:bg-cyan/20"
            >
              join
            </button>
          </div>
        </section>
      </div>

      {error && (
        <p className="border-l-2 border-ember bg-surface2/50 px-4 py-3 font-mono text-[0.78rem] text-ember">
          {error}
        </p>
      )}

      {!durable && (
        <section className="panel border-l-2 border-amber px-5 py-4 sm:px-6">
          <div className="mono-label text-amber">single-machine mode</div>
          <p className="mt-1.5 text-[0.84rem] leading-relaxed text-mist">
            No shared store is configured, so sessions are held in this server&rsquo;s memory. That
            is fine on a laptop and for a demo — everything works — but on a deployment that runs
            more than one instance, two phones can land on two instances and never see each other.
            Setting <code className="text-fog">UPSTASH_REDIS_REST_URL</code> and{" "}
            <code className="text-fog">UPSTASH_REDIS_REST_TOKEN</code> fixes it; the free tier is
            more than enough for a school.
          </p>
        </section>
      )}

      <section className="panel px-5 py-4 sm:px-6">
        <div className="mono-label">what actually gets sent</div>
        <p className="mt-1.5 text-[0.84rem] leading-relaxed text-mist">
          The device rows a scan produces — category, count, watts, dollars — and the area name
          typed in. <span className="text-fog">Photographs never leave the phone.</span>{" "}
          Reading the
          image happens on the contributor&rsquo;s own device, so what travels is the conclusion,
          not the picture. For an app that photographs the inside of K-12 buildings, that is not a
          detail.
        </p>
      </section>
    </div>
  );
}

// ---- live map ------------------------------------------------------------

function LiveMap({
  code,
  data,
  error,
  onLeave,
  onRefresh,
}: {
  code: string;
  data: MapResponse | null;
  error: string | null;
  onLeave: () => void;
  onRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const prevAreas = useRef(0);
  const [flash, setFlash] = useState(false);

  // A quiet pulse when a new scan lands, so a room watching a projector notices.
  useEffect(() => {
    const n = data?.areas.length ?? 0;
    if (n > prevAreas.current && prevAreas.current > 0) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1200);
      return () => clearTimeout(t);
    }
    prevAreas.current = n;
  }, [data?.areas.length]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; the code is on screen in 3rem type anyway */
    }
  };

  return (
    <div className="space-y-5">
      {/* the code, big enough to read from the back of a classroom */}
      <section className="panel ticked overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <div className="mono-label text-lime">session code</div>
            <div className="mt-1 font-mono text-4xl font-bold tracking-[0.28em] text-fog sm:text-5xl">
              {code}
            </div>
            <p className="mt-1.5 text-sm text-mist">
              {data?.buildingName ?? "Loading…"} · everyone types this on{" "}
              <span className="text-fog">/class</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={copy}
              className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-cyan hover:text-cyan"
            >
              {copied ? "copied" : "copy code"}
            </button>
            <button
              onClick={onRefresh}
              className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-mist transition-colors hover:border-lime hover:text-lime"
            >
              refresh
            </button>
            <button
              onClick={onLeave}
              className="border border-line px-3 py-1.5 font-mono text-[0.72rem] tracking-wider text-dim transition-colors hover:border-ember hover:text-ember"
            >
              leave
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p className="border-l-2 border-ember bg-surface2/50 px-4 py-3 font-mono text-[0.78rem] text-ember">
          {error}
        </p>
      )}

      {data && data.areas.length === 0 && (
        <section className="panel p-6 text-center">
          <h3 className="text-lg font-semibold text-fog">Waiting for the first scan</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mist">
            Send everyone to <span className="text-fog">/class</span>, have them enter{" "}
            <span className="font-mono text-lime">{code}</span>, then run a scan on{" "}
            <Link href="/scan" className="text-cyan underline-offset-4 hover:underline">
              the scanner
            </Link>{" "}
            and press <em>send to session</em>.
          </p>
        </section>
      )}

      {data && data.areas.length > 0 && (
        <>
          <motion.section
            animate={flash ? { borderColor: "var(--color-lime)" } : {}}
            transition={{ duration: 0.4 }}
            className="panel ticked overflow-hidden"
          >
            <div className="grid gap-px bg-line @lg:grid-cols-4">
              <Stat
                label="found so far"
                value={`$${Math.round(data.totals.costPerYear).toLocaleString()}`}
                sub="per year"
                tint="var(--color-lime)"
              />
              <Stat
                label="recoverable"
                value={`$${Math.round(data.totals.recoverable).toLocaleString()}`}
                sub="per year"
                tint="var(--color-cyan)"
              />
              <Stat
                label="areas covered"
                value={`${data.totals.areaCount}`}
                sub={`${data.totals.contributorCount} ${
                  data.totals.contributorCount === 1 ? "person" : "people"
                }`}
              />
              <Stat
                label="read by a model"
                value={`${Math.round(data.totals.liveShare * 100)}%`}
                sub="rest estimated"
                tint={data.totals.liveShare > 0.5 ? "var(--color-lime)" : "var(--color-amber)"}
              />
            </div>
          </motion.section>

          <div className="grid gap-5 @3xl:grid-cols-[1.4fr_1fr]">
            {/* merged ranking */}
            <section className="panel overflow-hidden">
              <header className="border-b border-line px-5 py-4 sm:px-6">
                <h3 className="text-lg font-semibold text-fog">The whole building, ranked</h3>
                <p className="mt-0.5 text-sm text-mist">
                  Every area&rsquo;s findings merged and sorted by what they cost
                </p>
              </header>
              <ul className="divide-y divide-line">
                <AnimatePresence initial={false}>
                  {data.rows.map((r, i) => (
                    <motion.li
                      key={r.categoryId}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      className="flex items-center gap-3 px-5 py-3 sm:px-6"
                    >
                      <DeviceGlyph icon={r.icon} className="size-5 shrink-0 text-dim" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-fog">
                          {r.label}{" "}
                          <span className="font-mono text-[0.7rem] text-dim">×{r.count}</span>
                        </div>
                        <div className="truncate font-mono text-[0.68rem] text-dim">
                          {r.areas.length} {r.areas.length === 1 ? "area" : "areas"} ·{" "}
                          {r.areas.slice(0, 3).join(", ")}
                          {r.areas.length > 3 ? "…" : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-sm font-bold text-fog tabular-nums">
                          ${Math.round(r.costPerYear).toLocaleString()}
                        </div>
                        <div className="font-mono text-[0.62rem] text-dim">per year</div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>

            {/* coverage */}
            <section className="panel overflow-hidden">
              <header className="border-b border-line px-5 py-4 sm:px-6">
                <h3 className="text-lg font-semibold text-fog">Who covered what</h3>
                <p className="mt-0.5 text-sm text-mist">Most expensive area first</p>
              </header>
              <ul className="divide-y divide-line">
                <AnimatePresence initial={false}>
                  {data.areas.map((a) => (
                    <motion.li
                      key={`${a.area}|${a.contributor}`}
                      layout
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-baseline justify-between gap-3 px-5 py-3 sm:px-6"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-fog">{a.area}</div>
                        <div className="truncate font-mono text-[0.66rem] text-dim">
                          {a.contributor} · {a.deviceCount} devices ·{" "}
                          <span className={a.mode === "fallback" ? "text-amber" : "text-lime"}>
                            {a.mode === "fallback" ? "estimated" : "live"}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[0.78rem] text-mist tabular-nums">
                        ${Math.round(a.costPerYear).toLocaleString()}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          </div>
        </>
      )}

      {!data && !error && (
        <section className="panel p-6">
          <div className="h-4 w-40 animate-pulse bg-surface2" />
          <div className="mt-4 h-24 w-full animate-pulse bg-surface2/60" />
        </section>
      )}

      <p className="font-mono text-[0.7rem] leading-relaxed text-dim">
        Updates every {POLL_MS / 1000} seconds. Sessions expire on their own and hold no accounts,
        no email addresses and no photographs — only the device rows each scan produced.
        {data && !data.durable
          ? " This deployment is holding the session in server memory, which does not survive a restart."
          : ""}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tint,
}: {
  label: string;
  value: string;
  sub: string;
  tint?: string;
}) {
  return (
    <div className="bg-ink px-4 py-3">
      <div className="mono-label min-h-[2.1em] leading-snug text-balance">{label}</div>
      <div
        className="mt-0.5 font-mono text-2xl font-bold text-fog tabular-nums"
        style={tint ? { color: tint } : undefined}
      >
        {value}
      </div>
      <div className="font-mono text-[0.62rem] text-dim">{sub}</div>
    </div>
  );
}
