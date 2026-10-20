"use client";

// What the phone sees: an empty classroom at night, and the live detector
// boxing every device it recognises.
//
// The room and its boxes share one wrapper, and that wrapper drifts like a hand-
// held camera, so the boxes stay locked onto their objects the way the real
// tracker's do.

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";

/** Boxes in the room's own 300 × 650 coordinates. */
const BOXES = [
  { x: 122, y: 92, w: 56, h: 30, state: "on", label: "Projector", cost: "$221/yr", delay: 0.2, anchor: "top" },
  { x: 250, y: 240, w: 52, h: 212, state: "on", label: "Vending", cost: "$194/yr", delay: 0.55, anchor: "left" },
  { x: 40, y: 360, w: 54, h: 38, state: "on", label: "Monitor ×6", cost: "$109/yr", delay: 0.85, anchor: "top" },
  { x: 118, y: 360, w: 54, h: 38, state: "on", delay: 0.95 },
  { x: 196, y: 360, w: 54, h: 38, state: "standby", delay: 1.05 },
  { x: 14, y: 432, w: 84, h: 58, state: "standby", delay: 1.2 },
  { x: 108, y: 432, w: 84, h: 58, state: "on", delay: 1.3 },
  { x: 202, y: 432, w: 84, h: 58, state: "on", delay: 1.4 },
  { x: 32, y: 34, w: 84, h: 18, state: "on", delay: 1.7 },
] as const;

const TONE = { on: "#ff7a52", standby: "#ffc15c" } as const;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/**
 * `crop` shows the middle of the room as a standalone card, for a phone screen,
 * where drawing a phone around it would only be a phone inside a phone.
 */
