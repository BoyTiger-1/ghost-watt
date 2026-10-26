"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Icon } from "./icons";

/**
 * Pick photos or videos. One card: what to add on the left, and on the right a
 * small drawing of what happens to it, a room with its devices being picked
 * out and priced. Drop anywhere on the card, click, or paste. On a phone the
 * button opens the system picker, which already offers the camera and gallery.
 */
export function UploadMode({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const open = () => inputRef.current?.click();

  usePastedFiles(onFiles);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files].filter(accepted);
        if (files.length) onFiles(files);
      }}
      className={`panel relative grid overflow-hidden transition-[box-shadow] duration-300 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] ${
        over ? "shadow-[0_0_0_2px_var(--color-fog)]" : ""
      }`}
    >
      {/* what to do */}
      <div className="flex flex-col justify-between gap-8 p-6 sm:p-9">
        <div>
          <h2 className="font-editorial text-[2.3rem] leading-[1.02] text-fog sm:text-[2.9rem]">
            Drop in a room.
            <br />
            <span className="italic text-dusk">We&apos;ll find what&apos;s left on.</span>
          </h2>
          <p className="mt-4 max-w-[34ch] text-[0.95rem] leading-relaxed text-mist">
            A photo or a short walk-through video of any room. One taken after everyone has left shows the most.
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="button"
              onClick={open}
              className="group inline-flex items-center gap-2.5 rounded-full bg-fog py-3 pl-5 pr-4 text-[0.95rem] font-medium text-ink transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="sm:hidden">Choose photos or videos</span>
              <span className="hidden sm:inline">Choose files</span>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-ink/15 transition-transform group-hover:-translate-y-0.5">
                <Icon name="upload" className="h-3.5 w-3.5" />
              </span>
            </button>
            <span className="hidden text-[0.84rem] text-dim sm:inline">
              or drag them here, or paste with <Kbd>Ctrl</Kbd> <Kbd>V</Kbd>
            </span>
          </div>
          <p className="mt-5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-dim">JPG · PNG · HEIC · MP4 · MOV · WebM</p>
        </div>
      </div>

      {/* what happens to it */}
      <button type="button" onClick={open} aria-label="Choose photos or videos" className="relative m-2 aspect-[10/7] self-center overflow-hidden rounded-[1.1rem] md:m-2.5">
        <Scene />
        <AnimatePresence>
          {over && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]"
            >
              <span className="rounded-full bg-white px-4 py-2 text-[0.9rem] font-medium text-black">Let go to add</span>
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].filter(accepted);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** A room after hours, drawn in a few lines, with its devices picked out one by one. */
function Scene() {
  const reduce = useReducedMotion();
  const marks = [
    { x: 14.5, y: 29.5, w: 35, h: 32.5, color: "#ff6a5c", label: "Monitor · $59/yr", delay: 0.4 },
    { x: 72, y: 31, w: 15, h: 38, color: "#ffb24d", label: "Lamp · $12/yr", delay: 0.9 },
    { x: 52, y: 62.5, w: 24, h: 7.5, color: "#7d8799", label: "Laptop · off", delay: 1.4 },
  ];
  return (
    <div className="absolute inset-0 bg-[#141518]">
      <svg viewBox="0 0 400 280" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="up-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1d2026" />
            <stop offset="1" stopColor="#141518" />
          </linearGradient>
          <radialGradient id="up-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#7fa2ff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#7fa2ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="up-lamp" cx="0.5" cy="0" r="0.8">
            <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="280" fill="url(#up-wall)" />
        {/* window, night outside */}
        <rect x="236" y="26" width="120" height="84" rx="3" fill="#0e1015" stroke="#2a2e37" />
        <path d="M296 26v84M236 68h120" stroke="#2a2e37" />
        <circle cx="330" cy="44" r="5" fill="#d9dbe0" opacity="0.5" />
        {/* desk */}
        <path d="M20 196h360" stroke="#3a3f4a" strokeWidth="3" strokeLinecap="round" />
        <path d="M44 198v62M356 198v62" stroke="#2c3038" strokeWidth="3" strokeLinecap="round" />
        {/* monitor, left on */}
        <ellipse cx="128" cy="124" rx="90" ry="70" fill="url(#up-glow)" />
        <rect x="62" y="86" width="132" height="84" rx="5" fill="#222733" stroke="#3a4152" strokeWidth="2" />
        <rect x="70" y="94" width="116" height="68" rx="2" fill="#4e6fd0" opacity="0.85" />
        <path d="M78 104h52M78 114h80M78 124h40" stroke="#c9d6ff" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
        <path d="M128 170v18M106 192h44" stroke="#3a4152" strokeWidth="3" strokeLinecap="round" />
        {/* desk lamp, on */}
        <path d="M300 194v-8h24v8" fill="#2c3038" />
        <path d="M312 186l-18-60 30-26" stroke="#4a505c" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M314 92l26 8-10 22-26-8z" fill="#4a505c" />
        <path d="M304 114l26 8 30 74H262z" fill="url(#up-lamp)" />
        {/* laptop, closed and off */}
        <path d="M212 194h88l-6-14h-76z" fill="#2c3038" stroke="#3a3f4a" />
      </svg>

      {/* a scan line sweeping down */}
      {!reduce && (
        <motion.div
          className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-white/[0.07] to-transparent"
          initial={{ top: "-20%" }}
          animate={{ top: "110%" }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
        />
      )}

      {/* devices being picked out */}
      {marks.map((m) => (
        <motion.div
          key={m.label}
          className="absolute"
          style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%` }}
          initial={reduce ? false : { opacity: 0, scale: 1.15 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: reduce ? 0 : m.delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <Brackets color={m.color} />
          <span className="absolute bottom-full left-0 mb-1 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[0.66rem] font-semibold text-black sm:text-[0.72rem]" style={{ background: m.color }}>
            {m.label}
          </span>
        </motion.div>
      ))}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-[0.76rem] text-white/80">
        <span>After hours · 3 devices found</span>
        <span className="font-mono text-white">$71/yr idle</span>
      </div>
    </div>
  );
}

function Brackets({ color }: { color: string }) {
  const s = { position: "absolute" as const, width: 12, height: 12, borderColor: color };
  return (
    <>
      <span className="absolute inset-0 rounded-[2px]" style={{ boxShadow: `inset 0 0 0 1px ${color}66` }} />
      <span style={{ ...s, left: -1, top: -1, borderLeftWidth: 2, borderTopWidth: 2 }} />
      <span style={{ ...s, right: -1, top: -1, borderRightWidth: 2, borderTopWidth: 2 }} />
      <span style={{ ...s, left: -1, bottom: -1, borderLeftWidth: 2, borderBottomWidth: 2 }} />
      <span style={{ ...s, right: -1, bottom: -1, borderRightWidth: 2, borderBottomWidth: 2 }} />
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-line2 bg-surface2 px-1.5 py-0.5 font-mono text-[0.72rem] text-mist">{children}</kbd>;
}

/** Paste a screenshot or a copied photo straight in. */
export function usePastedFiles(onFiles?: (files: File[]) => void) {
  useEffect(() => {
    if (!onFiles) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter(accepted);
      if (files.length) {
        e.preventDefault();
        onFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles]);
}

export function accepted(f: File) {
  return f.type.startsWith("image/") || f.type.startsWith("video/") || /\.(hei[cf]|mov|mp4|webm)$/i.test(f.name);
}
