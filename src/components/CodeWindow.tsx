"use client";

// Source code in a macOS window: traffic lights, a centred title, Xcode's dark
// theme. Used wherever the app shows the arithmetic itself, because the strongest
// claim Ghost Watt makes is that you can read the code that produced a number.

import { useState } from "react";

export interface CodeFile {
  name: string;
  /** Where it lives, shown in the title bar. */
  path?: string;
  code: string;
  /** First line number, so an excerpt keeps its real line numbers. */
  startLine?: number;
}

export function CodeWindow({ files, className = "", compact = false }: { files: CodeFile[]; className?: string; compact?: boolean }) {
  const [active, setActive] = useState(0);
  const file = files[active];
  const lines = file.code.replace(/\n$/, "").split("\n");
  const start = file.startLine ?? 1;

  return (
    <figure
      className={`overflow-hidden rounded-[12px] bg-[#1e1e21] text-left shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.06)_inset,0_30px_70px_-20px_rgba(28,27,24,0.45),0_12px_24px_-12px_rgba(28,27,24,0.3)] ${className}`}
    >
      {/* title bar */}
      <div className="relative flex h-[38px] items-center border-b border-black/50 bg-[linear-gradient(180deg,#38383c,#2c2c30)] px-3.5">
        <div className="flex gap-2" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.25)]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.25)]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.25)]" />
        </div>
        <figcaption className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-[#a8a8ad]">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 opacity-70" aria-hidden="true">
            <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7.5A.5.5 0 0 1 3.5 14V2a.5.5 0 0 1 .5-.5z" fill="none" stroke="currentColor" />
            <path d="M9 1.5V5h3" fill="none" stroke="currentColor" />
          </svg>
          {file.name}
          {file.path && !compact && <span className="text-[#6e6e74]">— {file.path}</span>}
        </figcaption>
      </div>

      {files.length > 1 && (
        <div className="flex border-b border-black/50 bg-[#252528]" role="tablist">
          {files.map((f, i) => (
            <button
              key={f.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`relative border-r border-black/40 px-4 py-2 text-[12px] transition-colors ${
                i === active ? "bg-[#1e1e21] text-[#e8e8ea]" : "text-[#8a8a90] hover:text-[#c8c8cc]"
              }`}
            >
              {f.name}
              {i === active && <span className="absolute inset-x-0 top-0 h-[2px] bg-[#0a84ff]" />}
            </button>
          ))}
        </div>
      )}

      <div>
        <pre className={`py-4 font-numeric leading-[1.7] text-[#e5e5e8] ${compact ? "text-[11.5px]" : "text-[12.5px] sm:text-[13px]"}`}>
          <code>
            {lines.map((line, i) => {
              // Long lines wrap instead of scrolling sideways. A wrapped line keeps
              // its own indent and hangs two columns further in, like an editor's
              // soft wrap. The phone excerpt drops the indent to save width.
              const indent = compact ? 0 : line.length - line.trimStart().length;
              return (
                <div key={i} className="flex">
                  <span className={`shrink-0 select-none text-right text-[#5c5c63] ${compact ? "w-9 pr-3" : "w-12 pr-4"}`}>{start + i}</span>
                  <span
                    className="min-w-0 whitespace-pre-wrap break-words pr-4"
                    style={{ paddingLeft: `${indent + 2}ch`, textIndent: "-2ch" }}
                  >
                    {highlight(line.trimStart())}
                  </span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </figure>
  );
}

/* ---- a small TypeScript highlighter ------------------------------------- */

const KEYWORDS = new Set([
  "const", "let", "var", "return", "if", "else", "export", "function", "type", "interface",
  "null", "undefined", "true", "false", "new", "as", "import", "from", "switch", "case", "of", "in",
]);

const TOKEN =
  /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)(?=\s*:(?!:))|([A-Za-z_$][\w$]*)/g;

const C = {
  comment: "#7f8c98",
  string: "#ff8170",
  number: "#d9c97c",
  keyword: "#ff7ab2",
  fn: "#67b7a4",
  prop: "#78c2b3",
  type: "#dabaff",
};

function highlight(line: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let k = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [text, comment, str, num, fn, prop, ident] = m;
    let color: string | undefined;
    let weight: number | undefined;
    if (comment) color = C.comment;
    else if (str) color = C.string;
    else if (num) color = C.number;
    else if (fn) color = KEYWORDS.has(fn) ? C.keyword : C.fn;
    else if (prop) color = KEYWORDS.has(prop) ? C.keyword : C.prop;
    else if (ident) {
      if (KEYWORDS.has(ident)) {
        color = C.keyword;
        weight = 600;
      } else if (/^[A-Z]/.test(ident)) color = C.type;
    }
    out.push(
      color ? (
        <span key={k++} style={{ color, fontWeight: weight, fontStyle: comment ? "italic" : undefined }}>
          {text}
        </span>
      ) : (
        text
      ),
    );
    last = m.index + text.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out.length ? out : " ";
}

/* ---- the real source, excerpted ----------------------------------------- */

export const ENERGY_TS: CodeFile = {
  name: "energy.ts",
  path: "src/lib",
  startLine: 86,
  code: `  // The state this device is in through the building's empty hours. What was seen
  // is the answer when the picture was taken after hours (or the time is unknown);
  // a device seen running during the day is assumed to drop to standby at night
  // unless the user says it is left on. Thermostatic devices cycle regardless.
  let afterHoursState: DeviceState = obs.state;
  let afterHoursBasis: Offender["afterHoursBasis"] = "observed";
  if (obs.afterHours && !cat.thermostatic) {
    afterHoursState = obs.afterHours;
    afterHoursBasis = "user";
  } else if (settings.capturedAfterHours === false && obs.state === "on" && !cat.thermostatic) {
    afterHoursState = "standby";
    afterHoursBasis = "assumed-standby";
  }

  // A user's wattage is the draw in the observed state; it only applies after hours
  // if the after-hours state is that same state.
  const userWatts = afterHoursState === obs.state ? obs.userWatts : undefined;
  const unit = estimateUnitWatts(cat, afterHoursState, { aiWatts: obs.wattsHint, userWatts });
  const perUnitWatts = unit.mid;
  const totalWatts = perUnitWatts * count;
  // Seen on, off at night, draws nothing in standby: nothing to cost after hours.
  // The device is still reported (typical use is real) with zero waste.
  const standbyUnit = estimateUnitWatts(cat, "standby", {});

  const hoursKnown = obs.hoursPerYear !== undefined && Number.isFinite(obs.hoursPerYear) && obs.hoursPerYear >= 0;
  const hours = hoursKnown ? Math.min(8760, obs.hoursPerYear!) : settings.unoccupiedHoursPerYear;
  const kwhPerYear = (totalWatts / 1000) * hours;
  const standbyCostPerYear = ((standbyUnit.mid * count) / 1000) * settings.unoccupiedHoursPerYear * settings.ratePerKwh;
  const costPerYear = kwhPerYear * settings.ratePerKwh;
  const co2KgPerYear = kwhPerYear * settings.co2PerKwh;

  const costLowPerYear = ((unit.low * count) / 1000) * hours * settings.ratePerKwh;
  const costHighPerYear = ((unit.high * count) / 1000) * hours * settings.ratePerKwh;

  const annualSavings = costPerYear * cat.action.savingsFraction;
  const fixCost = cat.action.cost;
  const paybackMonths =
    fixCost > 0 && annualSavings > 0 ? (fixCost / annualSavings) * 12 : null;`,
};

export const DEVICES_TS: CodeFile = {
  name: "devices.ts",
  path: "src/lib",
  startLine: 17,
  code: `  {
    id: "projector",
    label: "Projector",
    keywords: ["projector", "beamer", "data projector"],
    wattsOn: 250,
    wattsStandby: 5,
    wattsLow: 150,
    wattsHigh: 400,
    dutyCycle: 1,
    group: "display",
    source: "Classroom DLP/LCD projectors, lamp-based; laser models sit at the low end.",
    icon: "projector",
    action: {
      label: "Auto-off timer linked to occupancy",
      type: "timer",
      cost: 40,
      savingsFraction: 0.95,
      note: "Projectors burn ~250 W and are routinely left running. A $40 timer or occupancy link kills overnight use.",
    },
  },`,
};

/** The four lines that turn watts into dollars and carbon, short enough for a phone. */
export const ENERGY_TS_SHORT: CodeFile = {
  name: "energy.ts",
  path: "src/lib",
  startLine: 110,
  code: `  const hoursKnown = obs.hoursPerYear !== undefined && Number.isFinite(obs.hoursPerYear) && obs.hoursPerYear >= 0;
  const hours = hoursKnown ? Math.min(8760, obs.hoursPerYear!) : settings.unoccupiedHoursPerYear;
  const kwhPerYear = (totalWatts / 1000) * hours;
  const standbyCostPerYear = ((standbyUnit.mid * count) / 1000) * settings.unoccupiedHoursPerYear * settings.ratePerKwh;
  const costPerYear = kwhPerYear * settings.ratePerKwh;`,
};
