"use client";

// Team scan: one big place, many people, one total.
//
// A school, an office floor or an apartment block is too big for one person
// to walk. Whoever starts a team gets a short code and a link; everyone who
// opens it scans the rooms they're in on their own phone and taps "Send to
// team", and this page adds it all up, live. No accounts, and no photos ever
// leave anyone's phone: what travels is the list of devices each scan found.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { CODE_LENGTH, isValidCode, normalizeCode, type MergedRow, type AreaSummary, type ClassTotals } from "@/lib/classroom";
import { useStore } from "@/lib/useStore";
import { US_AVERAGE } from "@/lib/grid";
import { fmtMoneyFull } from "@/lib/energy";
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
/** Shared with TeamSend on the scanner, so a joined team is remembered there too. */
export const TEAM_CODE_KEY = "ghostwatt.class.code";
export const TEAM_NAME_KEY = "ghostwatt.class.name";

export function TeamScan() {
  const store = useStore();
  // Read-only: starting a team names it after the place you're working on, and creates nothing locally.
  const building = store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0] ?? null;
  const placeName = building?.name ?? "our building";
  const regionCode = building?.regionCode ?? US_AVERAGE.code;

  const [code, setCode] = useState("");
  const [entry, setEntry] = useState("");
  const [teamName, setTeamName] = useState("");
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState<{ durable: boolean; local: boolean } | null>(null);

  // A link with ?code= joins straight away; otherwise the last team is remembered.
  useEffect(() => {
    const t = setTimeout(() => {
      const fromLink = normalizeCode(new URLSearchParams(window.location.search).get("code") ?? "");
      if (isValidCode(fromLink)) {
        remember(fromLink);
        setCode(fromLink);
        return;
      }
      try {
        const saved = localStorage.getItem(TEAM_CODE_KEY);
        if (saved && isValidCode(saved)) setCode(saved);
      } catch {
        // Private mode: it just won't remember.
      }
    }, 0);
    fetch("/api/class", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { durable: boolean }) => setTier({ durable: j.durable, local: ["localhost", "127.0.0.1"].includes(window.location.hostname) }))
      .catch(() => setTier(null));
    return () => clearTimeout(t);
  }, []);

  const load = useCallback(async (c: string) => {
    try {
      const res = await fetch(`/api/class/${c}`, { cache: "no-store" });
      const json = (await res.json()) as MapResponse;
      if (!res.ok) {
        setError(json.error ?? "That team couldn't be found. Codes expire after two weeks.");
        setData(null);
        return;
      }
      setData(json);
      setError(null);
    } catch {
      setError("Couldn't reach the team. Check your connection.");
    }
  }, []);

  useEffect(() => {
    if (!code) return;
    const first = setTimeout(() => load(code), 0);
    const t = setInterval(() => load(code), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [code, load]);

  const open = (c: string) => {
    remember(c);
    setCode(c);
  };

  const leave = () => {
    setCode("");
    setData(null);
    setError(null);
    try {
      localStorage.removeItem(TEAM_CODE_KEY);
    } catch {
      // ignore
    }
    window.history.replaceState(null, "", "/team");
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildingName: teamName.trim() || placeName, regionCode }),
      });
      const json = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !json.code) {
        setError(json.error ?? "Couldn't start a team.");
        return;
      }
      open(json.code);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const join = () => {
    const c = normalizeCode(entry);
    if (!isValidCode(c)) {
      setError(`A team code is ${CODE_LENGTH} letters and numbers, like ABC234.`);
      return;
    }
    setError(null);
    open(c);
  };

  if (!code) {
    return (
      <Start
        placeName={placeName}
        teamName={teamName}
        setTeamName={setTeamName}
        entry={entry}
        setEntry={setEntry}
        onCreate={create}
        onJoin={join}
        busy={busy}
        error={error}
        durable={tier?.durable ?? false}
        usable={tier === null ? true : tier.durable || tier.local}
      />
    );
  }

  return <Board code={code} data={data} error={error} onLeave={leave} />;
}

function remember(c: string) {
  try {
    localStorage.setItem(TEAM_CODE_KEY, c);
  } catch {
    // ignore
  }
}

// ---- starting or joining ---------------------------------------------------------

