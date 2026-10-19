"use client";

// The bridge between one phone and the whole building.
//
// A scan on its own is one corridor. This is the control that pushes it into a
// shared session so thirty corridors become a map. It sends the computed rows and
// nothing else - no image ever crosses the wire, which is the whole reason a
// feature that photographs the inside of a school can be shared at all.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { CODE_LENGTH, isValidCode, normalizeCode, type Contribution } from "@/lib/classroom";
import type { Offender } from "@/lib/types";

const CODE_KEY = "ghostwatt.class.code";
const NAME_KEY = "ghostwatt.class.name";

type Phase = "idle" | "sending" | "sent" | "error";

export function ContributeBar({
  offenders,
  mode,
  defaultArea,
}: {
  offenders: Offender[];
  mode: Contribution["mode"];
  defaultArea: string;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [area, setArea] = useState(defaultArea);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // Pre-fill from whatever the /class page already knows, so a student who joined
  // a session five minutes ago does not retype the code they were given.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const c = localStorage.getItem(CODE_KEY);
        if (c && isValidCode(c)) {
          setCode(c);
          setOpen(true);
        }
        const n = localStorage.getItem(NAME_KEY);
        if (n) setName(n);
      } catch {
        /* private mode; typing it once is not a hardship */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // The area name follows the first capture's name until the user edits it.
  const [areaTouched, setAreaTouched] = useState(false);
  const areaValue = areaTouched ? area : defaultArea;

  const send = async () => {
    const c = normalizeCode(code);
    if (!isValidCode(c)) {
      setPhase("error");
      setMessage(`A session code is ${CODE_LENGTH} letters and numbers.`);
      return;
    }
    setPhase("sending");
    setMessage(null);
    try {
      localStorage.setItem(CODE_KEY, c);
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch(`/api/class/${c}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: areaValue, contributor: name, mode, offenders }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setPhase("error");
        setMessage(json.error ?? "The session did not accept that.");
        return;
      }
      setPhase("sent");
      setMessage(null);
    } catch {
      setPhase("error");
      setMessage("Could not reach the session.");
    }
  };

  return (
    <section className="panel overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface2/40 sm:px-5"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="mono-label text-cyan">Class mode</span>
          <span className="mt-0.5 block truncate text-sm text-mist">
            {phase === "sent"
              ? `Sent to session ${code} as "${areaValue}"`
              : "Send these rows to a shared building map"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[0.7rem] text-dim">
          {open ? "Hide" : "Open"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-line"
          >
            <div className="space-y-3 px-4 py-4 sm:px-5">
              <div className="grid gap-3 @lg:grid-cols-3">
                <Field label="session code">
                  <input
                    value={code}
                    onChange={(e) => {
                      setCode(normalizeCode(e.target.value));
                      setPhase("idle");
                    }}
                    placeholder="ABC234"
                    maxLength={CODE_LENGTH}
                    className="w-full border border-line bg-surface px-3 py-2 font-mono text-sm tracking-[0.25em] text-fog uppercase outline-none focus:border-cyan rounded-xl"
                  />
                </Field>
                <Field label="your name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Sam R."
                    maxLength={40}
                    className="w-full border border-line bg-surface px-3 py-2 text-sm text-fog outline-none focus:border-cyan rounded-xl"
                  />
                </Field>
                <Field label="area you covered">
                  <input
                    value={areaValue}
                    onChange={(e) => {
                      setAreaTouched(true);
                      setArea(e.target.value);
                    }}
                    placeholder="Room 214"
                    maxLength={40}
                    className="w-full border border-line bg-surface px-3 py-2 text-sm text-fog outline-none focus:border-cyan rounded-xl"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={send}
                  disabled={phase === "sending" || offenders.length === 0}
                  className="px-4 py-2 text-[0.75rem] transition-colors disabled:opacity-40 rounded-full bg-fog text-ink font-medium hover:bg-fog/85"
                >
                  {phase === "sending"
                    ? "Sending…"
                    : phase === "sent"
                      ? "send again"
                      : `send ${offenders.length} rows`}
                </button>
                <Link
                  href="/buildings"
                  className="font-mono text-[0.72rem] text-dim underline-offset-4 transition-colors hover:text-cyan hover:underline"
                >
                  open the shared map →
                </Link>
                {phase === "sent" && (
                  <span className="font-mono text-[0.72rem] text-lime">
                    added · re-sending replaces it rather than double-counting
                  </span>
                )}
              </div>

              {message && (
                <p className="border-l-2 border-ember bg-surface2/50 px-3 py-2 font-mono text-[0.72rem] text-ember">
                  {message}
                </p>
              )}

              <p className="text-[0.76rem] leading-relaxed text-dim">
                What travels: the {offenders.length} device rows above and the area name. Your
                photos stay on this device — they were read here, and the picture has no reason to
                leave.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
