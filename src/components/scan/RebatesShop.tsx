"use client";

// Rebates and where to buy: the money side of the fix list. Rebates that apply
// to this scan's fixes where a free database covers them (homes), the exact
// places to look where none does (schools, offices), and each fix searched on
// big, known retailers' own sites - with the typical price beside it, so a
// person can tell a fair price from a bad one.

import { useEffect, useMemo, useState } from "react";
import { CATALOG_BY_ID } from "@/lib/devices";
import type { ActionItem } from "@/lib/actions";
import type { Offender } from "@/lib/types";
import { ITEM_LABEL, commercialLinks, itemsFor, type Incentive, type RebateItem } from "@/lib/rebates";
import { fixQuery, replacementQuery, shopLinks } from "@/lib/shop";
import { fmtMoneyFull } from "@/lib/energy";
import { DeviceGlyph } from "../DeviceGlyph";

const ZIP_KEY = "ghostwatt.zip";

const INCOMES: [string, number | null][] = [
  ["Skip: show programs open to everyone", null],
  ["Under $40,000", 30000],
  ["$40,000 to $80,000", 60000],
  ["$80,000 to $150,000", 115000],
  ["Over $150,000", 200000],
];

interface RebateResult {
  state: string | null;
  utility: string | null;
  incentives: Incentive[];
  incomeChecked: boolean;
  error?: string;
}

