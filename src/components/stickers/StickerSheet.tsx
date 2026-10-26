"use client";

// The sheet of room stickers for one place, ready to print and cut out. Each
// sticker is made from that room's latest scan; its QR opens the room's
// before-you-leave checklist on any phone.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/useStore";
import { roomStickers, stickerUrl, type RoomSticker } from "@/lib/sticker";
import { TeamQR } from "../team/TeamQR";
import { Mark } from "../home/HomeNav";

const fmt = (n: number) => "$" + n.toLocaleString("en-US");

export function StickerSheet() {
  const store = useStore();
  const [origin, setOrigin] = useState("");
  const [buildingId, setBuildingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setOrigin(window.location.origin);
      setBuildingId(new URLSearchParams(window.location.search).get("building"));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const building =
    store.buildings.find((b) => b.id === buildingId) ?? store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0] ?? null;
  const stickers = useMemo(
    () => (building ? roomStickers(store.audits, building.id, building.name) : []),
    [store.audits, building],
  );
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const printing = stickers.filter((s) => !skip.has(s.room));

  return (
    <section className="relative z-10 mx-auto max-w-5xl px-5 pb-16 pt-24 sm:px-6 sm:pt-32">
      <div className="no-print">
        <p className="flex items-center gap-2 text-[0.82rem] text-mist">
          <span className="h-1.5 w-1.5 rounded-full bg-sodium" />
          Room stickers
        </p>
        <h1 className="font-editorial mt-4 text-[2.6rem] leading-[1] text-fog sm:text-[3.4rem]">
          Put the audit <span className="italic text-cyan">on the door.</span>
        </h1>
        <p className="mt-5 max-w-[60ch] text-[1.02rem] leading-[1.65] text-mist">
          One sticker per scanned room: what sits idle after hours and what to switch off. Anyone who scans the QR on the way out gets a checklist on their
          phone. Nothing to install, and the room&apos;s figures travel inside the code itself.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {store.buildings.length > 1 && (
            <select
              value={building?.id ?? ""}
              onChange={(e) => setBuildingId(e.target.value)}
              aria-label="Place"
              className="rounded-full border border-line bg-surface px-4 py-2.5 text-[0.9rem] text-fog"
            >
              {store.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!printing.length}
            className="rounded-full bg-fog px-5 py-2.5 text-[0.92rem] font-medium text-ink hover:bg-fog/85 disabled:opacity-40"
          >
            Print {printing.length} sticker{printing.length === 1 ? "" : "s"}
          </button>
          <span className="text-[0.8rem] text-dim">Tip: print on full-page sticker paper, or on plain paper and tape it up.</span>
        </div>

        {stickers.length > 1 && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {stickers.map((s) => {
              const on = !skip.has(s.room);
              return (
                <button
                  key={s.room}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setSkip((prev) => {
                      const n = new Set(prev);
                      if (on) n.add(s.room);
                      else n.delete(s.room);
                      return n;
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-[0.8rem] transition-colors ${on ? "border-fog/30 bg-fog/[0.06] text-fog" : "border-line text-dim line-through"}`}
                >
                  {s.room}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!stickers.length ? (
        <div className="no-print panel mt-10 p-8 text-center">
          <h2 className="text-lg font-semibold text-fog">No rooms to make stickers for yet</h2>
          <p className="mx-auto mt-2 max-w-md text-[0.92rem] leading-relaxed text-mist">
            Scan a room that has something left on, and give it a name. Each named room with idle cost in it gets a sticker.
          </p>
          <Link href="/scan" className="mt-5 inline-block rounded-full bg-fog px-5 py-2.5 text-[0.9rem] font-medium text-ink">
            Open the scanner
          </Link>
        </div>
      ) : (
        <div className="sticker-sheet mt-10 grid gap-5 sm:grid-cols-2">
          {printing.map((s) => (
            <Sticker key={s.room} s={s} url={origin ? stickerUrl(origin, s) : ""} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One printable door sticker: the room, its worst offenders, what they cost, and a
 * QR code that opens a fresh scan of this room, so the next check is one tap.
 */
function Sticker({ s, url }: { s: RoomSticker; url: string }) {
  const top = s.devices.slice(0, 3);
  return (
    <article className="sticker relative flex overflow-hidden rounded-[1.25rem] border-2 border-[#1c1b18] bg-white text-[#1c1b18]">
      <span aria-hidden className="w-2.5 shrink-0 bg-[linear-gradient(180deg,#ffc35a,#f28a1d)]" />
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-center gap-2 text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[#57534b]">
          <Mark className="h-4 w-[0.76rem]" tint="text-[#1c1b18]" />
          Before you leave
        </div>
        <h2 className="mt-1.5 truncate text-[1.6rem] font-bold leading-tight tracking-[-0.02em]">{s.room}</h2>
        <p className="mt-0.5 text-[0.86rem] leading-snug text-[#57534b]">
          Left on after hours, this room costs <span className="font-bold text-[#c4461f]">{fmt(s.waste)} a year</span>.
        </p>
        <ul className="mt-2.5 space-y-1">
          {top.map((d) => (
            <li key={d.label} className="flex items-center gap-2 text-[0.84rem]">
              <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border-[1.5px] border-[#1c1b18]" />
              <span className="min-w-0 flex-1 truncate">
                {d.state === "standby" ? "Fully off: " : "Off: "}
                {d.count > 1 ? `${d.count} × ` : ""}
                {d.label.toLowerCase()}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{fmt(d.cost)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-2.5 text-[0.66rem] text-[#6f6a60]">
          Ghost Watt · {s.building} · scanned {s.date}
        </p>
      </div>
      <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center gap-1.5 border-l border-dashed border-[#cfc8ba] p-3">
        {url ? <TeamQR value={url} className="h-[6.2rem] w-[6.2rem] !bg-white" /> : <span className="h-[6.2rem] w-[6.2rem]" />}
        <span className="text-center text-[0.64rem] font-medium leading-tight text-[#57534b]">Scan to check it off</span>
      </div>
    </article>
  );
}
