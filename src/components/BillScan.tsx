"use client";

// Reading a bill off a photograph.
//
// The vision model does the squinting; the person does the deciding. Nothing
// is saved until every figure has been shown, with the model's confidence and
// its list of doubts, and the person has pressed "use these". A bill photo
// leaves the device only in Enhanced mode, and the panel says so before the
// file picker opens.

import { useRef, useState } from "react";
import { useEngine, describeAnalyzeError } from "@/lib/engine";
import { readPhotoFile } from "@/lib/media";
import type { BillRead } from "@/lib/bill";
import type { UtilityBill } from "@/lib/calibration";

type Read = BillRead & { engine?: string };

export function BillScan({ onAccept }: { onAccept: (bill: UtilityBill) => void }) {
  const engine = useEngine();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  // The person can correct a misread figure before accepting it.
  const [draft, setDraft] = useState<{ kwh: string; dollars: string; days: string; periodEnd: string } | null>(null);

  const canScan = engine.mode === "enhanced" && !engine.offline;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setRead(null);
    try {
      const photo = await readPhotoFile(file, 1600);
      const res = await fetch("/api/bill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: photo.dataUrl }) });
      const body = (await res.json().catch(() => null)) as Read | null;
      if (!res.ok || !body) {
        setError(describeAnalyzeError(res.status, body as { error?: string; code?: string } | null));
        return;
      }
      setRead(body);
      setDraft({
        kwh: body.kwh !== undefined ? String(Math.round(body.kwh)) : "",
        dollars: body.dollars !== undefined ? body.dollars.toFixed(2) : "",
        days: body.days !== undefined ? String(body.days) : "",
        periodEnd: body.periodEnd ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That picture couldn't be read.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const kwh = draft ? Number(draft.kwh) : 0;
  const dollars = draft ? Number(draft.dollars) : 0;
  const days = draft ? Number(draft.days) : 0;
  const complete = kwh > 0 && dollars > 0 && days > 0;
  const rate = complete ? dollars / kwh : null;

  return (
    <div className="rounded-2xl border border-line bg-surface2/40 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="mono-label">read a bill photo</span>
          <p className="mt-0.5 text-[0.76rem] leading-relaxed text-dim">
            {canScan
              ? "The bill photo is sent to the cloud model once, read, and not stored. You confirm every figure before it is saved."
              : engine.offline
                ? "Offline: a bill can only be typed in until the connection is back."
                : "Bill reading needs Enhanced (cloud) mode. In On-device mode, type the three figures in above instead."}
          </p>
        </div>
        <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Choose a photo of an electricity bill" />
        <button
          type="button"
          disabled={!canScan || busy}
          onClick={() => input.current?.click()}
          className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[0.78rem] text-fog transition-colors hover:border-cyan disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Reading…" : "Choose photo"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[0.78rem] leading-relaxed text-amber">
          {error}
        </p>
      )}

      {read && draft && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[0.8rem] text-fog">{read.isBill ? `Read${read.utility ? ` from ${read.utility}` : ""}` : "Not clearly a bill"}</span>
            <span className="font-mono text-[0.68rem] text-dim">
              model confidence {Math.round(read.confidence * 100)}%{read.engine ? ` · ${read.engine}` : ""}
            </span>
          </div>

          {read.issues.length > 0 && (
            <ul className="space-y-1 text-[0.76rem] leading-relaxed text-amber">
              {read.issues.map((i) => (
                <li key={i}>· {i}</li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            <Num label="kWh billed" value={draft.kwh} onChange={(v) => setDraft({ ...draft, kwh: v })} />
            <Num label="Total charged ($)" value={draft.dollars} step="0.01" onChange={(v) => setDraft({ ...draft, dollars: v })} />
            <Num label="Days in period" value={draft.days} onChange={(v) => setDraft({ ...draft, days: v })} />
            <label className="block">
              <span className="mono-label">Period ended</span>
              <input
                type="date"
                value={draft.periodEnd}
                onChange={(e) => setDraft({ ...draft, periodEnd: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {rate !== null ? (
              <span className="font-mono text-[0.74rem] text-lime tabular-nums">
                blended rate ${rate.toFixed(3)}/kWh
                {read.printedRate !== undefined && ` · printed energy rate ${(read.printedRate / 100).toFixed(3)}`}
              </span>
            ) : (
              <span className="text-[0.74rem] text-dim">Fill in the blank figures from the paper, or cancel.</span>
            )}
            <span className="grow" />
            <button type="button" onClick={() => setRead(null)} className="text-[0.74rem] text-dim underline-offset-4 hover:text-fog hover:underline">
              Cancel
            </button>
            <button
              type="button"
              disabled={!complete}
              onClick={() => {
                onAccept({ kwh, dollars, days, periodEnd: draft.periodEnd });
                setRead(null);
              }}
              className="rounded-full bg-fog px-3.5 py-1.5 text-[0.78rem] font-medium text-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Use these figures
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Num({ label, value, step, onChange }: { label: string; value: string; step?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono text-sm text-fog outline-none focus:border-cyan"
      />
    </label>
  );
}
