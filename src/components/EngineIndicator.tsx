"use client";

// The one indicator for which path reads the picture.
//
// It replaces an "AI on/off" button that nobody could interpret. The pill says
// exactly one of three things - Enhanced (cloud), On-device, or Offline - and
// tapping it explains what that means for the photo and offers the single
// choice that exists: whether pictures may leave the device.

import { useEffect, useId, useRef, useState } from "react";
import { setEnginePreference, useEngine, type EngineMode } from "@/lib/engine";
import { useT } from "@/lib/i18n";

/** The pill's words in the current language; the English detail from the engine store is kept where it names the model. */
function words(engine: EngineMode, t: ReturnType<typeof useT>) {
  if (engine.offline) return { label: t("engine.offline"), detail: t("engine.offline.detail") };
  if (engine.mode === "enhanced") return { label: t("engine.enhanced"), detail: engine.detail };
  if (engine.checking) return { label: t("engine.checking"), detail: t("engine.checking.detail") };
  return { label: t("engine.ondevice"), detail: t("engine.ondevice.detail") };
}

export function EngineIndicator({ compact = false }: { compact?: boolean }) {
  const engine = useEngine();
  const t = useT();
  const w = words(engine, t);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tone = engine.offline
    ? { dot: "var(--color-ember)", text: "text-ember" }
    : engine.mode === "enhanced"
      ? { dot: "var(--color-cyan)", text: "text-fog" }
      : { dot: "var(--color-lime)", text: "text-fog" };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${t("engine.mode")}: ${w.label}. ${w.detail}`}
        className={`flex h-9 items-center gap-2 rounded-full border border-line bg-surface text-[0.8rem] transition-colors hover:border-line2 ${
          compact ? "w-9 justify-center" : "px-3"
        } ${tone.text}`}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${engine.checking ? "animate-pulse" : ""}`} style={{ background: engine.checking ? "var(--color-dim)" : tone.dot }} />
        {!compact && <span className="whitespace-nowrap">{w.label}</span>}
      </button>

      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={t("engine.mode")}
          className="panel absolute right-0 top-11 z-[70] w-[min(22rem,calc(100vw-2rem))] p-4 text-left shadow-[0_20px_50px_-20px_rgba(28,27,24,0.4)]"
        >
          <p className="text-[0.92rem] font-semibold text-fog">{w.label}</p>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-mist">{w.detail}</p>

          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <ModeRow
              name={t("engine.pick.enhanced")}
              what={t("engine.pick.enhanced.what")}
              checked={engine.state.preference === "enhanced"}
              disabled={!engine.enhancedAvailable}
              note={
                engine.enhancedAvailable
                  ? undefined
                  : engine.checking
                    ? t("engine.checking")
                    : engine.offline
                      ? t("engine.needs.connection")
                      : t("engine.not.configured")
              }
              onPick={() => setEnginePreference("enhanced")}
            />
            <ModeRow
              name={t("engine.pick.ondevice")}
              what={t("engine.pick.ondevice.what")}
              checked={engine.state.preference === "on-device"}
              onPick={() => setEnginePreference("on-device")}
            />
          </div>
          <p className="mt-3 text-[0.72rem] leading-relaxed text-dim">
            {t("engine.footnote")}{" "}
            <a href="/privacy" className="text-cyan underline-offset-2 hover:underline">
              {t("engine.privacy")}
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}

function ModeRow({
  name,
  what,
  checked,
  disabled,
  note,
  onPick,
}: {
  name: string;
  what: string;
  checked: boolean;
  disabled?: boolean;
  note?: string;
  onPick: () => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface2/70 ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
      <input type="radio" name="engine-mode" checked={checked} disabled={disabled} onChange={onPick} className="mt-1 accent-[var(--color-cyan)]" />
      <span className="min-w-0">
        <span className="block text-[0.86rem] font-medium text-fog">
          {name}
          {note && <span className="ml-2 text-[0.72rem] font-normal text-dim">{note}</span>}
        </span>
        <span className="block text-[0.76rem] leading-relaxed text-mist">{what}</span>
      </span>
    </label>
  );
}
