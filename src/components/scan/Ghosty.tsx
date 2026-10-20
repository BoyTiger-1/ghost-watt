"use client";

// Ghosty Insights, on the scan results: a headline, the few moves that matter
// most, a before-you-leave checklist, and a box to ask about this scan. It runs
// by itself once a scan settles, and remembers its answer for the same figures.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { contextKey, rulesReport, type GhostyContext, type GhostyReport, type InsightKind } from "@/lib/ghosty";
import { fmtMoneyFull } from "@/lib/energy";
import { Mark } from "../home/HomeNav";

const KIND: Record<InsightKind, { label: string; tint: string }> = {
  habit: { label: "Free", tint: "bg-lime/[0.12] text-lime" },
  quick_win: { label: "Quick win", tint: "bg-amber/[0.12] text-amber" },
  upgrade: { label: "Upgrade", tint: "bg-cyan/[0.12] text-cyan" },
  schedule: { label: "Routine", tint: "bg-cyan/[0.12] text-cyan" },
  watch: { label: "Look closer", tint: "bg-ember/[0.12] text-ember" },
};

const SUGGESTIONS = [
  "What should I fix first with $50?",
  "What can we do tonight for free?",
  "Write a short note to our principal",
  "Why is the top item so expensive?",
];

type Phase = "idle" | "loading" | "ready";

function cacheGet(key: string): GhostyReport | null {
  try {
    const v = sessionStorage.getItem("ghosty:" + key);
    return v ? (JSON.parse(v) as GhostyReport) : null;
  } catch {
    return null;
  }
}
function cacheSet(key: string, r: GhostyReport) {
  try {
    sessionStorage.setItem("ghosty:" + key, JSON.stringify(r));
  } catch {
    // Private mode: it just asks again next time.
  }
}

async function ask(ctx: GhostyContext, question?: string): Promise<{ report: GhostyReport; note?: string }> {
  const key = contextKey(ctx, question);
  const hit = cacheGet(key);
  if (hit) return { report: hit };
  try {
    const res = await fetch("/api/ghosty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: ctx, question }),
    });
    const json = (await res.json()) as { report?: GhostyReport; note?: string };
    if (!json.report) throw new Error("empty");
    if (json.report.source === "ai") cacheSet(key, json.report);
    return { report: json.report, note: json.note };
  } catch {
    return { report: rulesReport(ctx, question), note: "Couldn't reach Ghosty, so these come from the built-in rules." };
  }
}

