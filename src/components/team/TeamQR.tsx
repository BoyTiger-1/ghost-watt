"use client";

// A QR code for the team link, drawn as one SVG path so it stays crisp on a
// projector at any size. Dark modules on a light tile in both themes, because
// that is what phone cameras read best.

import { useMemo } from "react";
import qrcode from "qrcode-generator";

export function TeamQR({ value, className = "" }: { value: string; className?: string }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
    return { d, n };
  }, [value]);

  const pad = 2;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`}
      className={`rounded-xl bg-[#fbf9f5] ${className}`}
      role="img"
      aria-label={`QR code for ${value}`}
      shapeRendering="crispEdges"
    >
      <path d={d} fill="#1c1b18" />
    </svg>
  );
}
