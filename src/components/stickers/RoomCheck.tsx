"use client";

// What a room sticker's QR opens: "Leaving Room 214?" and the things to switch
// off, worst first. Tap each as you go; when they're all off, Ghosty says what
// that night was worth. The room's figures come from the link itself, and the
// running count of nights stays on this phone.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { decodeSticker, type RoomSticker } from "@/lib/sticker";
import { Mark } from "../home/HomeNav";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtCents = (n: number) => (n < 10 ? "$" + n.toFixed(2) : fmt(n));

export function RoomCheck() {
  const [room, setRoom] = useState<RoomSticker | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [off, setOff] = useState<Set<number>>(new Set());
  const [nights, setNights] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const c = window.location.hash.slice(1);
      setCode(c);
      setRoom(decodeSticker(c));
      try {
        setNights(Number(localStorage.getItem("ghostwatt.room." + c.slice(0, 48)) ?? 0) || 0);
      } catch {
        // Private mode: no running count.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (room === undefined) return <div className="min-h-[60vh]" />;

  if (room === null) {
    return (
      <section className="mx-auto max-w-lg px-5 pb-16 pt-28 text-center">
        <h1 className="font-editorial text-[2.4rem] leading-[1.05] text-fog">This sticker&apos;s code didn&apos;t come through.</h1>
        <p className="mt-3 text-[0.98rem] leading-relaxed text-mist">Try scanning it again, a little closer. Or scan the room yourself.</p>
        <Link href="/scan" className="mt-6 inline-block rounded-full bg-fog px-5 py-2.5 text-[0.92rem] font-medium text-ink">
          Open the scanner
        </Link>
      </section>
    );
  }

  const allOff = off.size === room.devices.length;
  // After-hours waste is spread across the year's empty nights; a fair "tonight" is a 365th of it.
  const perNight = room.waste / 365;

  const toggle = (i: number) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const finish = () => {
    const next = nights + 1;
    setNights(next);
    setDone(true);
    try {
      localStorage.setItem("ghostwatt.room." + code.slice(0, 48), String(next));
    } catch {
      // ignore
    }
  };

  return (
    <section className="mx-auto max-w-lg px-5 pb-16 pt-24 sm:pt-28">
      <p className="flex items-center gap-2 text-[0.82rem] text-mist">
        <Mark className="h-5 w-[0.95rem]" />
        {room.building || "Ghost Watt"} · room sticker
      </p>
      <h1 className="font-editorial mt-3 text-[2.6rem] leading-[1] text-fog">
        Leaving <span className="italic text-cyan">{room.room}?</span>
      </h1>
      <p className="mt-3 text-[1rem] leading-relaxed text-mist">
        Left on after hours, this room costs <span className="font-semibold text-ember">{fmt(room.waste)} a year</span>. Tap each thing as you switch it
        off.
      </p>

      <ul className="mt-6 space-y-2">
        {room.devices.map((d, i) => {
          const on = off.has(i);
          return (
            <li key={i}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => toggle(i)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                  on ? "border-lime/40 bg-lime/[0.08]" : "border-line bg-surface hover:border-line2"
                }`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-colors ${on ? "border-lime bg-lime text-ink" : "border-line2"}`}>
                  {on && (
                    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[0.98rem] font-medium ${on ? "text-dim line-through" : "text-fog"}`}>
                    {d.count > 1 ? `${d.count} × ` : ""}
                    {d.label}
                  </span>
                  <span className="block text-[0.8rem] text-dim">
                    {d.state === "standby" ? "Asleep isn't off: switch it fully off" : "Switch it off"}
                    {d.fix ? ` · long-term fix: ${d.fix.toLowerCase()}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[0.9rem] font-semibold text-fog">{fmt(d.cost)}/yr</span>
              </motion.button>
            </li>
          );
        })}
      </ul>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 rounded-[1.5rem] bg-[linear-gradient(180deg,#1b1f33,#121420)] p-6 text-center text-moon"
          >
            <p className="font-editorial text-[2rem] leading-[1.05]">
              Lights out. <span className="italic text-[#ffc777]">Thank you.</span>
            </p>
            <p className="mt-2 text-[0.92rem] text-moon/70">
              That&apos;s about {fmtCents(perNight)} saved tonight, and {fmt(room.waste)} a year if it happens every night.
            </p>
            <p className="mt-3 text-[0.82rem] text-moon/50">
              You&apos;ve switched this room off {nights} time{nights === 1 ? "" : "s"} on this phone.
            </p>
          </motion.div>
        ) : (
          <motion.button
            key="cta"
            type="button"
            onClick={finish}
            disabled={!allOff}
            className="mt-6 w-full rounded-full bg-fog py-3.5 text-[0.98rem] font-medium text-ink transition-opacity disabled:opacity-40"
          >
            {allOff ? "Everything's off" : `${room.devices.length - off.size} left to switch off`}
          </motion.button>
        )}
      </AnimatePresence>

      <p className="mt-8 text-[0.8rem] leading-relaxed text-dim">
        From a Ghost Watt scan on {room.date}. Figures are estimates from published wattages and the local price.{" "}
        <Link href="/scan" className="text-cyan hover:underline">
          Scan this room again
        </Link>{" "}
        ·{" "}
        <Link href="/" className="text-cyan hover:underline">
          What is Ghost Watt?
        </Link>
      </p>
    </section>
  );
}
