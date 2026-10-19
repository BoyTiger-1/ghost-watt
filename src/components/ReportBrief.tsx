"use client";

// The document that leaves the building.
//
// Every other part of the scan is a dashboard for the person holding the phone.
// This one assumes a facilities director, a landlord or a parent holding a sheet
// of paper, deciding in about forty seconds whether to care. So the ask is at
// the top, the evidence under it, and the caveats on the page rather than
// behind a link.
//
// It lives as a tab of the scanner: it previews the scan just made (or any
// saved one, or the whole building), takes the user's own notes and picks of
// pictures, and prints as black ink on white, or saves as a PDF from the print
// window. Notes are kept on this device, per report.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/useStore";
import { auditsFor, type SavedAudit } from "@/lib/storage";
import { rollupBuilding } from "@/lib/rollup";
import { buildBrief, headline, type BriefItem } from "@/lib/report";
import { fmtCo2, fmtMoney, fmtMoneyFull, fmtPayback } from "@/lib/energy";
import { annotatedDataUrl, type DetectionPhoto } from "./DetectionView";

/** A picture that can go into the report: a photo whose boxes get burned in, or a ready image. */
export interface ReportPicture {
  id: string;
  name: string;
  photo?: DetectionPhoto;
  src?: string;
}

interface Notes {
  title?: string;
  preparedBy?: string;
  notes?: string;
  /** Per recommended move. */
  moves?: Record<string, string>;
  /** Picture ids left out of the report. */
  hidden?: string[];
}

const NOTES_KEY = "gw-report-notes";

function loadNotes(id: string): Notes {
  try {
    const all = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "{}") as Record<string, Notes>;
    return all[id] ?? {};
  } catch {
    return {};
  }
}

function saveNotes(id: string, n: Notes) {
  try {
    const all = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "{}") as Record<string, Notes>;
    all[id] = n;
    localStorage.setItem(NOTES_KEY, JSON.stringify(all));
  } catch {
    // Not remembered, still on the page for this visit.
  }
}

