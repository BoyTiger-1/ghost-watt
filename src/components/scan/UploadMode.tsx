"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

/**
 * Pick photos or videos. On a phone this is one big button that opens the
 * system picker (which already offers the gallery and the camera); dragging and
 * pasting only exist on a desktop, so only a desktop is told about them.
 */
export function UploadMode({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // Paste a screenshot or a copied photo straight in.
  useEffect(() => {
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

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files].filter(accepted);
        if (files.length) onFiles(files);
      }}
      className={`relative overflow-hidden rounded-[1.5rem] border-2 border-dashed transition-colors ${
        over ? "border-cyan bg-cyan/[0.06]" : "border-line2 bg-surface"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{ background: "radial-gradient(60% 80% at 50% 0%, rgba(239,157,46,0.12), transparent 70%)" }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative flex min-h-[300px] w-full flex-col items-center justify-center gap-4 px-6 py-12 text-center sm:min-h-[380px]"
      >
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-fog text-ink shadow-[0_12px_30px_-12px_rgba(28,27,24,0.5)]">
          <Icon name="upload" className="h-7 w-7" />
        </span>
        <span>
          <span className="block text-[1.15rem] font-semibold text-fog">
            <span className="sm:hidden">Choose photos or videos</span>
            <span className="hidden sm:inline">Drop photos or videos here</span>
          </span>
          <span className="mt-1.5 block text-[0.9rem] text-mist">
            <span className="hidden sm:inline">or click to browse · paste works too · </span>
            JPG, PNG, MP4, MOV, WebM
          </span>
        </span>
        <span className="mt-1 flex flex-wrap justify-center gap-2 text-[0.75rem] text-dim">
          <Chip icon="pin">Photo GPS sets your local rate</Chip>
          <Chip icon="clock">Timestamp checks after-hours</Chip>
          <Chip icon="video">Videos are audited as one walkthrough</Chip>
        </span>
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

function accepted(f: File) {
  return f.type.startsWith("image/") || f.type.startsWith("video/") || /\.(hei[cf]|mov|mp4|webm)$/i.test(f.name);
}

function Chip({ icon, children }: { icon: "pin" | "clock" | "video"; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface2 px-2.5 py-1">
      <Icon name={icon} className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}