export function Ghosty({ context, working }: { context: GhostyContext; working: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<GhostyReport | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<{ q: string; a: string | null; loading: boolean } | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const key = useMemo(() => contextKey(context), [context]);
  const latest = useRef(key);

  // Run once the scan has settled: not while pictures are still being read,
  // and not on every keystroke of an edit.
  useEffect(() => {
    latest.current = key;
    if (working || !context.devices.length) return;
    const t = setTimeout(async () => {
      setPhase("loading");
      const r = await ask(context);
      if (latest.current !== key) return;
      setReport(r.report);
      setNote(r.note);
      setTicked(new Set());
      setPhase("ready");
    }, 900);
    return () => clearTimeout(t);
  }, [key, working, context]);

  const submit = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion("");
    setAsked({ q: text, a: null, loading: true });
    const r = await ask(context, text);
    setAsked({ q: text, a: r.report.answer ?? "Ghosty couldn't answer that from this scan.", loading: false });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the text is on screen.
    }
  };

  if (!context.devices.length) return null;

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6" aria-label="Ghosty Insights">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(239,157,46,0.16),transparent)]" />

      <header className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.span
            animate={phase === "loading" ? { y: [0, -4, 0] } : { y: 0 }}
            transition={phase === "loading" ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : {}}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-fog/[0.06]"
          >
            <Mark className="h-6 w-[1.14rem]" />
          </motion.span>
          <div>
            <h2 className="text-[1.08rem] font-semibold text-fog">Ghosty Insights</h2>
            <p className="text-[0.78rem] text-dim">
              {phase === "loading" ? "Reading your scan…" : report?.source === "ai" ? "Written by AI from this scan's figures" : "From the built-in rules"}
            </p>
          </div>
        </div>
        {report && (
          <span className="rounded-full border border-line px-2.5 py-1 text-[0.72rem] text-dim" title={note}>
            {report.source === "ai" ? `AI${report.model ? ` · ${report.model}` : ""}` : "Rules"}
          </span>
        )}
      </header>

      <AnimatePresence mode="wait">
        {phase !== "ready" || !report ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative mt-5 space-y-3">
            <div className="h-6 w-4/5 animate-pulse rounded-lg bg-surface2" />
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface2/70" />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="relative">
            <p className="font-editorial mt-4 text-[1.5rem] leading-[1.2] text-fog sm:text-[1.7rem]">{report.headline}</p>
            {note && <p className="mt-1.5 text-[0.76rem] text-dim">{note}</p>}

            {report.insights.length > 0 && (
              <ul className="mt-5 grid gap-3 md:grid-cols-2">
                {report.insights.map((ins, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 * i }}
                    className="rounded-2xl border border-line bg-surface2/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${KIND[ins.kind].tint}`}>{KIND[ins.kind].label}</span>
                      {ins.savings !== null && <span className="font-mono text-[0.85rem] font-semibold text-lime">{fmtMoneyFull(ins.savings)}/yr</span>}
                    </div>
                    <h3 className="mt-2 text-[0.95rem] font-semibold text-fog">{ins.title}</h3>
                    <p className="mt-1 text-[0.86rem] leading-relaxed text-mist">{ins.detail}</p>
                  </motion.li>
                ))}
              </ul>
            )}

            {report.checklist.length > 0 && (
              <div className="mt-5">
                <h3 className="text-[0.85rem] font-medium text-fog">Before you leave</h3>
                <ul className="mt-2 space-y-1.5">
                  {report.checklist.map((c, i) => {
                    const on = ticked.has(i);
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() =>
                            setTicked((s) => {
                              const n = new Set(s);
                              if (n.has(i)) n.delete(i);
                              else n.add(i);
                              return n;
                            })
                          }
                          aria-pressed={on}
                          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[0.88rem] transition-colors hover:bg-fog/[0.04]"
                        >
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${on ? "border-lime bg-lime text-ink" : "border-line2"}`}>
                            {on && (
                              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                                <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span className={on ? "text-dim line-through" : "text-mist"}>{c}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ask */}
      <div className="relative mt-6 border-t border-line pt-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(question);
          }}
          className="flex gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            placeholder="Ask Ghosty about this scan…"
            aria-label="Ask Ghosty about this scan"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-[0.92rem] text-fog outline-none placeholder:text-dim focus:border-cyan"
          />
          <button
            type="submit"
            disabled={!question.trim() || asked?.loading}
            className="shrink-0 rounded-full bg-fog px-5 py-2.5 text-[0.9rem] font-medium text-ink transition-opacity hover:bg-fog/85 disabled:opacity-40"
          >
            Ask
          </button>
        </form>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void submit(s)}
              disabled={asked?.loading}
              className="rounded-full border border-line px-3 py-1 text-[0.78rem] text-mist transition-colors hover:border-fog/30 hover:text-fog disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {asked && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-2xl bg-surface2/50 p-4">
              <p className="text-[0.8rem] text-dim">You asked: {asked.q}</p>
              {asked.loading ? (
                <div className="mt-2 space-y-2">
                  <div className="h-3.5 w-11/12 animate-pulse rounded bg-surface2" />
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface2" />
                </div>
              ) : (
                <>
                  <p className="mt-1.5 whitespace-pre-line text-[0.92rem] leading-relaxed text-fog">{asked.a}</p>
                  {asked.a && (
                    <button type="button" onClick={() => void copy(asked.a!)} className="mt-2 text-[0.78rem] text-cyan hover:underline">
                      {copied ? "Copied" : "Copy"}
                    </button>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <p className="mt-3 text-[0.72rem] leading-relaxed text-dim">
          Ghosty only sees this scan&apos;s figures, never your photos, and every dollar it quotes is checked against them. It can still be wrong; check
          before you buy anything.
        </p>
      </div>
    </section>
  );
}
