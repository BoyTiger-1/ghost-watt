"use client";

// Send to team. Shown on the scanner only once you've joined a team, so it is
// one obvious button rather than a form to discover.

import { useEffect, useState } from "react";
import Link from "next/link";
import { isValidCode } from "@/lib/classroom";
import type { Contribution } from "@/lib/classroom";
import type { Offender } from "@/lib/types";
import { submitToTeam } from "@/lib/team";
import { TEAM_CODE_KEY, TEAM_NAME_KEY } from "../TeamScan";

type Phase = "idle" | "sending" | "sent" | "error";

export function TeamSend({ offenders, mode, defaultRoom }: { offenders: Offender[]; mode: Contribution["mode"]; defaultRoom: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const c = localStorage.getItem(TEAM_CODE_KEY);
        if (c && isValidCode(c)) setCode(c);
        setName(localStorage.getItem(TEAM_NAME_KEY) ?? "");
      } catch {
        // Private mode: no team remembered.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!code) return null;
  const roomValue = room ?? defaultRoom;

  const send = async () => {
    setPhase("sending");
    setMessage(null);
    try {
      localStorage.setItem(TEAM_NAME_KEY, name);
    } catch {
      // ignore
    }
    try {
      await submitToTeam(code, { area: roomValue, contributor: name, mode, offenders });
      setPhase("sent");
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "Couldn't reach the team. Check your connection.");
    }
  };

  return (
    <section className="no-print flex flex-wrap items-center gap-3 rounded-2xl border border-cyan/25 bg-cyan/[0.05] px-4 py-3">
      <span className="text-[0.86rem] text-mist">
        You&apos;re on team <span className="font-mono font-semibold text-fog">{code}</span>
      </span>
      <input
        value={roomValue}
        onChange={(e) => {
          setRoom(e.target.value);
          setPhase("idle");
        }}
        aria-label="Room name"
        placeholder="Room name"
        maxLength={40}
        className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[0.86rem] text-fog outline-none focus:border-cyan sm:max-w-[12rem]"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Your name"
        placeholder="Your name"
        maxLength={40}
        className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[0.86rem] text-fog outline-none focus:border-cyan sm:max-w-[10rem]"
      />
      <button
        onClick={send}
        disabled={phase === "sending" || !offenders.length}
        className="rounded-full bg-fog px-4 py-1.5 text-[0.86rem] font-medium text-ink hover:bg-fog/85 disabled:opacity-40"
      >
        {phase === "sending" ? "Sending…" : phase === "sent" ? "Sent ✓ · send again" : "Send to team"}
      </button>
      <Link href={`/team?code=${code}`} className="text-[0.82rem] text-cyan hover:underline">
        See the team&apos;s total
      </Link>
      {message && <p className="w-full text-[0.8rem] text-ember">{message}</p>}
      {phase === "sent" && <p className="w-full text-[0.76rem] text-dim">Sending again replaces this room instead of counting it twice.</p>}
    </section>
  );
}
