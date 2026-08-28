"use client";

// The document that leaves the building.
//
// Every other screen in this app is a dashboard: it assumes a reader who is already
// interested, sitting in front of it, able to hover things. This one assumes a
// facilities director holding a sheet of paper in a corridor, deciding in about
// forty seconds whether to care. That difference drives the whole layout - the ask
// is at the top, the evidence is under it, and the caveats are on the page rather
// than behind a link, because a number handed over without its assumptions is how
// student projects lose credibility the first time someone checks one.
//
// It is deliberately printable. A school runs on paper and signatures, and the
// print stylesheet in globals.css turns this from a dark dashboard into black ink
// on white with the controls dropped.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/useStore";
import { SampleData } from "./SampleData";
import { auditsFor } from "@/lib/storage";
import { buildBrief, headline, type BriefItem } from "@/lib/report";
import { fmtCo2, fmtMoneyFull, fmtPayback } from "@/lib/energy";

export function ReportBrief() {
  const store = useStore();
  const [auditId, setAuditId] = useState<string | null>(null);

  const building = store.buildings.find((b) => b.id === store.activeBuildingId);
  const audits = building ? auditsFor(store, building.id) : [];
  const audit = audits.find((a) => a.id === auditId) ?? audits[0];

  const brief = useMemo(
    () => (audit ? buildBrief(audit, building) : null),
    [audit, building],
  );

  if (!building || !audit || !brief) {
    return (
      <div className="space-y-6">
        <SampleData />
        <div className="panel p-8 text-center">
        <p className="text-mist">
          A brief is generated from a saved audit. Run a scan and save it to the
          portfolio first, or load the worked example above.
        </p>
        <Link
          href="/scan"
          className="mt-4 inline-block border border-cyan bg-cyan/10 px-4 py-2 font-mono text-[0.75rem] tracking-wider text-cyan transition-colors hover:bg-cyan/20"
        >
          go to the scanner →
        </Link>
        </div>
      </div>
    );
  }

  const dated = new Date(audit.at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    /* On a wide screen the sheet is a document and must not grow with the
       viewport - long measure is exactly what makes a brief unreadable. So the
       spare width goes to the controls instead, which move into a sticky rail
       beside it rather than leaving half the page empty. Below lg it collapses
       back to the stacked order, and print flattens it (see .brief-layout). */
    <div className="brief-layout space-y-6 lg:grid lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:space-y-0">
      {/* Controls. Dropped from print output entirely. */}
      <div className="no-print flex flex-wrap items-center gap-3 lg:sticky lg:top-20 lg:col-start-1 lg:row-start-1 lg:flex-col lg:items-stretch lg:gap-4">
        {audits.length > 1 && (
          <label className="flex items-center gap-2 lg:flex-col lg:items-start lg:gap-1.5">
            <span className="mono-label">audit</span>
            <select
              value={audit.id}
              onChange={(e) => setAuditId(e.target.value)}
              className="w-full max-w-full border border-line bg-surface2 px-3 py-2 text-sm text-fog outline-none focus:border-cyan"
            >
              {audits.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.at).toLocaleDateString()} · {a.areas.join(", ") || "no areas"}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() => window.print()}
          className="border border-cyan bg-cyan/10 px-4 py-2 font-mono text-[0.75rem] tracking-wider text-cyan transition-colors hover:bg-cyan/20"
        >
          print / save as PDF
        </button>
        <span className="font-mono text-[0.72rem] text-dim">
          Prints as black on white, one page where it fits.
        </span>
      </div>

      {/* Placed explicitly rather than by source order: the controls beside it are
          display:none in print, and an auto-placed article would then slide into
          the narrow first column instead of the wide one. */}
      <article className="print-sheet panel space-y-8 p-6 lg:col-start-2 lg:row-start-1 sm:p-10">
        {/* Masthead */}
        <header className="space-y-3 border-b border-line pb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="mono-label text-cyan">energy waste brief</span>
            <span className="font-mono text-[0.72rem] text-dim">{dated}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fog sm:text-3xl">
            {brief.buildingName}
          </h1>
          <p className="max-w-[60ch] text-base leading-relaxed text-mist">{headline(brief)}</p>
        </header>

        {/* The ask, as four numbers. */}
        <section className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
          <Cell label="wasted per year" value={fmtMoneyFull(brief.annualWaste)} tone="ember" />
          <Cell label="recoverable" value={fmtMoneyFull(brief.totalRecoverable)} tone="lime" />
          <Cell
            label="up front"
            value={brief.totalUpfront > 0 ? fmtMoneyFull(brief.totalUpfront) : "nothing"}
          />
          <Cell
            label="pays back in"
            value={brief.paybackMonths === null ? "immediate" : fmtPayback(brief.paybackMonths)}
          />
        </section>

        {/* Free wins first: this is the half that can happen without a purchase
            order, and putting it second would bury the only part of the document
            that is actionable on the day it is read. */}
        {brief.free.items.length > 0 && (
          <Group
            eyebrow="costs nothing"
            title="Can be done this week"
            blurb={`${fmtMoneyFull(brief.free.annualSavings)} a year, with no purchase and no budget approval. These are scheduling and policy changes.`}
            items={brief.free.items}
            showCost={false}
          />
        )}

        {brief.capital.items.length > 0 && (
          <Group
            eyebrow={`${fmtMoneyFull(brief.capital.upfront)} up front`}
            title="Needs equipment"
            blurb={`${fmtMoneyFull(brief.capital.annualSavings)} a year once installed. Ordered by annual return, so the list can be cut from the bottom to fit a budget.`}
            items={brief.capital.items}
            showCost
          />
        )}

        {/* Context a decision-maker will ask for. */}
        <section className="grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
          <Fact label="carbon" value={`${fmtCo2(brief.co2KgPerYear)} CO₂e per year`} />
          <Fact
            label="plausible range"
            value={`${fmtMoneyFull(brief.annualWasteLow)} – ${fmtMoneyFull(brief.annualWasteHigh)}`}
          />
          <Fact
            label="confidence"
            value={`${brief.confidence}, weighted by dollars`}
          />
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

        {/* Provenance. A brief that cannot be traced back is not evidence. */}
        <footer className="space-y-4 border-t border-line pt-6">
          <div className="grid gap-2 text-[0.78rem] text-dim sm:grid-cols-2">
            <div>
              <span className="mono-label">areas covered</span>
              <p className="mt-1 text-mist">{audit.areas.join(", ") || "not recorded"}</p>
            </div>
            <div>
              <span className="mono-label">how it was read</span>
              <p className="mt-1 text-mist">
                {audit.mode === "live"
                  ? "Photographs read by a vision model"
                  : audit.mode === "mixed"
                    ? "Part photographs, part room profile"
                    : "Room profile estimate, no photograph read"}
                {" · "}
                {audit.engine}
              </p>
            </div>
          </div>
          <p className="text-[0.75rem] leading-relaxed text-dim">
            Device wattages come from a published catalogue; hours from this
            building&apos;s schedule; price per kWh from{" "}
            {building.bill ? "a utility bill entered for this building" : "a published state average"}.
            The full derivation for every figure above is at /methodology.
          </p>

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

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ember" | "lime";
}) {
  const color = tone === "ember" ? "text-ember" : tone === "lime" ? "text-lime" : "text-fog";
  return (
    <div className="bg-surface px-4 py-4">
      <div className="mono-label">{label}</div>
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

function Group({
  eyebrow,
  title,
  blurb,
  items,
  showCost,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  items: BriefItem[];
  showCost: boolean;
}) {
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
              <Th>what</Th>
              <Th>where</Th>
              <Th align="right">saves / yr</Th>
              {showCost && <Th align="right">cost</Th>}
              {showCost && <Th align="right">payback</Th>}
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
                    {i.confidence === "low" && (
                      <span className="ml-2 text-amber">low confidence</span>
                    )}
                  </div>
                </td>
                <td className="py-3 pr-4 text-[0.82rem] text-mist">{i.areas.join(", ")}</td>
                <td className="py-3 pr-4 text-right tabular-nums text-lime">
                  {fmtMoneyFull(i.annualSavings)}
                </td>
                {showCost && (
                  <td className="py-3 pr-4 text-right tabular-nums text-mist">
                    {fmtMoneyFull(i.fixCost)}
                  </td>
                )}
                {showCost && (
                  <td className="py-3 text-right tabular-nums text-mist">
                    {i.paybackMonths === null ? "—" : fmtPayback(i.paybackMonths)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`pb-2 font-mono text-[0.68rem] font-normal tracking-wider text-dim uppercase ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}