export function TrackingFeed({ crop = false }: { crop?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [cost, setCost] = useState(0);
  const [found, setFound] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const a = animate(0, 630, { duration: 2.2, delay: 0.4, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setCost(Math.round(v)) });
    const b = animate(0, 9, { duration: 1.6, delay: 0.2, ease: "linear", onUpdate: (v) => setFound(Math.round(v)) });
    return () => {
      a.stop();
      b.stop();
    };
  }, [inView]);

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-[#111523] text-white">
      {/* the moving camera. Cropped, the card shows 460 of the room's 650
          units, starting 30 down: projector label to front row. */}
      <div className="feed-pan absolute inset-x-0" style={crop ? { top: "-6.52%", height: "141.3%" } : { top: 0, bottom: 0 }}>
        <Room />
        {BOXES.map((b, i) => (
          <div
            key={i}
            className="absolute transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              left: pct(b.x, 300),
              top: pct(b.y, 650),
              width: pct(b.w, 300),
              height: pct(b.h, 650),
              opacity: inView ? 1 : 0,
              transform: inView ? "scale(1)" : "scale(1.25)",
              transitionDelay: `${b.delay}s`,
            }}
          >
            <div className="track-jitter absolute inset-0" style={{ animationDelay: `${-i * 0.37}s` }}>
              <Brackets color={TONE[b.state]} />
              {"label" in b && (
                <span
                  className={`absolute whitespace-nowrap rounded-[0.35em] px-[0.5em] py-[0.28em] text-[0.74em] font-semibold leading-none text-[#1c1b18] ${
                    b.anchor === "top"
                      ? "bottom-full left-0 mb-[0.3em]"
                      : "right-full top-[8%] mr-[0.35em]"
                  }`}
                  style={{ background: TONE[b.state] }}
                >
                  {b.label} <span className="font-numeric opacity-70">{b.cost}</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* HUD */}
      <div className={`absolute inset-x-0 top-0 z-10 flex items-start justify-between px-[5%] ${crop ? "pt-[5%]" : "pt-[15%]"}`}>
        <span className="flex items-center gap-[0.4em] rounded-full bg-black/45 px-[0.7em] py-[0.35em] text-[0.62em] backdrop-blur-md">
          <span className="soft-pulse h-[0.5em] w-[0.5em] rounded-full bg-[#ff5b4a]" />
          Live
        </span>
        <span className="rounded-full bg-black/45 px-[0.7em] py-[0.35em] font-numeric text-[0.58em] text-white/80 backdrop-blur-md">
          28 fps · on-device
        </span>
      </div>

      {crop ? (
        <div className="absolute inset-x-[4%] bottom-[4%] z-10 flex items-center justify-between rounded-full bg-[#f7f4ee]/95 py-[0.55em] pl-[1em] pr-[0.55em] text-[#1c1b18] backdrop-blur-xl">
          <span className="text-[0.78em]">
            <span className="font-numeric">{found}</span> devices ·{" "}
            <span className="font-medium">${cost}</span>
            <span className="text-[#6f6a60]"> a year</span>
          </span>
          <span className="rounded-full bg-[#1c1b18] px-[0.9em] py-[0.4em] text-[0.72em] font-medium text-white">Audit view</span>
        </div>
      ) : (
      <div className="absolute inset-x-[3%] bottom-[2.2%] z-10 rounded-[1.4em] bg-[#f7f4ee]/95 p-[1em] text-[#1c1b18] shadow-[0_-10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex items-baseline justify-between">
          <span className="text-[0.7em] text-[#6f6a60]">Room 214 · this view</span>
          <span className="font-numeric text-[0.62em] text-[#6f6a60]">{found} devices</span>
        </div>
        <div className="mt-[0.35em] flex items-baseline gap-[0.3em]">
          <span className="font-editorial text-[2.3em] leading-none">${cost}</span>
          <span className="text-[0.72em] text-[#6f6a60]">a year, left on</span>
        </div>
        <div className="mt-[0.7em] flex h-[0.38em] gap-[2px] overflow-hidden rounded-full">
          <span className="h-full bg-[#ff7a52]" style={{ flex: 221 }} />
          <span className="h-full bg-[#ff9a62]" style={{ flex: 194 }} />
          <span className="h-full bg-[#ffb35f]" style={{ flex: 109 }} />
          <span className="h-full bg-[#ffc15c]" style={{ flex: 106 }} />
        </div>
        <div className="mt-[0.8em] flex items-center justify-between">
          <span className="text-[0.62em] text-[#6f6a60]">Hold still to audit</span>
          <span className="rounded-full bg-[#1c1b18] px-[0.9em] py-[0.45em] text-[0.64em] font-medium text-white">Audit view</span>
        </div>
      </div>
      )}
    </div>
  );
}

function Brackets({ color }: { color: string }) {
  const c = "absolute h-[0.7em] w-[0.7em] border-[0.13em]";
  return (
    <>
      <span className="absolute inset-0 rounded-[0.2em]" style={{ background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}55` }} />
      <span className={`${c} left-0 top-0 rounded-tl-[0.25em] border-b-0 border-r-0`} style={{ borderColor: color }} />
      <span className={`${c} right-0 top-0 rounded-tr-[0.25em] border-b-0 border-l-0`} style={{ borderColor: color }} />
      <span className={`${c} bottom-0 left-0 rounded-bl-[0.25em] border-r-0 border-t-0`} style={{ borderColor: color }} />
      <span className={`${c} bottom-0 right-0 rounded-br-[0.25em] border-l-0 border-t-0`} style={{ borderColor: color }} />
    </>
  );
}

/** An empty classroom after dark, drawn in the room's 300 × 650 space. */
function Room() {
  return (
    <svg viewBox="0 0 300 650" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="tf-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2033" />
          <stop offset="1" stopColor="#262c42" />
        </linearGradient>
        <linearGradient id="tf-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2131" />
          <stop offset="1" stopColor="#0f121c" />
        </linearGradient>
        <linearGradient id="tf-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6dc" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff6dc" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="tf-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#8fb2ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8fb2ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="tf-warm" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffc98a" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ffc98a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tf-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eef2ff" />
          <stop offset="1" stopColor="#c6d2f3" />
        </linearGradient>
      </defs>

      <rect width="300" height="400" fill="url(#tf-wall)" />
      <rect y="0" width="300" height="60" fill="#151a2a" />
      <rect y="400" width="300" height="250" fill="url(#tf-floor)" />
      {[440, 490, 560].map((y) => (
        <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="#2a3047" strokeWidth="0.8" />
      ))}
      {[-120, -30, 60, 150, 240, 330, 420].map((x) => (
        <line key={x} x1={150 + (x - 150) * 0.35} y1="400" x2={x} y2="650" stroke="#2a3047" strokeWidth="0.8" />
      ))}

      {/* ceiling lights: one bank left on */}
      <ellipse cx="74" cy="60" rx="80" ry="40" fill="url(#tf-warm)" className="tube" />
      <rect x="36" y="38" width="76" height="10" rx="2" fill="#fff2d2" className="tube" />
      <rect x="188" y="38" width="76" height="10" rx="2" fill="#2e3448" />

      {/* window */}
      <rect x="4" y="150" width="30" height="160" rx="2" fill="#0c1020" stroke="#30364c" strokeWidth="2" />
      <circle cx="20" cy="182" r="6" fill="#e9e4d6" opacity="0.8" />
      <line x1="4" x2="34" y1="230" y2="230" stroke="#30364c" strokeWidth="2" />

      {/* projector + its cone */}
      <line x1="150" y1="60" x2="150" y2="96" stroke="#3a4058" strokeWidth="3" />
      <polygon points="146,118 154,118 252,250 48,250" fill="url(#tf-cone)" opacity="0.45" />
      <rect x="126" y="96" width="48" height="22" rx="5" fill="#c9cdd8" />
      <circle cx="150" cy="114" r="5" fill="#fffbe6" />
      <circle cx="150" cy="114" r="12" fill="#fffbe6" opacity="0.25" />

      {/* the projected slide, glowing for an empty room */}
      <rect x="44" y="160" width="212" height="150" rx="3" fill="#a9b9e6" opacity="0.18" />
      <rect x="54" y="168" width="192" height="134" rx="2" fill="url(#tf-screen)" />
      <rect x="68" y="182" width="96" height="9" rx="2" fill="#3a4566" opacity="0.75" />
      <rect x="68" y="198" width="64" height="5" rx="2" fill="#3a4566" opacity="0.35" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={74 + i * 32} y={284 - [40, 62, 34, 76, 52][i]} width="20" height={[40, 62, 34, 76, 52][i]} rx="2" fill={i === 3 ? "#ef9d2e" : "#7c8bb8"} opacity="0.85" />
      ))}

      {/* vending machine at the edge of frame */}
      <ellipse cx="276" cy="330" rx="60" ry="110" fill="url(#tf-warm)" />
      <rect x="252" y="242" width="56" height="208" rx="4" fill="#2a2f40" />
      <rect x="258" y="252" width="38" height="124" rx="2" fill="#ffd79c" />
      {[0, 1, 2, 3, 4].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} x={262 + c * 11.5} y={258 + r * 23} width="8" height="14" rx="1.5" fill={["#e5553a", "#3a7bd5", "#2e9e6a"][(r + c) % 3]} opacity="0.9" />
        )),
      )}
      <rect x="262" y="392" width="30" height="14" rx="2" fill="#151926" />

      {/* back row: desks and monitors */}
      <rect x="20" y="398" width="250" height="8" rx="2" fill="#3a3f55" />
      {[42, 120, 198].map((x, i) => (
        <g key={x}>
          {i < 2 && <ellipse cx={x + 25} cy={380} rx="46" ry="30" fill="url(#tf-glow)" />}
          <rect x={x} y="362" width="50" height="33" rx="2" fill="#0d101a" />
          <rect x={x + 2.5} y="364.5" width="45" height="28" rx="1" fill={i < 2 ? "#a7c3ff" : "#141826"} />
          {i === 2 && <circle cx={x + 46} cy="392" r="1.6" fill="#ffc15c" />}
          <rect x={x + 22} y="395" width="6" height="4" fill="#0d101a" />
        </g>
      ))}

      {/* front row: closer, bigger */}
      <rect x="0" y="494" width="300" height="12" rx="2" fill="#40465e" />
      <rect x="0" y="506" width="300" height="40" fill="#272c3d" />
      {[16, 110, 204].map((x, i) => (
        <g key={x}>
          {i > 0 && <ellipse cx={x + 40} cy={462} rx="70" ry="44" fill="url(#tf-glow)" />}
          <rect x={x} y="434" width="80" height="54" rx="3" fill="#0d101a" />
          <rect x={x + 3.5} y="437.5" width="73" height="47" rx="1.5" fill={i > 0 ? "#b2cbff" : "#151a29"} />
          {i > 0 && (
            <>
              <rect x={x + 10} y="445" width="40" height="5" rx="1" fill="#5b6fa6" opacity="0.6" />
              <rect x={x + 10} y="454" width="56" height="3" rx="1" fill="#5b6fa6" opacity="0.35" />
              <rect x={x + 10} y="460" width="48" height="3" rx="1" fill="#5b6fa6" opacity="0.35" />
            </>
          )}
          {i === 0 && <circle cx={x + 75} cy="484" r="2" fill="#ffc15c" />}
          <rect x={x + 36} y="488" width="8" height="6" fill="#0d101a" />
        </g>
      ))}
      {/* chair backs */}
      {[40, 135, 230].map((x) => (
        <rect key={x} x={x} y="560" width="44" height="60" rx="8" fill="#141826" />
      ))}
    </svg>
  );
}
