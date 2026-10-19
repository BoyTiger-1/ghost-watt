// Getting data back in.
//
// Photos get deleted and phones get swapped, but a scan's numbers usually
// survive somewhere: the CSV sent to facilities, or the report data saved from
// the Report tab. This reads either back into saved rooms, so a place can be
// reopened without the original pictures. A full backup (My places →
// Download a copy) is read by importStore in export.ts instead.

import { DEVICE_CATALOG } from "./devices";
import type { SavedAudit } from "./storage";
import type { AuditSettings, DeviceState, Offender } from "./types";

export const REPORT_DATA_KIND = "ghostwatt-report";

export type ImportedFile =
  | { kind: "rooms"; audits: SavedAudit[] }
  | { kind: "backup" }
  | { kind: "error"; error: string };

/** One CSV line into cells, honouring quotes. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const num = (v: string | undefined) => {
  const n = parseFloat((v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** The "CSV for facilities" export, back into one saved room per area. */
export function csvToAudits(text: string, buildingId: string): SavedAudit[] | string {
  const lines = text.split(/\r?\n/).map(cells);
  const meta = new Map(lines.filter((l) => l.length >= 2 && l[0] && !/^\d+$/.test(l[0])).map((l) => [l[0], l[1]]));
  const head = lines.findIndex((l) => l[0] === "Rank" && l.includes("Device"));
  if (head < 0) return "That CSV isn't one Ghost Watt made. Use the “CSV for facilities” file from the Report tab.";
  const col = (name: string) => lines[head].indexOf(name);
  const c = {
    area: col("Area"),
    device: col("Device"),
    count: col("Count"),
    state: col("State"),
    watts: col("Watts each"),
    total: col("Watts total"),
    kwh: col("kWh/yr"),
    cost: col("Cost/yr ($)"),
    co2: col("CO2/yr (kg)"),
    confidence: col("Confidence"),
    fix: col("Recommended fix"),
    fixCost: col("Fix cost ($)"),
    saving: col("Annual saving ($)"),
  };

  const settings: AuditSettings = {
    ratePerKwh: num(meta.get("Electricity rate ($/kWh)")) || 0.15,
    co2PerKwh: num(meta.get("Grid carbon (kg CO2e/kWh)")) || 0.37,
    unoccupiedHoursPerYear: num(meta.get("Unoccupied hours per year")) || 6000,
  };
  const at = meta.get("Generated") && !Number.isNaN(Date.parse(meta.get("Generated")!)) ? meta.get("Generated")! : new Date().toISOString();

  const byArea = new Map<string, Offender[]>();
  for (const row of lines.slice(head + 1)) {
    if (!/^\d+$/.test(row[0] ?? "")) continue;
    const label = row[c.device] ?? "Device";
    const cat = DEVICE_CATALOG.find((d) => d.label.toLowerCase() === label.toLowerCase());
    const cost = num(row[c.cost]);
    const fixCost = num(row[c.fixCost]);
    const saving = num(row[c.saving]);
    const state = (["on", "standby", "off"].includes(row[c.state]) ? row[c.state] : "on") as DeviceState;
    const area = row[c.area] || "Imported room";
    const o: Offender = {
      id: `import_${area}:${cat?.id ?? label}:${row[0]}`,
      categoryId: cat?.id ?? `imported-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
      icon: cat?.icon ?? "plug",
      count: Math.max(1, Math.round(num(row[c.count]))),
      state,
      perUnitWatts: num(row[c.watts]),
      totalWatts: num(row[c.total]),
      kwhPerYear: num(row[c.kwh]),
      costPerYear: cost,
      co2KgPerYear: num(row[c.co2]),
      costLowPerYear: cost * 0.7,
      costHighPerYear: cost * 1.4,
      group: cat?.group ?? "specialty",
      action: cat ? { ...cat.action, label: row[c.fix] || cat.action.label } : { label: row[c.fix] || "Switch it off after hours", type: "policy", cost: fixCost, savingsFraction: cost > 0 ? saving / cost : 0, note: "" },
      fixCost,
      annualSavings: saving,
      paybackMonths: fixCost > 0 && saving > 0 ? (fixCost / saving) * 12 : null,
      confidence: (["high", "medium", "low"].includes(row[c.confidence]) ? row[c.confidence] : "medium") as Offender["confidence"],
      source: area,
      basis: "catalog",
    };
    byArea.set(area, [...(byArea.get(area) ?? []), o]);
  }
  if (!byArea.size) return "That CSV has no devices in it.";

  return [...byArea.entries()].map(([area, offenders], i) => ({
    id: `import_${Date.now().toString(36)}_${i}`,
    buildingId,
    at,
    areas: [area],
    offenders,
    settings,
    mode: "on-device",
    engine: "Imported from CSV",
    note: "Imported from a CSV export; the original photo isn't included.",
  }));
}

/** What the Report tab's "Download report data" saves: the audit behind the report, one room per area. */
export function reportData(audit: SavedAudit): string {
  return JSON.stringify({ kind: REPORT_DATA_KIND, version: 1, audit: { ...audit, thumb: undefined } }, null, 2);
}

/** A file dropped on My places → Import: a CSV, report data, or a full backup. */
export function readImport(name: string, text: string, buildingId: string): ImportedFile {
  if (/\.csv$/i.test(name) || text.startsWith("Ghost Watt phantom-load audit")) {
    const r = csvToAudits(text, buildingId);
    return typeof r === "string" ? { kind: "error", error: r } : { kind: "rooms", audits: r };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "error", error: "That file couldn't be read. Import a Ghost Watt CSV, report data or backup file." };
  }
  const j = json as { kind?: string; audit?: SavedAudit; buildings?: unknown; audits?: unknown };
  if (j.kind === REPORT_DATA_KIND && j.audit && Array.isArray(j.audit.offenders)) {
    const a = j.audit;
    // A whole-place report covers several rooms: split it back into one room each.
    const areas = [...new Set(a.offenders.map((o) => o.source))];
    const stamp = Date.now().toString(36);
    const audits = (areas.length > 1 ? areas : [a.areas[0] ?? "Imported room"]).map((area, i) => ({
      ...a,
      id: `import_${stamp}_${i}`,
      buildingId,
      areas: [area],
      offenders: areas.length > 1 ? a.offenders.filter((o) => o.source === area) : a.offenders,
      note: "Imported from report data; the original photo isn't included.",
    }));
    return { kind: "rooms", audits };
  }
  if (Array.isArray(j.buildings) && Array.isArray(j.audits)) return { kind: "backup" };
  return { kind: "error", error: "That file isn't one Ghost Watt made." };
}
