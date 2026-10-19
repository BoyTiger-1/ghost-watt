"use client";

// Pictures of the result, each answering one question a person actually asks:
// how much of the time is this place empty, what would my bill be after the
// fixes, and when does spending on fixes come out ahead.

import { useMemo } from "react";
import { rankActions, listActions, simulate } from "@/lib/actions";
import { fmtMoney, fmtMoneyFull } from "@/lib/energy";
import type { AuditSettings, Offender } from "@/lib/types";
import { Term } from "./Term";

function usePlans(offenders: Offender[], settings: AuditSettings) {
  return useMemo(() => {
    const actions = rankActions(listActions(offenders, settings));
    const free = new Set(actions.filter((a) => a.cost === 0).map((a) => a.id));
    // One move per device for "everything": the swap where there is one, since it includes the habit fix's saving.
    const all = new Set(actions.map((a) => a.id));
    return {
      now: simulate(offenders, settings, new Set()),
      free: simulate(offenders, settings, free),
      all: simulate(offenders, settings, all),
      hasFree: free.size > 0,
    };
  }, [offenders, settings]);
}

/** How much of the year nobody is there, as a clock face. */
export function EmptyTime({ settings, home }: { settings: AuditSettings; home: boolean }) {
  const share = Math.min(1, Math.max(0, settings.unoccupiedHoursPerYear / 8760));
  const size = 132;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Card title="How often it's empty" sub={home ? "Hours nobody is home or everyone's asleep" : "Nights, weekends and holidays"}>
      <div className="flex items-center gap-5">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" role="img" aria-label={`Empty ${Math.round(share * 100)}% of the time`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-cyan)" strokeOpacity={0.55} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-ember)"
            strokeWidth={stroke}
            strokeDasharray={`${share * c} ${c}`}
          />
        </svg>
        <div>
          <div className="font-mono text-[2rem] font-bold leading-none text-fog">{Math.round(share * 100)}%</div>
          <p className="mt-1.5 text-[0.86rem] leading-relaxed text-mist">
            of the year, or about <strong className="font-semibold text-fog">{Math.round(share * 24)} of every 24 hours</strong>, nobody is using this space. Anything left on
            then is paying for nothing.
          </p>
          <div className="mt-2 flex gap-3 text-[0.74rem] text-dim">
            <Key color="var(--color-ember)">Empty</Key>
            <Key color="var(--color-cyan)" faded>
              In use
            </Key>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** The yearly bill for these devices now, after the free fixes, and after everything. */
export function BillCompare({ offenders, settings }: { offenders: Offender[]; settings: AuditSettings }) {
  const p = usePlans(offenders, settings);
  const max = Math.max(1, p.now.before.total);
  const rows = [
    { label: "Today", value: p.now.before.total, note: "if nothing changes", color: "var(--color-ember)" },
    ...(p.hasFree ? [{ label: "Free fixes only", value: p.free.after.total, note: "nothing to buy", color: "var(--color-sodium)" }] : []),
    { label: "Every fix", value: p.all.after.total, note: p.all.upfront > 0 ? `after spending ${fmtMoneyFull(p.all.upfront)} once` : "nothing to buy", color: "var(--color-lime)" },
  ];
  return (
    <Card title="Your yearly cost, before and after" sub="For the devices in these pictures">
      <ul className="space-y-3.5">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-[0.84rem]">
              <span className="font-medium text-fog">{r.label}</span>
              <span className="font-mono font-semibold text-fog">{fmtMoneyFull(r.value)}</span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-surface2">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
            </div>
            <div className="mt-0.5 text-[0.72rem] text-dim">{r.note}</div>
          </li>
        ))}
      </ul>
      {p.now.before.total > 0 && (
        <p className="mt-4 border-t border-line pt-3 text-[0.84rem] text-mist">
          Doing everything cuts it by <strong className="font-semibold text-lime">{Math.round(p.all.share * 100)}%</strong>, about {fmtMoneyFull(p.all.annualSavings)} a year.
        </p>
      )}
    </Card>
  );
}

