"use client";

// One photo or video in the scan list. Collapsed, it is a single row: thumbnail,
// what it costs a year, how many devices, and tags for when and where it was
// taken. Opened, it shows the details a person can correct (room type, their own
// wattage or hours, a note for the cloud model) and the actions: read it again,
// or remove it. While it is being read, the row shows which stage it is on.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { readTime, type Capture, type CaptureDetails } from "@/lib/capture";
import { fmtMoney } from "@/lib/energy";
import { ROOM_TYPES } from "@/lib/rooms";
import type { WeeklySchedule } from "@/lib/schedule";
import { Icon } from "./icons";

export function CaptureCard({
  capture: c,
  cost,
  devices,
  schedule,
  defaultOpen,
  compact,
  onDetails,
  onPatch,
  onReanalyze,
  onUseOnDevice,
  onRemove,
}: {
  capture: Capture;
  cost: number;
  devices: number;
  schedule?: WeeklySchedule;
  defaultOpen?: boolean;
  /** Shown under the viewer, which already shows the picture: no thumbnail. */
  compact?: boolean;
  onDetails: (d: Partial<CaptureDetails>) => void;
  onPatch: (p: Partial<Capture>) => void;
  onReanalyze: () => void;
  /**
   * Offered only on a capture that still ended in an error but has an on-device
   * reading. A cloud model that is busy or down no longer ends in an error: the
   * on-device reading is used automatically (Scanner.tsx), so this is rare.
   */
  onUseOnDevice?: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [sentNote, setSentNote] = useState(c.details.note ?? "");
  // When it was taken, against the building's hours: "after hours" is the case the app is for.
  const time = readTime(c.meta.takenAt, schedule);
  const working = c.status === "working" || c.status === "pending";
  // A video shows its first frame with the on-device boxes drawn in.
  const thumb = c.keyframes?.[0]?.annotated ?? c.dataUrl;
  // A note typed after the reading only reaches the model on a re-read, so the card offers one.
  const noteChanged = (c.details.note ?? "") !== sentNote && c.status === "done";

  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={compact ? "relative overflow-hidden border-t border-line" : "panel relative overflow-hidden"}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 p-2.5 text-left">
        <div className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface2 ${compact ? "hidden" : ""}`}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-dim">
              <Icon name={c.kind === "video" ? "video" : "camera"} />
            </div>
          )}
          {c.kind === "video" && (
            <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 font-mono text-[0.6rem] text-white">
              {c.duration ? `${Math.round(c.duration)}s` : "video"}
            </span>
          )}
          {working && <span className="absolute inset-x-0 top-0 h-px bg-sodium scan-line" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[0.92rem] font-medium text-fog">{compact ? "Details for this picture" : c.name}</span>
            {c.status === "done" && c.result && (
              <span
                className={`shrink-0 rounded-full px-1.5 py-px text-[0.64rem] font-medium ${
                  c.result.mode === "enhanced" ? "bg-cyan/10 text-cyan" : "bg-lime/10 text-lime"
                }`}
              >
                {c.result.mode === "enhanced" ? "cloud" : "on-device"}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[0.78rem] text-mist">
            {c.status === "error" ? (
              <span className="text-ember">{c.error}</span>
            ) : working ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-sodium pulse-dot" aria-hidden="true" />
                {c.stage ?? "Queued"}…
              </span>
            ) : (
              <>
                <span className="font-mono font-semibold text-fog">{fmtMoney(cost)}/yr</span>
                <span className="text-dim"> · {devices ? `${devices} device${devices > 1 ? "s" : ""}` : "nothing powered"}</span>
              </>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {time && (
              <Tag tone={time.afterHours === false ? "amber" : time.afterHours ? "lime" : undefined}>
                {time.afterHours === null ? time.label.split(",")[0] : time.afterHours ? "after hours" : "open hours"}
              </Tag>
            )}
            {c.geo?.place && <Tag>{c.geo.place}</Tag>}
            {c.meta.lighting === "on" && <Tag>lights on</Tag>}
            {(c.details.watts || c.details.hoursPerDay) && <Tag tone="cyan">your figures</Tag>}
          </div>
        </div>
        <Icon name="chevron" className={`h-4 w-4 shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {working && c.progress !== undefined && (
        <div className="mx-2.5 mb-2.5 h-1 overflow-hidden rounded-full bg-surface2">
          <motion.div className="h-full bg-sodium shimmer" animate={{ width: `${Math.round(c.progress * 100)}%` }} transition={{ ease: "easeOut", duration: 0.5 }} />
        </div>
      )}
      <AnimatePresence>
        {c.status === "done" && c.result && (
          <motion.div
            key="done"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 rounded-2xl bg-lime/15"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-4 border-t border-line px-3 pb-3 pt-3">
              {c.kind === "video" && c.keyframes?.length ? (
                <div>
                  <div className="mono-label">keyframes the AI read</div>
                  <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
                    {c.keyframes.map((k) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={k.t} src={k.annotated ?? k.dataUrl} alt={`Frame at ${k.t.toFixed(1)}s`} className="h-20 w-auto shrink-0 rounded-lg" />
                    ))}
                  </div>
                  {c.videoUrl && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[0.78rem] text-cyan">Play clip</summary>
                      <video src={c.videoUrl} controls playsInline className="mt-2 w-full rounded-xl bg-black" />
                    </details>
                  )}
                </div>
              ) : null}

              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="mono-label">what you know · optional</span>
                  <span className="text-[0.68rem] text-dim">re-prices instantly</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[0.72rem] text-dim">Kind of room</span>
                    <select
                      value={c.details.roomType ?? ""}
                      onChange={(e) => onDetails({ roomType: e.target.value || undefined })}
                      className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fog outline-none focus:border-cyan sm:text-[0.9rem]"
                    >
                      <option value="">Not set: building default</option>
                      {ROOM_TYPES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[0.72rem] text-dim">After hours, things seen on</span>
                    <select
                      value={c.details.afterHours ?? ""}
                      onChange={(e) => onDetails({ afterHours: (e.target.value || undefined) as "on" | "standby" | undefined })}
                      className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fog outline-none focus:border-cyan sm:text-[0.9rem]"
                    >
                      <option value="">{time?.afterHours === false ? "Default: go to standby (seen in open hours)" : "Default: stay as seen"}</option>
                      <option value="on">stay on</option>
                      <option value="standby">go to standby</option>
                    </select>
                  </label>
                  <NumberField
                    label="Watts, main device"
                    suffix="W"
                    placeholder="AI estimates"
                    value={c.details.watts}
                    onChange={(v) => onDetails({ watts: v })}
                  />
                  <NumberField
                    label="Hours on / day"
                    suffix="h"
                    placeholder="from schedule"
                    max={24}
                    value={c.details.hoursPerDay}
                    onChange={(v) => onDetails({ hoursPerDay: v })}
                  />
                </div>
                <label className="mt-2 block">
                  <span className="text-[0.72rem] text-dim">Note for the AI</span>
                  <input
                    value={c.details.note ?? ""}
                    onChange={(e) => onDetails({ note: e.target.value || undefined })}
                    placeholder="e.g. Dell 24-inch monitors, lab closed weekends"
                    maxLength={200}
                    className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fog outline-none sm:text-[0.9rem] placeholder:text-dim/70 focus:border-cyan"
                  />
                </label>
                <p className="mt-1.5 text-[0.72rem] leading-relaxed text-dim">
                  The room sets how many hours a day each device is typically in use. Leave the rest blank and the model reads each device&apos;s
                  wattage from what it can see, blended with published ranges, the time it was taken and where.
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[0.78rem]">
                <Meta label="Taken">
                  {time ? (
                    <>
                      {time.label}
                      {c.meta.takenAt && c.origin === "upload" ? <span className="text-dim"> · from photo</span> : null}
                    </>
                  ) : (
                    "unknown"
                  )}
                </Meta>
                <Meta label="Location">
                  {c.geo ? (
                    <>
                      {c.geo.place ?? "found"}
                      <span className="block text-dim">
                        ${c.geo.ratePerKwh.toFixed(3)}/kWh · {c.geo.utilityName ?? c.geo.rateSource}
                      </span>
                    </>
                  ) : c.meta.lat !== undefined ? (
                    "looking up…"
                  ) : (
                    "not in file"
                  )}
                </Meta>
                {(c.meta.make || c.meta.model) && <Meta label="Camera">{[c.meta.make, c.meta.model].filter(Boolean).join(" ")}</Meta>}
                {c.meta.brightness !== undefined && (
                  <Meta label="Lighting">
                    {c.meta.lighting === "on" ? "fixtures lit" : c.meta.lighting === "off" ? "dark" : "unclear"}
                    <span className="text-dim"> · {Math.round((c.meta.brightness / 255) * 100)}% bright</span>
                  </Meta>
                )}
                {c.meta.width ? (
                  <Meta label="Size">
                    {c.meta.width}×{c.meta.height}
                    {c.meta.bytes ? <span className="text-dim"> · {(c.meta.bytes / 1e6).toFixed(1)} MB</span> : null}
                  </Meta>
                ) : null}
                {c.result && <Meta label="Engine">{c.result.engine}</Meta>}
              </dl>

              {c.result?.notice && <p className="rounded-xl bg-amber/[0.08] px-3 py-2 text-[0.76rem] leading-relaxed text-amber">{c.result.notice}</p>}

              {c.status === "error" && (
                <div role="alert" className="rounded-xl border border-ember/30 bg-ember/[0.06] px-3 py-2.5">
                  <p className="text-[0.8rem] font-medium text-ember">This picture was not read.</p>
                  <p className="mt-0.5 text-[0.76rem] leading-relaxed text-mist">{c.error}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={onReanalyze} className="inline-flex items-center gap-1.5 rounded-full bg-fog px-3 py-1.5 text-[0.76rem] font-medium text-ink">
                      <Icon name="refresh" className="h-3.5 w-3.5" />
                      Try again
                    </button>
                    {onUseOnDevice && (
                      <button onClick={onUseOnDevice} className="rounded-full border border-line px-3 py-1.5 text-[0.76rem] text-mist hover:border-lime hover:text-lime">
                        Use the on-device reading instead
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={c.name}
                  onChange={(e) => onPatch({ name: e.target.value })}
                  aria-label="Name"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-base text-fog outline-none focus:border-cyan sm:text-[0.85rem]"
                />
                {c.origin !== "manual" && (noteChanged || c.result?.mode === "on-device") && (
                  <button
                    onClick={() => {
                      setSentNote(c.details.note ?? "");
                      onReanalyze();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-fog px-3.5 py-2 text-[0.8rem] font-medium text-ink"
                  >
                    <Icon name="refresh" className="h-4 w-4" />
                    Re-analyse
                  </button>
                )}
                <button onClick={onRemove} className="rounded-full px-3 py-2 text-[0.8rem] text-dim hover:text-ember">
                  Remove
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/** A small rounded label on the collapsed row: after hours, the place, lights on. */
function Tag({ tone, children }: { tone?: "lime" | "amber" | "cyan"; children: React.ReactNode }) {
  const cls =
    tone === "lime" ? "bg-lime/10 text-lime" : tone === "amber" ? "bg-amber/10 text-amber" : tone === "cyan" ? "bg-cyan/10 text-cyan" : "bg-surface2 text-mist";
  return <span className={`rounded-full px-2 py-px text-[0.66rem] font-medium ${cls}`}>{children}</span>;
}

/** One fact in the opened card's details grid, with its label above. */
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] text-dim">{label}</dt>
      <dd className="truncate text-fog">{children}</dd>
    </div>
  );
}

/**
 * A number the person knows better than the catalogue (watts, hours a day). Empty,
 * zero or nonsense clears it rather than storing a bad value, and `max` caps it.
 */
function NumberField({
  label,
  suffix,
  placeholder,
  value,
  max,
  onChange,
}: {
  label: string;
  suffix: string;
  placeholder: string;
  value: number | undefined;
  max?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.72rem] text-dim">{label}</span>
      <span className="mt-1 flex items-center rounded-xl border border-line bg-surface focus-within:border-cyan">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step="any"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(Number.isFinite(v) && v > 0 ? (max ? Math.min(max, v) : v) : undefined);
          }}
          className="w-full min-w-0 bg-transparent px-3 py-2.5 font-mono text-base text-fog outline-none sm:text-[0.9rem] placeholder:font-sans placeholder:text-[0.8rem] placeholder:text-dim/70"
        />
        <span className="pr-3 font-mono text-[0.8rem] text-dim">{suffix}</span>
      </span>
    </label>
  );
}
