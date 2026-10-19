// Reading an electricity bill.
//
// One bill replaces the largest assumption in the whole app - the price per
// kWh - with a measurement. The vision model reads the printed figures (kWh
// used, days in the period, total charged) through a schema; this file turns
// that reply into fields a person confirms. It never fills a blank in: a figure
// the model did not read stays empty, a figure it was unsure about is flagged,
// and the rate is only ever computed from two numbers the person can see.

export const BILL_SCHEMA = {
  type: "object",
  properties: {
    is_electricity_bill: { type: "boolean", description: "True only if this is clearly an electricity (or combined utility) bill." },
    utility: { type: "string", description: "Name of the utility company printed on the bill, if legible." },
    kwh: { type: "number", description: "Electricity used in the billing period, kWh. Omit if not printed." },
    period_start: { type: "string", description: "Billing period start date as printed, if any." },
    period_end: { type: "string", description: "Billing period end date as printed, if any." },
    days: { type: "integer", description: "Days in the billing period, if printed or stated." },
    total_dollars: { type: "number", description: "Total amount charged for electricity this period, in dollars." },
    rate_cents_per_kwh: { type: "number", description: "An energy rate printed on the bill, in cents per kWh, if there is exactly one. Omit otherwise." },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "How sure you are that kWh and total dollars were read correctly." },
    notes: { type: "string", description: "Anything that made the figures hard to read: cropped, blurry, several meters, gas included." },
  },
  required: ["is_electricity_bill", "confidence"],
} as const;

export const BILL_PROMPT = `You are reading a photograph of a utility bill. Report only what is printed on it; never estimate a figure that is not there.
- kwh: the electricity used in the billing period (the number with "kWh" next to it; if several, the total for the period).
- total_dollars: the total charged for electricity this period, including delivery and taxes if it is one combined line. If gas is on the same bill, give the electricity portion only and say so in notes.
- period_start, period_end, days: the billing period as printed.
- rate_cents_per_kwh: only if the bill prints one per-kWh energy rate.
- confidence: how sure you are kwh and total_dollars are right. Below 0.7 if anything is cropped or blurry.
Respond ONLY with JSON matching the required shape.`;

export interface BillRead {
  isBill: boolean;
  utility?: string;
  kwh?: number;
  days?: number;
  dollars?: number;
  periodEnd?: string;
  /** cents/kWh as printed, when the bill printed exactly one. */
  printedRate?: number;
  /** dollars ÷ kWh, when both were read. */
  blendedRate?: number;
  confidence: number;
  /** Plain reasons the person should check before accepting. */
  issues: string[];
}

/** Turn the model's reply into fields, flagging everything a person should look at. */
export function readBillReply(text: string): BillRead {
  const unreadable: BillRead = { isBill: false, confidence: 0, issues: ["The reply could not be read as a bill."] };
  let raw: Record<string, unknown>;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return unreadable;
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return unreadable;
    raw = parsed as Record<string, unknown>;
  } catch {
    return unreadable;
  }
  const num = (v: unknown) => {
    const n = typeof v === "string" ? parseFloat(v.replace(/[,$]/g, "")) : Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const issues: string[] = [];
  const isBill = raw.is_electricity_bill === true;
  const confidence = Math.max(0, Math.min(1, num(raw.confidence) ?? 0));
  const kwh = num(raw.kwh);
  const dollars = num(raw.total_dollars);
  const days = num(raw.days) !== undefined ? Math.round(num(raw.days)!) : daysBetween(raw.period_start, raw.period_end);
  const printedRate = num(raw.rate_cents_per_kwh);
  const utility = typeof raw.utility === "string" && raw.utility.trim() ? raw.utility.trim().slice(0, 60) : undefined;
  const periodEnd = toIsoDate(raw.period_end);

  if (!isBill) issues.push("This does not look like an electricity bill.");
  if (kwh === undefined) issues.push("No kWh figure was read.");
  if (dollars === undefined) issues.push("No total charge was read.");
  if (days === undefined) issues.push("No billing period was read; days defaulted to 30.");
  if (confidence < 0.7) issues.push("The model was not confident in the figures.");
  const blendedRate = kwh && dollars ? dollars / kwh : undefined;
  if (blendedRate !== undefined && (blendedRate < 0.04 || blendedRate > 0.8)) {
    issues.push(`${(blendedRate * 100).toFixed(1)} ¢/kWh is outside the range U.S. bills fall in; one of the figures is probably wrong.`);
  }
  if (printedRate !== undefined && blendedRate !== undefined && Math.abs(printedRate / 100 - blendedRate) / blendedRate > 0.5) {
    issues.push("The printed energy rate and total ÷ kWh disagree a lot; the total may include gas or other charges.");
  }
  if (typeof raw.notes === "string" && raw.notes.trim()) issues.push(raw.notes.trim().slice(0, 160));

  return { isBill, utility, kwh, days: days ?? (kwh && dollars ? 30 : undefined), dollars, periodEnd, printedRate, blendedRate, confidence, issues };
}

function toIsoDate(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function daysBetween(a: unknown, b: unknown): number | undefined {
  const s = toIsoDate(a);
  const e = toIsoDate(b);
  if (!s || !e) return undefined;
  const d = Math.round((Date.parse(e) - Date.parse(s)) / 86_400_000);
  return d > 0 && d < 400 ? d : undefined;
}
