// Minimal geometric line-glyphs for each device category. Stroke = currentColor.

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const GLYPHS: Record<string, React.ReactNode> = {
  monitor: (<><rect x="3" y="4" width="18" height="12" {...P} /><path d="M9 20h6M12 16v4" {...P} /></>),
  desktop: (<><rect x="5" y="3" width="9" height="18" {...P} /><path d="M8 6h3M8 9h3" {...P} /><circle cx="9.5" cy="17" r="0.8" fill="currentColor" /></>),
  laptop: (<><rect x="5" y="5" width="14" height="9" {...P} /><path d="M3 18h18l-1-2H4z" {...P} /></>),
  projector: (<><rect x="3" y="8" width="14" height="8" {...P} /><circle cx="9" cy="12" r="2.2" {...P} /><path d="M19 9l2 1v4l-2 1" {...P} /></>),
  tv: (<><rect x="3" y="4" width="18" height="13" {...P} /><path d="M8 21h8" {...P} /></>),
  light: (<><path d="M9 17h6M10 20h4" {...P} /><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z" {...P} /></>),
  vending: (<><rect x="6" y="3" width="12" height="18" {...P} /><path d="M9 6h3M9 9h3M9 12h3" {...P} /><rect x="9" y="15" width="6" height="3" {...P} /></>),
  fridge: (<><rect x="6" y="3" width="12" height="18" {...P} /><path d="M6 10h12M9 6v2M9 13v3" {...P} /></>),
  water: (<><path d="M9 3h6v4H9z" {...P} /><rect x="7" y="7" width="10" height="11" {...P} /><path d="M10 21h4M12 11v3" {...P} /></>),
  printer: (<><path d="M7 9V4h10v5" {...P} /><rect x="4" y="9" width="16" height="7" {...P} /><path d="M7 16h10v4H7z" {...P} /><circle cx="17" cy="12" r="0.8" fill="currentColor" /></>),
  server: (<><rect x="4" y="4" width="16" height="6" {...P} /><rect x="4" y="14" width="16" height="6" {...P} /><circle cx="8" cy="7" r="0.8" fill="currentColor" /><circle cx="8" cy="17" r="0.8" fill="currentColor" /></>),
  ac: (<><rect x="3" y="5" width="18" height="8" {...P} /><path d="M6 9h12M7 17c1-1 1-2 0-3M12 18c1-1 1-3 0-4M17 17c1-1 1-2 0-3" {...P} /></>),
  heater: (<><rect x="4" y="6" width="16" height="12" {...P} /><path d="M8 9v6M12 9v6M16 9v6" {...P} /></>),
  coffee: (<><path d="M5 8h12v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" {...P} /><path d="M17 9h2a2 2 0 0 1 0 4h-2M8 3v2M11 3v2" {...P} /></>),
  microwave: (<><rect x="3" y="6" width="18" height="12" {...P} /><rect x="6" y="9" width="9" height="6" {...P} /><path d="M18 10v4" {...P} /></>),
};

export function DeviceGlyph({ icon, className }: { icon: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {GLYPHS[icon] ?? GLYPHS.monitor}
    </svg>
  );
}