export function ReportBrief({ current, pictures = [] }: { current?: SavedAudit | null; pictures?: ReportPicture[] }) {
  const store = useStore();
  const [auditId, setAuditId] = useState<string | null>(null);

  // Fall back to the first building: an active id can go stale when its building is deleted.
  const building = store.buildings.find((b) => b.id === store.activeBuildingId) ?? store.buildings[0];
  const audits = building ? auditsFor(store, building.id) : [];
  // With more than one room saved, the whole building is on offer: the latest
  // scan of every room added together, which is the document a principal wants.
  const whole = audits.length > 1 ? wholeBuilding(audits) : null;
  // The scan on screen leads; then the whole building; then the latest saved room.
  const selected = auditId ?? (current ? "current" : whole ? "building" : audits[0]?.id);
  const audit =
    (selected === "current" ? current : selected === "building" ? whole : audits.find((a) => a.id === selected)) ?? current ?? whole ?? audits[0];
  const isCurrent = !!current && audit === current;
  const brief = audit ? buildBrief(audit, building) : null;

  // Notes are kept per report; a new scan starts a fresh set.
  const notesId = audit ? (isCurrent ? `current:${audit.areas.join("|")}` : audit.id) : "";
  const [notes, setNotesState] = useState<Notes>({});
  useEffect(() => {
    if (!notesId) return;
    const t = setTimeout(() => setNotesState(loadNotes(notesId)), 0);
    return () => clearTimeout(t);
  }, [notesId]);
  const setNotes = (patch: Partial<Notes>) =>
    setNotesState((prev) => {
      const next = { ...prev, ...patch };
      saveNotes(notesId, next);
      return next;
    });

  // Pictures belong to the scan on screen, not to an older saved one.
  const shown = isCurrent ? pictures : [];
  const images = useAnnotated(shown);

  if (!building || !audit || !brief) {
    return (
      <div className="panel p-8 text-center">
        <h2 className="text-lg font-semibold text-fog">Nothing to report yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mist">
          Add a photo or video of a room and the report builds itself here, ready to print or save as a PDF.
        </p>
        <Link href="/scan" className="mt-4 inline-block rounded-full bg-fog px-4 py-2 text-[0.8rem] font-medium text-ink transition-colors hover:bg-fog/85">
          Scan a room
        </Link>
      </div>
    );
  }

  const dated = new Date(audit.at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const hidden = new Set(notes.hidden ?? []);
  const title = notes.title ?? brief.buildingName;
  const wasteItems = [...brief.free.items, ...brief.capital.items].sort((a, b) => b.annualWaste - a.annualWaste).slice(0, 6);
  const wasteMax = Math.max(1, ...wasteItems.map((i) => i.annualWaste));

  return (
    /* The sheet keeps a document's width; the controls take the spare room in a
       sticky rail beside it. Print flattens it (see .brief-layout). */
    <div className="brief-layout space-y-6 lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0">
      {/* Controls. Dropped from print output entirely. */}
      <div className="no-print flex flex-col gap-4 lg:sticky lg:top-20 lg:col-start-1 lg:row-start-1">
        {(audits.length > 0 || whole) && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.78rem] font-medium text-mist">Report on</span>
            <select
              value={isCurrent ? "current" : audit.id}
              onChange={(e) => setAuditId(e.target.value)}
              className="w-full max-w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fog outline-none focus:border-cyan"
            >
              {current && <option value="current">This scan · {current.areas.length} {current.areas.length === 1 ? "picture" : "pictures"}</option>}
              {whole && <option value="building">Whole building · {whole.areas.length} rooms</option>}
              {audits.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.at).toLocaleDateString()} · {a.areas.join(", ") || "no areas"}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-2 lg:flex-col">
          <button onClick={() => window.print()} className="rounded-full bg-fog px-4 py-2.5 text-[0.84rem] font-medium text-ink transition-colors hover:bg-fog/85">
            Save as PDF
          </button>
          <button onClick={() => window.print()} className="rounded-full border border-line px-4 py-2.5 text-[0.84rem] text-fog transition-colors hover:border-fog/40">
            Print
          </button>
        </div>
        <p className="text-[0.76rem] leading-relaxed text-dim">
          For a PDF, choose <span className="text-mist">&ldquo;Save as PDF&rdquo;</span> as the printer in the window that opens. It prints black on white.
        </p>
        <p className="rounded-xl bg-surface2/70 px-3 py-2.5 text-[0.76rem] leading-relaxed text-mist">
          Click the title, the <span className="text-fog">Prepared by</span> line or <span className="text-fog">Your notes</span> to write on the report. Add a note to any recommendation, and untick pictures you don&apos;t want included.
        </p>
      </div>

      <article className="print-sheet panel space-y-8 p-6 sm:p-10 lg:col-start-2 lg:row-start-1">
        {/* Masthead */}
        <header className="space-y-3 border-b border-line pb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="mono-label text-cyan">energy waste report</span>
            <span className="font-mono text-[0.72rem] text-dim">{dated}</span>
          </div>
          <input
            value={title}
            onChange={(e) => setNotes({ title: e.target.value })}
            aria-label="Report title"
            className="font-editorial -mx-1 w-full rounded-lg bg-transparent px-1 text-[2.1rem] leading-[1.1] text-fog outline-none transition-colors hover:bg-surface2/60 focus:bg-surface2/60 sm:text-[2.6rem]"
          />
          <p className="max-w-[60ch] text-base leading-relaxed text-mist">{headline(brief)}</p>
          <label className={`flex items-baseline gap-2 text-[0.84rem] text-dim ${notes.preparedBy ? "" : "no-print"}`}>
            Prepared by
            <input
              value={notes.preparedBy ?? ""}
              onChange={(e) => setNotes({ preparedBy: e.target.value })}
              placeholder="your name"
              className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-fog outline-none placeholder:text-dim/60 hover:bg-surface2/60 focus:bg-surface2/60"
            />
          </label>
        </header>

        {/* The ask, as four numbers. */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <Cell label="Wasted while empty, a year" value={fmtMoneyFull(brief.annualWaste)} tone="ember" />
          <Cell label="Could be saved, a year" value={fmtMoneyFull(brief.totalRecoverable)} tone="lime" />
          <Cell label="Cost of the fixes" value={brief.totalUpfront > 0 ? fmtMoneyFull(brief.totalUpfront) : "Nothing"} />
          <Cell label="Pays for itself in" value={brief.paybackMonths === null ? "Right away" : fmtPayback(brief.paybackMonths)} />
        </section>

        {/* The split the whole app is built on, stated once in plain words. */}
        <section className="avoid-break grid gap-4 border-b border-line pb-6 text-[0.86rem] leading-relaxed text-mist sm:grid-cols-2">
          <p>
            <span className="font-semibold text-ember">{fmtMoneyFull(brief.annualWaste)} a year</span> is what the devices seen cost to keep running through
            the hours nobody is there, if they stay as they were photographed. Likely between {fmtMoneyFull(brief.annualWasteLow)} and{" "}
            {fmtMoneyFull(brief.annualWasteHigh)}.
          </p>
          <p>
            <span className="font-semibold text-fog">{fmtMoneyFull(brief.typicalCost)} a year</span> is what the same devices cost while people are actually using
            them. That part is not waste; the first figure is what the fixes below go after.
          </p>
        </section>

        {/* Where the waste is, drawn. */}
        {wasteItems.length > 0 && (
          <section className="avoid-break space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-fog">Where the waste is</h2>
            <ul className="space-y-2">
              {wasteItems.map((i) => (
                <li key={i.categoryId} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-[0.84rem] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5rem]">
                  <span className="truncate text-fog">
                    {i.label} <span className="text-dim">×{i.count}</span>
                  </span>
                  <span className="h-3 overflow-hidden rounded-full bg-surface2">
                    <span className="block h-full rounded-full bg-ember" style={{ width: `${(i.annualWaste / wasteMax) * 100}%` }} />
                  </span>
                  <span className="text-right font-mono tabular-nums text-fog">{fmtMoney(i.annualWaste)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* The pictures, with the devices marked. */}
        {images.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-fog">What was found</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {images.map((p) => {
                const off = hidden.has(p.id);
                return (
                  <figure key={p.id} className={`avoid-break space-y-1.5 ${off ? "no-print opacity-40" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={`${p.name}, with the devices found marked`} className="w-full rounded-lg border border-line" />
                    <figcaption className="flex items-center justify-between gap-2 text-[0.78rem] text-mist">
                      <span>{p.name}</span>
                      <label className="no-print inline-flex items-center gap-1.5 text-dim">
                        <input
                          type="checkbox"
                          checked={!off}
                          onChange={() => {
                            const next = new Set(hidden);
                            if (off) next.delete(p.id);
                            else next.add(p.id);
                            setNotes({ hidden: [...next] });
                          }}
                        />
                        Include
                      </label>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        )}

        {/* The best moves in order: the part a decision-maker reads if they read one. */}
        {brief.topActions.length > 0 && (
          <section className="avoid-break space-y-4">
            <div className="space-y-1">
              <span className="mono-label text-cyan">best value first</span>
              <h2 className="text-lg font-semibold tracking-tight text-fog">What to do</h2>
              <p className="max-w-[62ch] text-sm leading-relaxed text-mist">
                Ranked by how much each dollar spent saves a year; free moves come first. Replacing a device is priced at normal use, so its saving is what a bill would
                show.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <Th>Move</Th>
                    <Th>Where</Th>
                    <Th align="right">Saves a year</Th>
                    <Th align="right">Costs</Th>
                    <Th align="right">Saved per $1</Th>
                  </tr>
                </thead>
                <tbody>
                  {brief.topActions.map((a, i) => {
                    const note = notes.moves?.[a.id];
                    return (
                      <tr key={a.id} className="border-b border-line/60 align-top">
                        <td className="py-2.5 pr-4">
                          <div className="text-fog">
                            <span className="mr-2 font-mono text-[0.72rem] text-dim tabular-nums">{i + 1}.</span>
                            {a.title}
                          </div>
                          <div className="mt-0.5 text-[0.78rem] leading-snug text-dim">
                            {a.label}
                            {a.count > 1 ? ` ×${a.count}` : ""}
                            {a.confidence === "low" && <span className="ml-2 text-amber">worth double-checking</span>}
                          </div>
                          <MoveNote
                            value={note}
                            onChange={(v) => setNotes({ moves: { ...(notes.moves ?? {}), [a.id]: v } })}
                          />
                        </td>
                        <td className="py-2.5 pr-4 text-[0.82rem] text-mist">{a.where}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-lime">{fmtMoneyFull(a.annualSavings)}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-mist">{a.cost > 0 ? fmtMoneyFull(a.cost) : "Free"}</td>
                        <td className="py-2.5 text-right tabular-nums text-mist">{a.savingsPerDollar === null ? "—" : `$${a.savingsPerDollar.toFixed(2)}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Free wins first: the half that can happen without a purchase order. */}
        {brief.free.items.length > 0 && (
          <Group
            eyebrow="costs nothing"
            title="Can be done this week"
            blurb={`${fmtMoneyFull(brief.free.annualSavings)} a year, with nothing to buy and no budget to approve. These are habits and schedules.`}
            items={brief.free.items}
            showCost={false}
          />
        )}

        {brief.capital.items.length > 0 && (
          <Group
            eyebrow={`${fmtMoneyFull(brief.capital.upfront)} to buy`}
            title="Needs equipment"
            blurb={`${fmtMoneyFull(brief.capital.annualSavings)} a year once installed. Best value first, so the list can be cut from the bottom to fit a budget.`}
            items={brief.capital.items}
            showCost
          />
        )}

        {/* The user's own words. */}
        <section className={`avoid-break space-y-2 ${notes.notes ? "" : "no-print"}`}>
          <h2 className="text-lg font-semibold tracking-tight text-fog">Your notes</h2>
          <textarea
            value={notes.notes ?? ""}
            onChange={(e) => setNotes({ notes: e.target.value })}
            rows={4}
            placeholder="Anything the reader should know: who to talk to, what you saw, what you'd do first…"
            className="no-print w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[0.9rem] leading-relaxed text-fog outline-none placeholder:text-dim/60 focus:border-cyan"
          />
          {notes.notes && <p className="print-only whitespace-pre-wrap text-[0.9rem] leading-relaxed text-fog">{notes.notes}</p>}
        </section>

        {/* Context a decision-maker will ask for. */}
        <section className="grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
          <Fact label="Carbon from the waste" value={`${fmtCo2(brief.co2KgPerYear)} of CO₂ a year`} />
          <Fact label="Likely range" value={`${fmtMoneyFull(brief.annualWasteLow)} – ${fmtMoneyFull(brief.annualWasteHigh)}`} />
          <Fact label="How sure" value={brief.confidence === "high" ? "Quite sure" : brief.confidence === "medium" ? "Fairly sure" : "A rough guess"} />
        </section>

        {/* Caveats on the page, not behind a link. */}
        <section className="space-y-3 border-l-2 border-amber bg-surface2/40 px-5 py-4">
          <div className="mono-label text-amber">what this number is not</div>
          <ul className="space-y-2">
            {brief.caveats.map((c, i) => (
              <li key={i} className="text-[0.82rem] leading-relaxed text-mist">
                {c}
              </li>
            ))}
          </ul>
        </section>

        {/* Provenance. A report that cannot be traced back is not evidence. */}
        <footer className="space-y-4 border-t border-line pt-6">
          <div className="grid gap-2 text-[0.78rem] text-dim sm:grid-cols-2">
            <div>
              <span className="mono-label">areas covered</span>
              <p className="mt-1 text-mist">{audit.areas.join(", ") || "not recorded"}</p>
            </div>
            <div>
              <span className="mono-label">how it was read</span>
              <p className="mt-1 text-mist">
                {audit.mode === "enhanced"
                  ? "Photographs read by a cloud AI model"
                  : audit.mode === "mixed"
                    ? "Partly a cloud AI model, partly the on-device detector"
                    : "Photographs read by the on-device detector"}
                {" · "}
                {audit.engine}
              </p>
            </div>
          </div>
          <div className="avoid-break space-y-2">
            <span className="mono-label">method and sources</span>
            <p className="text-[0.78rem] leading-relaxed text-mist">
              Each device&apos;s power draw × the hours it runs × the price per kilowatt-hour. Draws come from a published catalogue or a plug-in meter reading where one
              was entered; hours in use from the room type, with the building&apos;s schedule setting the empty hours; price from{" "}
              {building.bill
                ? `this building's own bill ($${audit.settings.ratePerKwh.toFixed(3)} per kWh)`
                : `a published average for this area ($${audit.settings.ratePerKwh.toFixed(3)} per kWh)`}
              ; carbon at {audit.settings.co2PerKwh.toFixed(2)} kg CO₂ per kWh for this grid. Full derivation at /methodology.
            </p>
            <ol className="space-y-1 text-[0.74rem] leading-snug text-dim">
              {brief.sources.map((src, i) => (
                <li key={src.id}>
                  {i + 1}. {src.label}. {src.publisher}, {src.year}.
                </li>
              ))}
            </ol>
          </div>

          {/* Signature block. The point of the whole document. */}
          <div className="signature-block grid gap-6 pt-4 sm:grid-cols-2">
            <SignLine label="Reviewed by" />
            <SignLine label="Date" />
          </div>
        </footer>
      </article>
    </div>
  );
}

/** The pictures as images with their boxes burned in, made once per picture. */
function useAnnotated(pictures: ReportPicture[]) {
  const [made, setMade] = useState<Record<string, string>>({});
  // Redrawn when the set of pictures or what was found on them changes, not on every render.
  const key = pictures.map((p) => `${p.id}:${p.photo?.offenders.map((o) => `${o.id}${o.costPerYear.toFixed(0)}`).join(".") ?? ""}`).join(",");
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const p of pictures) {
        if (!p.photo) continue;
        const src = await annotatedDataUrl(p.photo).catch(() => null);
        if (!alive) return;
        if (src) setMade((m) => ({ ...m, [p.id]: src }));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return pictures.map((p) => ({ id: p.id, name: p.name, src: made[p.id] ?? p.src })).filter((p): p is { id: string; name: string; src: string } => !!p.src);
}

function MoveNote({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open && !value) {
    return (
      <button onClick={() => setOpen(true)} className="no-print mt-1 text-[0.74rem] text-cyan hover:underline">
        + Add a note
      </button>
    );
  }
  return (
    <>
      <input
        autoFocus={open && !value}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setOpen(false)}
        placeholder="Your note on this one"
        className="no-print mt-1.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[0.8rem] text-fog outline-none placeholder:text-dim/60 focus:border-cyan"
      />
      {value && <p className="print-only mt-1 text-[0.8rem] italic text-fog">Note: {value}</p>}
    </>
  );
}

/** The building as one audit: the latest scan of each room, offenders re-sourced to the room name. */
function wholeBuilding(audits: SavedAudit[]): SavedAudit {
  const r = rollupBuilding(audits);
  const latest = r.rooms[0]?.audit ?? audits[0];
  const engines = [...new Set(r.rooms.map((x) => x.audit.engine))];
  return {
    id: "building",
    buildingId: latest.buildingId,
    at: r.latestAt ?? latest.at,
    areas: r.rooms.map((x) => x.room),
    // Unverified lines travel too, so the report can say how many it left out.
    offenders: r.rooms.flatMap((x) => x.audit.offenders.map((o) => ({ ...o, source: x.room }))),
    settings: latest.settings,
    mode: r.mode,
    engine: engines.length === 1 ? engines[0] : `${engines.length} engines`,
  };
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "ember" | "lime" }) {
  const color = tone === "ember" ? "text-ember" : tone === "lime" ? "text-lime" : "text-fog";
  return (
    <div className="bg-surface px-4 py-4">
      <div className="text-[0.74rem] text-dim">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${color}`}>{value}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono-label">{label}</div>
      <div className="mt-1 text-sm text-fog">{value}</div>
    </div>
  );
}

function SignLine({ label }: { label: string }) {
  return (
    <div>
      <div className="h-8 border-b border-line2" />
      <div className="mono-label mt-2">{label}</div>
    </div>
  );
}

function Group({ eyebrow, title, blurb, items, showCost }: { eyebrow: string; title: string; blurb: string; items: BriefItem[]; showCost: boolean }) {
  return (
    <section className="avoid-break space-y-4">
      <div className="space-y-1">
        <span className="mono-label text-cyan">{eyebrow}</span>
        <h2 className="text-lg font-semibold tracking-tight text-fog">{title}</h2>
        <p className="max-w-[62ch] text-sm leading-relaxed text-mist">{blurb}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <Th>What</Th>
              <Th>Where</Th>
              <Th align="right">Saves a year</Th>
              {showCost && <Th align="right">Costs</Th>}
              {showCost && <Th align="right">Pays for itself in</Th>}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.categoryId} className="border-b border-line/60 align-top">
                <td className="py-3 pr-4">
                  <div className="text-fog">
                    {i.label} <span className="text-dim">×{i.count}</span>
                  </div>
                  <div className="mt-0.5 text-[0.78rem] leading-snug text-dim">
                    {i.actionLabel}
                    {i.confidence === "low" && <span className="ml-2 text-amber">worth double-checking</span>}
                  </div>
                </td>
                <td className="py-3 pr-4 text-[0.82rem] text-mist">{i.areas.join(", ")}</td>
                <td className="py-3 pr-4 text-right tabular-nums text-lime">{fmtMoneyFull(i.annualSavings)}</td>
                {showCost && <td className="py-3 pr-4 text-right tabular-nums text-mist">{fmtMoneyFull(i.fixCost)}</td>}
                {showCost && <td className="py-3 text-right tabular-nums text-mist">{i.paybackMonths === null ? "—" : fmtPayback(i.paybackMonths)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th className={`pb-2 text-[0.76rem] font-normal text-dim ${align === "right" ? "text-right" : ""}`}>{children}</th>;
}