function Start({
  placeName,
  teamName,
  setTeamName,
  entry,
  setEntry,
  onCreate,
  onJoin,
  busy,
  error,
  durable,
  usable,
}: {
  placeName: string;
  teamName: string;
  setTeamName: (v: string) => void;
  entry: string;
  setEntry: (v: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  busy: boolean;
  error: string | null;
  durable: boolean;
  /** False on a deployment with no shared store: a team would be lost between requests. */
  usable: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* how it works */}
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ["Start a team", "You get a link and a short code. Send it to whoever's helping: family, coworkers, a class."],
          ["Everyone scans", "Each person scans the rooms they're in on their own phone, then taps Send to team."],
          ["Watch it add up", "This page shows the whole place's total and the worst devices, updating as scans arrive."],
        ].map(([title, body], i) => (
          <li key={title} className="panel p-5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-fog font-mono text-[0.85rem] font-semibold text-ink">{i + 1}</span>
            <h3 className="mt-3 text-[1rem] font-semibold text-fog">{title}</h3>
            <p className="mt-1 text-[0.86rem] leading-relaxed text-mist">{body}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel p-5 sm:p-6">
          <h2 className="text-[1.2rem] font-semibold text-fog">Start a team</h2>
          <p className="mt-1 text-[0.88rem] leading-relaxed text-mist">Name it after the place you&apos;re all scanning.</p>
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder={placeName}
            maxLength={60}
            aria-label="Team name"
            className="mt-4 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-fog outline-none placeholder:text-dim/70 focus:border-cyan"
          />
          <button
            onClick={onCreate}
            disabled={busy || !usable}
            className="mt-3 w-full rounded-full bg-fog px-4 py-3 text-[0.92rem] font-medium text-ink transition-colors hover:bg-fog/85 disabled:opacity-50"
          >
            {busy ? "Starting…" : usable ? "Start a team" : "Not available on this site yet"}
          </button>
        </section>

        <section className="panel p-5 sm:p-6">
          <h2 className="text-[1.2rem] font-semibold text-fog">Join a team</h2>
          <p className="mt-1 text-[0.88rem] leading-relaxed text-mist">Someone sent you a code? Type it here. A link opens the team by itself.</p>
          <div className="mt-4 flex gap-2">
            <input
              value={entry}
              onChange={(e) => setEntry(normalizeCode(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && onJoin()}
              placeholder="ABC234"
              maxLength={CODE_LENGTH}
              aria-label="Team code"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-center font-mono text-lg uppercase tracking-[0.35em] text-fog outline-none focus:border-cyan"
            />
            <button onClick={onJoin} className="shrink-0 rounded-full bg-fog px-5 py-2.5 text-[0.92rem] font-medium text-ink hover:bg-fog/85">
              Join
            </button>
          </div>
        </section>
      </div>

      {error && <p className="rounded-xl bg-ember/[0.07] px-4 py-3 text-[0.86rem] text-ember">{error}</p>}

      {!durable && (
        <section className="rounded-2xl border border-amber/30 bg-amber/[0.05] px-5 py-4 text-[0.84rem] leading-relaxed text-mist">
          <span className="font-medium text-fog">{usable ? "Works on this computer only for now." : "Teams are switched off on this site."}</span>{" "}
          {usable
            ? "Teams are kept in the server's memory, which is fine for trying it out but won't hold up on a hosted site."
            : "A team started here would be lost almost immediately."}{" "}
          The site owner can turn teams on by adding a free Upstash Redis database (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN).
        </section>
      )}

      <p className="text-[0.84rem] leading-relaxed text-dim">
        <span className="font-medium text-mist">Your photos never leave your phone.</span> A team only receives the list each scan produced: which devices,
        how many, and what they cost. Teams delete themselves after two weeks.
      </p>
    </div>
  );
}

// ---- the team's board ---------------------------------------------------------------

function Board({ code, data, error, onLeave }: { code: string; data: MapResponse | null; error: string | null; onLeave: () => void }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const prevAreas = useRef(0);
  const [flash, setFlash] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/team?code=${code}` : `/team?code=${code}`;

  // A pulse when a new scan lands, so people watching notice.
  useEffect(() => {
    const n = data?.areas.length ?? 0;
    const grew = n > prevAreas.current && prevAreas.current > 0;
    prevAreas.current = n;
    if (!grew) return;
    const on = setTimeout(() => setFlash(true), 0);
    const off = setTimeout(() => setFlash(false), 1200);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [data?.areas.length]);

  const copy = async (what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard blocked; both are on screen.
    }
  };

  const max = Math.max(1, ...(data?.areas ?? []).map((a) => a.costPerYear));

  return (
    <div className="space-y-5">
      {/* invite */}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <div className="text-[0.8rem] text-dim">{data?.buildingName ?? "Loading…"} · team code</div>
            <div className="mt-1 font-mono text-4xl font-bold tracking-[0.12em] text-fog sm:text-5xl">{code}</div>
            <p className="mt-2 text-[0.86rem] text-mist">
              Send people the link. They scan on the{" "}
              <Link href="/scan" className="font-medium text-cyan hover:underline">
                Scanner
              </Link>{" "}
              and tap <span className="font-medium text-fog">Send to team</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => copy("link")} className="rounded-full bg-fog px-4 py-2 text-[0.85rem] font-medium text-ink hover:bg-fog/85">
              {copied === "link" ? "Link copied" : "Copy invite link"}
            </button>
            <button onClick={() => copy("code")} className="rounded-full border border-line px-4 py-2 text-[0.85rem] text-fog hover:border-fog/40">
              {copied === "code" ? "Copied" : "Copy code"}
            </button>
            <button onClick={onLeave} className="rounded-full px-3 py-2 text-[0.85rem] text-dim hover:text-ember">
              Leave team
            </button>
          </div>
        </div>
      </section>

      {error && <p className="rounded-xl bg-ember/[0.07] px-4 py-3 text-[0.86rem] text-ember">{error}</p>}

      {data && data.areas.length === 0 && (
        <section className="panel p-8 text-center">
          <h3 className="text-lg font-semibold text-fog">Waiting for the first scan</h3>
          <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-relaxed text-mist">
            Once someone scans a room and taps <span className="font-medium text-fog">Send to team</span>, it shows up here within a few seconds. You can
            scan too: open the{" "}
            <Link href="/scan" className="font-medium text-cyan hover:underline">
              Scanner
            </Link>
            .
          </p>
        </section>
      )}

      {data && data.areas.length > 0 && (
        <>
          <motion.section animate={flash ? { borderColor: "var(--color-lime)" } : {}} transition={{ duration: 0.4 }} className="panel overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
              <Stat label="Wasted a year, found so far" value={fmtMoneyFull(data.totals.costPerYear)} tint="var(--color-ember)" />
              <Stat label="Could be saved a year" value={fmtMoneyFull(data.totals.recoverable)} tint="var(--color-lime)" />
              <Stat label="Rooms scanned" value={String(data.totals.areaCount)} />
              <Stat label="People helping" value={String(data.totals.contributorCount)} />
            </div>
          </motion.section>

          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <section className="panel overflow-hidden">
              <header className="border-b border-line px-5 py-4">
                <h3 className="text-[1.05rem] font-semibold text-fog">Worst devices, whole place</h3>
                <p className="mt-0.5 text-[0.8rem] text-dim">Everyone&apos;s scans added together, most wasteful first.</p>
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
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface2 text-mist">
                        <DeviceGlyph icon={r.icon} className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.92rem] font-medium text-fog">
                          {r.label} <span className="font-normal text-dim">×{r.count}</span>
                        </div>
                        <div className="truncate text-[0.74rem] text-dim">
                          in {r.areas.slice(0, 3).join(", ")}
                          {r.areas.length > 3 ? ` and ${r.areas.length - 3} more` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-mono text-[0.92rem] font-semibold text-ember">{fmtMoneyFull(r.costPerYear)}/yr</div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>

            <section className="panel overflow-hidden">
              <header className="border-b border-line px-5 py-4">
                <h3 className="text-[1.05rem] font-semibold text-fog">Rooms, worst first</h3>
                <p className="mt-0.5 text-[0.8rem] text-dim">And who scanned them.</p>
              </header>
              <ul className="divide-y divide-line">
                <AnimatePresence initial={false}>
                  {data.areas.map((a) => (
                    <motion.li key={`${a.area}|${a.contributor}`} layout initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="px-5 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[0.9rem] text-fog">{a.area}</span>
                        <span className="shrink-0 font-mono text-[0.84rem] text-fog">{fmtMoneyFull(a.costPerYear)}/yr</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2">
                        <div className="h-full rounded-full bg-ember" style={{ width: `${(a.costPerYear / max) * 100}%` }} />
                      </div>
                      <div className="mt-1 text-[0.72rem] text-dim">
                        {a.contributor || "Someone"} · {a.deviceCount} device{a.deviceCount === 1 ? "" : "s"}
                      </div>
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
          <div className="h-4 w-40 animate-pulse rounded bg-surface2" />
          <div className="mt-4 h-24 w-full animate-pulse rounded bg-surface2/60" />
        </section>
      )}

      <p className="text-[0.78rem] leading-relaxed text-dim">
        Updates every {POLL_MS / 1000} seconds. No photos, accounts or email addresses, just the device lists. The team deletes itself after two weeks.
        {data && !data.durable ? " On this site the team lives in the server's memory, so a restart clears it." : ""}
      </p>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="bg-surface px-5 py-4">
      <div className="text-[0.78rem] leading-snug text-dim">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-fog" style={tint ? { color: tint } : undefined}>
        {value}
      </div>
    </div>
  );
}
