// Getting the audit out of the browser and onto someone's desk.
//
// An audit that dies when the tab closes cannot change anything. A facilities
// office runs on spreadsheets and signed paper, so this produces both: a CSV that
// opens in Excel with every assumption alongside every number, and a JSON backup
// that can be re-imported to move a building between devices.

import type { Offender, AuditSettings } from "./types";
import type { Store } from "./storage";
import { fmtPayback } from "./energy";

function escapeCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

export function offendersToCsv(
  offenders: Offender[],
  settings: AuditSettings,
  buildingName: string,
): string {
  const header: (string | number)[][] = [
    [`Ghost Watt phantom-load audit`],
    [`Building`, buildingName],
    [`Generated`, new Date().toISOString()],
    [`Electricity rate ($/kWh)`, settings.ratePerKwh],
    [`Grid carbon (kg CO2e/kWh)`, settings.co2PerKwh],
    [`Unoccupied hours per year`, settings.unoccupiedHoursPerYear],
    [],
    [
      "Rank",
      "Area",
      "Device",
      "Count",
      "State",
      "Watts each",
      "Watts total",
      "kWh/yr",
      "Cost/yr ($)",
      "CO2/yr (kg)",
      "Confidence",
      "Recommended fix",
      "Fix cost ($)",
      "Annual saving ($)",
      "Payback",
    ],
  ];

  const body = offenders.map((o, i) => [
    i + 1,
    o.source,
    o.label,
    o.count,
    o.state,
    Math.round(o.perUnitWatts * 10) / 10,
    Math.round(o.totalWatts),
    Math.round(o.kwhPerYear),
    Math.round(o.costPerYear),
    Math.round(o.co2KgPerYear),
    o.confidence,
    o.action.label,
    o.fixCost,
    Math.round(o.annualSavings),
    fmtPayback(o.paybackMonths),
  ]);

  const totals = offenders.reduce(
    (a, o) => ({
      kwh: a.kwh + o.kwhPerYear,
      cost: a.cost + o.costPerYear,
      co2: a.co2 + o.co2KgPerYear,
      fix: a.fix + o.fixCost,
      save: a.save + o.annualSavings,
    }),
    { kwh: 0, cost: 0, co2: 0, fix: 0, save: 0 },
  );

  const footer: (string | number)[][] = [
    [],
    [
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      Math.round(totals.kwh),
      Math.round(totals.cost),
      Math.round(totals.co2),
      "",
      "",
      Math.round(totals.fix),
      Math.round(totals.save),
      "",
    ],
  ];

  return toCsv([...header, ...body, ...footer]);
}

/** Trigger a client-side download. Returns false when not in a browser. */
export function downloadText(filename: string, text: string, mime = "text/plain"): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const blob = new Blob([text], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function exportStore(store: Store): string {
  return JSON.stringify({ ...store, exportedAt: new Date().toISOString() }, null, 2);
}

export interface ImportResult {
  ok: boolean;
  store?: Store;
  error?: string;
}

export function importStore(text: string): ImportResult {
  try {
    const parsed = JSON.parse(text) as Partial<Store>;
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "That file is not a Ghost Watt backup." };
    }
    if (!Array.isArray(parsed.buildings) || !Array.isArray(parsed.audits)) {
      return { ok: false, error: "That backup is missing its buildings or audits." };
    }
    return {
      ok: true,
      store: {
        version: 1,
        buildings: parsed.buildings,
        audits: parsed.audits,
        fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
        activeBuildingId: parsed.activeBuildingId ?? null,
      },
    };
  } catch {
    return { ok: false, error: "That file could not be read as JSON." };
  }
}

export function slugForFile(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "audit"
  );
}
