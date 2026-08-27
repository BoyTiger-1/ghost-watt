"use client";

// Hand-rolled SVG charts.
//
// No charting library. These are small, specific shapes - a donut, a curve, a
// stack - and a general-purpose library would cost more bytes than the whole rest
// of the app while making all four look like everyone else's dashboard. Each one
// draws itself on with a CSS animation and switches that off under
// prefers-reduced-motion.

import { useId } from "react";
import { fmtMoney, fmtMoneyFull, fmtPct } from "@/lib/energy";
import { GROUP_LABELS, type DeviceGroup } from "@/lib/types";
import type { GroupSlice } from "@/lib/energy";

const GROUP_COLOR: Record<DeviceGroup, string> = {
  display: "#2fe6cf",
  computing: "#5ac8fa",
  lighting: "#c8ff4d",
  refrigeration: "#7ee0b8",
  hvac: "#ffb24d",
  kitchen: "#ff8f6b",
  office: "#9d8cff",
  network: "#4dd6ff",
  specialty: "#6c7689",
};

export function groupColor(g: DeviceGroup): string {
  return GROUP_COLOR[g] ?? GROUP_COLOR.specialty;
}

// ---- load mix donut -----------------------------------------------------

/**
 * Where the waste lives, by kind of equipment.
 *
 * Drawn as arcs on one circle rather than as a pie, because the reader is
 * comparing a few large shares against each other, not reading exact values -
 * the numbers are in the legend where they can be read properly.
 */
export function LoadMixDonut({
  slices,
  total,
  size = 190,
}: {
  slices: GroupSlice[];
  total: number;
  size?: number;
}) {
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-surface2)"
            strokeWidth={stroke}
          />
          {slices.map((s, i) => {
            const len = s.share * c;
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={s.group}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={groupColor(s.group)}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                className="draw-line"
                style={
                  {
                    "--len": c,
                    animationDelay: `${i * 90}ms`,
                    strokeDasharray: dash,
                    strokeDashoffset: -offset,
                  } as React.CSSProperties
                }
              >
                <title>{`${GROUP_LABELS[s.group]}: ${fmtMoneyFull(s.costPerYear)}/yr`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-mono text-xl font-bold text-fog">{fmtMoney(total)}</div>
            <div className="mono-label mt-0.5">per year</div>
          </div>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <li
            key={s.group}
            className="rise-in flex items-center gap-2.5 text-sm"
            style={{ "--i": i } as React.CSSProperties}
          >
            <span
              className="h-2.5 w-2.5 shrink-0"
              style={{ background: groupColor(s.group) }}
            />
            <span className="min-w-0 flex-1 truncate text-mist">{GROUP_LABELS[s.group]}</span>
            <span className="font-mono text-xs text-dim tabular-nums">{fmtPct(s.share)}</span>
            <span className="w-16 text-right font-mono text-xs font-semibold text-fog tabular-nums">
              {fmtMoney(s.costPerYear)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- savings curve ------------------------------------------------------

/**
 * Annual savings against money spent.
 *
 * The shape is the argument: it rises almost vertically at the start and then
 * flattens, which is the visual proof that most of the win is cheap. The marker
 * sits at the current budget so a reader can see where they are on it.
 */
export function SavingsCurve({
  points,
  budget,
  height = 150,
}: {
  points: { budget: number; savings: number }[];
  budget: number;
  height?: number;
}) {
  const gid = useId();
  if (points.length < 2) return null;

  const w = 100;
  const h = 100;
  const maxB = Math.max(...points.map((p) => p.budget), 1);
  const maxS = Math.max(...points.map((p) => p.savings), 1);

  const x = (b: number) => (b / maxB) * w;
  const y = (s: number) => h - (s / maxS) * h;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.budget)},${y(p.savings)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;

  // Where the current budget lands on the curve.
  const at = points.reduce((best, p) =>
    Math.abs(p.budget - budget) < Math.abs(best.budget - budget) ? p : best,
  );

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-cyan)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={w}
            y1={h * g}
            y2={h * g}
            stroke="var(--color-line)"
            strokeWidth="0.4"
          />
        ))}

        <path d={area} fill={`url(#fill-${gid})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-cyan)"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
          className="draw-line"
          style={{ "--len": 400 } as React.CSSProperties}
        />
        <line
          x1={x(at.budget)}
          x2={x(at.budget)}
          y1="0"
          y2={h}
          stroke="var(--color-lime)"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        <circle cx={x(at.budget)} cy={y(at.savings)} r="2" fill="var(--color-lime)" />
      </svg>
    </div>
  );
}

// ---- horizontal comparison bars ----------------------------------------

export function CompareBars({
  rows,
  format = fmtMoney,
}: {
  rows: { label: string; value: number; tint?: string }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        // Labels are not identities: two buildings in a district can genuinely share
        // a name, and React then drops one of the bars. Position is the only stable
        // identity a derived, freshly-built list like this actually has.
        <li key={`${i}-${r.label}`} className="rise-in" style={{ "--i": i } as React.CSSProperties}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-mist">{r.label}</span>
            <span className="shrink-0 font-mono text-xs font-semibold text-fog tabular-nums">
              {format(r.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full bg-surface2">
            <div
              className="grow-x h-full"
              style={
                {
                  width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`,
                  background:
                    r.tint ?? "linear-gradient(90deg,var(--color-cyan),var(--color-lime))",
                  "--i": i,
                } as React.CSSProperties
              }
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- sparkline ----------------------------------------------------------

/** A building's waste over successive audits. Down and to the right is the goal. */
export function Sparkline({
  values,
  width = 120,
  height = 34,
  tint = "var(--color-cyan)",
}: {
  values: number[];
  width?: number;
  height?: number;
  tint?: string;
}) {
  if (values.length < 2) {
    return (
      <div
        className="grid place-items-center font-mono text-[0.62rem] text-dim"
        style={{ width, height }}
      >
        one audit
      </div>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => `${i * step},${height - ((v - min) / span) * (height - 4) - 2}`);

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={tint}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="draw-line"
        style={{ "--len": 300 } as React.CSSProperties}
      />
      <circle
        cx={(values.length - 1) * step}
        cy={height - ((values[values.length - 1] - min) / span) * (height - 4) - 2}
        r="2.5"
        fill={tint}
      />
    </svg>
  );
}