/** Money spent on these devices over two years: do nothing, free fixes, every fix (paid for up front). */
export function MoneyOverTime({ offenders, settings }: { offenders: Offender[]; settings: AuditSettings }) {
  const p = usePlans(offenders, settings);
  const months = 24;
  const series = [
    { id: "now", label: "Do nothing", start: 0, perMonth: p.now.before.total / 12, color: "var(--color-ember)" },
    ...(p.hasFree ? [{ id: "free", label: "Free fixes", start: 0, perMonth: p.free.after.total / 12, color: "var(--color-sodium)" }] : []),
    { id: "all", label: "Every fix", start: p.all.upfront, perMonth: p.all.after.total / 12, color: "var(--color-lime)" },
  ];
  const top = Math.max(1, ...series.map((s) => s.start + s.perMonth * months));
  const W = 880;
  const H = 250;
  const pad = { l: 50, r: 110, t: 16, b: 28 };
  const x = (m: number) => pad.l + (m / months) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const ticks = [0, top / 2, top];
  // End labels, pushed apart where two lines finish close together.
  const labelY = new Map<string, number>();
  let last = -Infinity;
  for (const s of [...series].sort((a, b) => y(a.start + a.perMonth * months) - y(b.start + b.perMonth * months))) {
    const want = Math.max(y(s.start + s.perMonth * months), last + 30);
    labelY.set(s.id, want);
    last = want;
  }
  // When does paying for every fix come out ahead of doing nothing?
  const gap = series[0].perMonth - series[series.length - 1].perMonth;
  const breakEven = p.all.upfront > 0 && gap > 0 ? p.all.upfront / gap : null;

  return (
    <Card title="The next two years" sub="Total spent running these devices, month by month">
      <div className="-mx-1 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Line chart of money spent over 24 months for each plan">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-dim)">
                {fmtMoney(t)}
              </text>
            </g>
          ))}
          {[0, 6, 12, 18, 24].map((m) => (
            <text key={m} x={x(m)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-dim)">
              {m === 0 ? "now" : m === 12 ? "1 yr" : m === 24 ? "2 yrs" : `${m} mo`}
            </text>
          ))}
          {breakEven !== null && breakEven <= months && (
            <g>
              <line x1={x(breakEven)} x2={x(breakEven)} y1={pad.t} y2={H - pad.b} stroke="var(--color-lime)" strokeDasharray="3 4" strokeWidth={1.2} />
            </g>
          )}
          {series.map((s) => {
            const end = s.start + s.perMonth * months;
            return (
              <g key={s.id}>
                <line
                  x1={x(0)}
                  y1={y(s.start)}
                  x2={x(months)}
                  y2={y(end)}
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  className="draw-line"
                  style={{ "--len": W } as React.CSSProperties}
                />
                <circle cx={x(months)} cy={y(end)} r={3.5} fill={s.color} />
                <text x={x(months) + 10} y={(labelY.get(s.id) ?? y(end)) - 1} fontSize="12" fontWeight={600} fill="var(--color-fog)">
                  {fmtMoney(end)}
                </text>
                <text x={x(months) + 10} y={(labelY.get(s.id) ?? y(end)) + 13} fontSize="11" fill="var(--color-dim)">
                  {s.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 text-[0.84rem] leading-relaxed text-mist">
        {breakEven === null
          ? "None of the fixes cost anything, so they're ahead from day one."
          : breakEven <= months
            ? <>Buying every fix costs {fmtMoneyFull(p.all.upfront)} up front, and comes out ahead after about <strong className="font-semibold text-fog">{Math.max(1, Math.round(breakEven))} months</strong> (the dashed line). That point is its <Term k="payback">payback</Term>.</>
            : <>Buying every fix costs {fmtMoneyFull(p.all.upfront)} up front and takes about {Math.round(breakEven / 12)} years to pay for itself.{p.hasFree ? " The free fixes are the better start." : ""}</>}
      </p>
    </Card>
  );
}

export function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 ${className}`}>
      <h3 className="text-[1rem] font-semibold text-fog">{title}</h3>
      {sub && <p className="mt-0.5 text-[0.8rem] text-dim">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Key({ color, faded, children }: { color: string; faded?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color, opacity: faded ? 0.55 : 1 }} />
      {children}
    </span>
  );
}