export function RebatesShop({
  offenders,
  actions,
  place,
  zip: zipFromLocation,
  state,
  utility,
}: {
  offenders: Offender[];
  actions: ActionItem[];
  place: "home" | "school" | "office";
  zip?: string | null;
  state?: string | null;
  utility?: string | null;
}) {
  const [typedZip, setTypedZip] = useState<string | null>(null);
  const [income, setIncome] = useState<number | null>(null);
  const [size, setSize] = useState(3);
  const [owner, setOwner] = useState<"homeowner" | "renter">("homeowner");
  const [result, setResult] = useState<RebateResult | null>(null);
  const [loading, setLoading] = useState(false);

  // A ZIP typed here before is remembered; the location's own ZIP wins over neither.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(ZIP_KEY);
        if (saved && /^\d{5}$/.test(saved)) setTypedZip(saved);
      } catch {
        // Private mode: nothing remembered.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const zip = typedZip ?? zipFromLocation ?? null;

  // Which rebate items this scan's devices could use, most valuable device first.
  const items = useMemo(() => {
    const out = new Set<RebateItem>();
    for (const o of offenders) {
      const cat = CATALOG_BY_ID[o.categoryId];
      if (cat) for (const i of itemsFor(cat)) out.add(i);
    }
    return [...out];
  }, [offenders]);

  const home = place === "home";

  useEffect(() => {
    if (!home || !zip) return;
    let alive = true;
    const q = new URLSearchParams({ zip, size: String(size), owner });
    if (items.length) q.set("items", [...items, "efficiency_rebates", "energy_audit"].join(","));
    if (income) q.set("income", String(income));
    if (utility) q.set("utility", utility);
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/rebates?${q}`)
        .then((r) => r.json())
        .then((j: RebateResult) => alive && setResult(j))
        .catch(() => alive && setResult({ state: null, utility: null, incentives: [], incomeChecked: false, error: "Couldn't reach the rebate database." }))
        .finally(() => alive && setLoading(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [home, zip, items, income, size, owner, utility]);

  // The fixes worth buying something for, best value first.
  const shopping = useMemo(() => {
    const byId = new Map(offenders.map((o) => [o.id, o]));
    const seen = new Set<string>();
    const out: { key: string; title: string; where: string; icon: string; cost: number; savings: number; query: string; items: RebateItem[] }[] = [];
    for (const a of actions) {
      if (a.cost <= 0) continue;
      const o = byId.get(a.offenderId);
      if (!o) continue;
      const cat = CATALOG_BY_ID[o.categoryId];
      const query = a.kind === "replace" ? replacementQuery(a.title.replace(/^Replace with\s+/i, "")) : fixQuery(o.action, cat);
      if (!query || seen.has(query)) continue;
      seen.add(query);
      // A rebate is only suggested for buying the rebated thing itself (a replacement),
      // never for a timer or plug that happens to sit on the same device.
      out.push({ key: a.id, title: a.title, where: a.where, icon: a.icon, cost: a.cost, savings: a.annualSavings, query, items: a.kind === "replace" && cat ? itemsFor(cat) : [] });
      if (out.length >= 6) break;
    }
    return out;
  }, [actions, offenders]);

  const rebateFor = (its: RebateItem[]) => result?.incentives.find((i) => i.items.some((x) => its.includes(x as RebateItem)));

  return (
    <section className="panel overflow-hidden" aria-label="Rebates and where to buy">
      <header className="border-b border-line px-5 py-4 sm:px-6">
        <h3 className="text-[1.05rem] font-semibold text-fog">Rebates and where to buy</h3>
        <p className="mt-0.5 text-[0.82rem] text-dim">Money back on these fixes, and the trusted stores that sell them.</p>
      </header>

      {/* where */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-[0.84rem] sm:px-6">
        <span className="text-mist">ZIP code</span>
        <input
          value={zip ?? ""}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 5);
            setTypedZip(v || null);
            if (v.length === 5) {
              try {
                localStorage.setItem(ZIP_KEY, v);
              } catch {
                // ignore
              }
            }
          }}
          inputMode="numeric"
          placeholder="e.g. 78701"
          aria-label="ZIP code"
          className="w-24 rounded-full border border-line bg-surface px-3 py-1 text-[0.86rem] tabular-nums text-fog outline-none focus:border-cyan"
        />
        {zipFromLocation && !typedZip && <span className="text-dim">from your location</span>}
        {(result?.utility || utility) && <span className="text-dim">· {result?.utility ?? utility}</span>}
      </div>

      {/* rebates */}
      <div className="px-5 py-4 sm:px-6">
        <h4 className="text-[0.9rem] font-medium text-fog">Rebates</h4>
        {home ? (
          !zip || zip.length < 5 ? (
            <p className="mt-1.5 text-[0.86rem] text-mist">Add a ZIP code to see the programs that apply where you live.</p>
          ) : (
            <>
              <div className="mt-2.5 flex flex-wrap gap-2 text-[0.8rem]">
                <select
                  value={income ?? ""}
                  onChange={(e) => setIncome(e.target.value ? Number(e.target.value) : null)}
                  aria-label="Household income"
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-fog"
                >
                  {INCOMES.map(([label, v]) => (
                    <option key={label} value={v ?? ""}>
                      {label}
                    </option>
                  ))}
                </select>
                {income && (
                  <select value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Household size" className="rounded-full border border-line bg-surface px-3 py-1.5 text-fog">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "person" : "people"}
                      </option>
                    ))}
                  </select>
                )}
                <select value={owner} onChange={(e) => setOwner(e.target.value as typeof owner)} aria-label="Own or rent" className="rounded-full border border-line bg-surface px-3 py-1.5 text-fog">
                  <option value="homeowner">I own</option>
                  <option value="renter">I rent</option>
                </select>
              </div>

              {loading && !result && <div className="mt-3 h-16 animate-pulse rounded-xl bg-surface2" />}
              {result?.error && <p className="mt-3 text-[0.84rem] text-ember">{result.error}</p>}
              {result && !result.error && (
                <>
                  {result.incentives.length ? (
                    <ul className="mt-3 grid gap-2 md:grid-cols-2">
                      {result.incentives.slice(0, 8).map((i) => (
                        <li key={i.program + i.amount + i.items.join()} className="rounded-xl border border-line bg-surface2/40 p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-[0.9rem] font-medium leading-snug text-fog">{i.program}</span>
                            <span className="shrink-0 text-right font-mono text-[0.86rem] font-semibold text-lime">{i.amount}</span>
                          </div>
                          <p className="mt-1 text-[0.76rem] text-dim">
                            {i.items
                              .map((x) => ITEM_LABEL[x as RebateItem])
                              .filter(Boolean)
                              .slice(0, 3)
                              .join(", ") || "Efficiency upgrades"}{" "}
                            · {i.how}
                            {i.authority ? ` · ${i.authority}` : ""}
                          </p>
                          {i.detail && <p className="mt-1 text-[0.78rem] leading-snug text-mist">{i.detail}</p>}
                          <a href={i.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-[0.8rem] text-cyan hover:underline">
                            Check eligibility ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-[0.86rem] text-mist">
                      No listed household programs match these fixes{result.state ? ` in ${result.state}` : ""} yet. The links below cover more.
                    </p>
                  )}
                  <p className="mt-2.5 text-[0.74rem] leading-relaxed text-dim">
                    {result.incomeChecked
                      ? "Includes income-qualified programs for the income you picked. Your answer isn't stored."
                      : "Showing programs open to every household. Pick an income range to include income-qualified ones."}{" "}
                    From Rewiring America&apos;s incentive database; confirm with the program before you buy.
                  </p>
                </>
              )}
            </>
          )
        ) : (
          <p className="mt-1.5 text-[0.86rem] leading-relaxed text-mist">
            Offices, schools and other businesses get the biggest rebates from their utility, usually for lighting, occupancy sensors and controls. These open the right
            search for this place:
          </p>
        )}
        <ul className="mt-3 space-y-1.5">
          {commercialLinks({ zip, state, utility: result?.utility ?? utility }).map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="group flex items-baseline gap-2 text-[0.86rem]">
                <span className="font-medium text-cyan group-hover:underline">{l.label} ↗</span>
                <span className="text-[0.78rem] text-dim">{l.note}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* where to buy */}
      {shopping.length > 0 && (
        <div className="border-t border-line px-5 py-4 sm:px-6">
          <h4 className="text-[0.9rem] font-medium text-fog">Where to buy</h4>
          <p className="mt-0.5 text-[0.78rem] text-dim">
            Searches on each store&apos;s own site. The typical price is what a fair deal looks like; well above it, keep looking.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {shopping.map((s) => {
              const rebate = home ? rebateFor(s.items) : undefined;
              return (
                <li key={s.key} className="py-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface2 text-mist">
                      <DeviceGlyph icon={s.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-[0.9rem] font-medium text-fog">{s.title}</span>
                        <span className="text-[0.78rem] text-dim">
                          typical {fmtMoneyFull(s.cost)} · saves {fmtMoneyFull(s.savings)}/yr
                        </span>
                      </div>
                      {rebate && <p className="mt-0.5 text-[0.76rem] text-lime">Rebate may apply: {rebate.program} ({rebate.amount})</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {shopLinks(s.query).map(({ retailer, href }) => (
                          <a
                            key={retailer.id}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            title={retailer.note}
                            className="rounded-full border border-line px-3 py-1 text-[0.78rem] text-mist transition-colors hover:border-fog/30 hover:text-fog"
                          >
                            {retailer.name} ↗
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-dim">
            Only Amazon, Walmart, Target and Home Depot&apos;s own sites; Amazon results are filtered to items sold by Amazon.com. Ghost Watt earns nothing
            from these links.
          </p>
        </div>
      )}
    </section>
  );
}
