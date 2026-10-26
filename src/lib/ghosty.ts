// Ghosty Insights: a plain-spoken read of one scan.
//
// The rule that keeps it honest is the same one the rest of the app follows:
// the model never does arithmetic that anybody acts on. Ghosty gets the scan's
// already-computed figures (devices, costs, fixes, paybacks) and is asked to
// notice, rank and explain - which item matters, what to do tonight for free,
// what looks odd, what to tell the principal. Any dollar figure it hands back is
// checked against the figures it was given and dropped if it does not fit.
//
// With no AI provider configured (or one that fails), the same card is filled by
// rules over the same figures, and says so. The card always has something useful
// on it; it never invents a number.

import type { ActionItem } from "./actions";
import type { Offender } from "./types";

export type InsightKind = "quick_win" | "habit" | "upgrade" | "watch" | "schedule";

export interface Insight {
  kind: InsightKind;
  title: string;
  detail: string;
  /** Dollars a year this would save, when the scan's own figures support one. */
  savings: number | null;
}

export interface GhostyReport {
  headline: string;
  insights: Insight[];
  /** "Before you leave" steps for this room or building. */
  checklist: string[];
  /** Ghosty's answer to the question asked, if one was. */
  answer: string | null;
  /** Who wrote it: an AI model, or the built-in rules. */
  source: "ai" | "rules";
  model?: string;
}

/** What Ghosty is told about a scan. Everything here is already computed by the app. */
export interface GhostyContext {
  place: "home" | "school" | "office";
  buildingName: string;
  ratePerKwh: number;
  emptyHoursPerYear: number;
  rooms: string[];
  totals: { annual: number; wasted: number; recoverable: number; co2Kg: number };
  devices: {
    label: string;
    count: number;
    state: string;
    room: string;
    wattsEach: number;
    wastePerYear: number;
    fix: string;
    fixCost: number;
    savingsPerYear: number;
    paybackMonths: number | null;
    confidence: string;
    /** Why this must not be switched off, when it must not (a fridge, a server, an exit sign). */
    keepOn: string | null;
  }[];
  moves: { title: string; device: string; room: string; cost: number; savingsPerYear: number; paybackMonths: number | null }[];
}

// ---- things that must stay on -----------------------------------------------------

/**
 * Devices whose job is to run day and night. "Switch it off tonight" is the
 * right advice for a projector and the wrong advice for a fridge full of food,
 * the server the phones run on, or an exit sign, so these get their own fix
 * (consolidate, set back, a timer on the lights) and never an off switch.
 */
const KEEP_ON_IDS: Record<string, string> = {
  fridge: "keep it on while it has food in it; an empty or unused one can usually be unplugged",
  vending_cold: "keep it on while it is stocked; an empty one can usually be unplugged",
  walk_in_cooler: "keep it on while it has food in it; an empty or unused one can usually be unplugged",
  reach_in_cooler: "keep it on while it has food in it; an empty or unused one can usually be unplugged",
  ice_machine: "shut it down only over long breaks, not nightly",
  server: "the network and phones depend on it",
  security_recorder: "building security depends on it",
  exit_sign: "it is required safety lighting",
  aquarium: "the animals in it depend on it",
  water_heater: "set it back on a timer rather than switching it off",
  rtu: "set it back at night rather than switching it off",
  heat_pump: "set it back at night rather than switching it off",
};

const KEEP_ON_WORDS: [RegExp, string][] = [
  [/fridge|freezer|refrigerat|cooler|ice machine/i, "keep it on while it has food in it; an empty or unused one can usually be unplugged"],
  [/server|router|modem|network switch|wi-?fi|access point|firewall|\bnas\b|phone system/i, "the network and phones depend on it"],
  [/security|cctv|camera|alarm|smoke|carbon monoxide|fire panel/i, "it is safety or security equipment"],
  [/exit sign|emergency light/i, "it is required safety lighting"],
  [/medical|cpap|oxygen|nebuli[sz]er/i, "it is medical equipment"],
  [/aquarium|fish tank|terrarium|incubator|vivarium/i, "the animals in it depend on it"],
  [/sump pump/i, "it keeps the building from flooding"],
];

/** Why a device must not be switched off, or null when switching it off is fine. */
export function keepOnReason(label: string, categoryId?: string): string | null {
  if (categoryId && KEEP_ON_IDS[categoryId]) return KEEP_ON_IDS[categoryId];
  for (const [re, why] of KEEP_ON_WORDS) if (re.test(label)) return why;
  return null;
}

const OFF_WORDS = /\b(unplug|switch(?:ing)? (?:it |them )?off|turn(?:ing)? (?:it |them )?off|shut(?:ting)? (?:it |them )?(?:off|down)|power(?:ing)? (?:it |them )?(?:off|down)|cut the power)\b/i;
/** Advice about a spare, empty or unused unit, which can be unplugged. */
const SPARE_WORDS = /\b(spare|surplus|extra|second|empty|unused|duplicate|holiday|break|summer|not (?:being )?used|not in use|nothing in it)\b/i;

/**
 * Whether a line of advice tells someone to switch off a thing that must stay
 * on. A model told not to can still slip; this is the check after it.
 */
export function unsafeAdvice(text: string, ctx: GhostyContext): boolean {
  if (!OFF_WORDS.test(text) || SPARE_WORDS.test(text)) return false;
  const named = ctx.devices.some((d) => d.keepOn && text.toLowerCase().includes(d.label.toLowerCase()));
  return named || KEEP_ON_WORDS.some(([re]) => re.test(text));
}

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildContext(input: {
  place: GhostyContext["place"];
  buildingName: string;
  ratePerKwh: number;
  emptyHoursPerYear: number;
  annual: number;
  wasted: number;
  recoverable: number;
  co2Kg: number;
  offenders: Offender[];
  actions: ActionItem[];
}): GhostyContext {
  const top = [...input.offenders].sort((a, b) => b.costPerYear - a.costPerYear).slice(0, 14);
  return {
    place: input.place,
    buildingName: input.buildingName.slice(0, 60),
    ratePerKwh: r2(input.ratePerKwh),
    emptyHoursPerYear: r0(input.emptyHoursPerYear),
    rooms: [...new Set(input.offenders.map((o) => o.source).filter(Boolean))].slice(0, 20),
    totals: { annual: r0(input.annual), wasted: r0(input.wasted), recoverable: r0(input.recoverable), co2Kg: r0(input.co2Kg) },
    devices: top.map((o) => ({
      label: o.label,
      count: o.count,
      state: o.state,
      room: o.source,
      wattsEach: r0(o.perUnitWatts),
      wastePerYear: r0(o.costPerYear),
      fix: o.action.label,
      fixCost: r0(o.fixCost),
      savingsPerYear: r0(o.annualSavings),
      paybackMonths: o.paybackMonths === null ? null : Math.round(o.paybackMonths * 10) / 10,
      confidence: o.confidence,
      keepOn: keepOnReason(o.label, o.categoryId),
    })),
    moves: input.actions.slice(0, 10).map((a) => ({
      title: a.title,
      device: a.label,
      room: a.where,
      cost: r0(a.cost),
      savingsPerYear: r0(a.annualSavings),
      paybackMonths: a.paybackMonths === null ? null : Math.round(a.paybackMonths * 10) / 10,
    })),
  };
}

/** A stable key for caching a report against the figures it was written from. */
export function contextKey(ctx: GhostyContext, question?: string): string {
  const s = JSON.stringify(ctx) + "|" + (question ?? "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// ---- the model's side ----------------------------------------------------------

export const GHOSTY_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One sentence, under 25 words: the single most important thing about this scan." },
    insights: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["quick_win", "habit", "upgrade", "watch", "schedule"] },
          title: { type: "string", description: "Under 10 words, an instruction." },
          detail: { type: "string", description: "One or two sentences, naming the device and room, using only figures from the data." },
          savings: { type: ["number", "null"], description: "Dollars a year, copied or summed from the data; null if the data has no figure for it." },
        },
        required: ["kind", "title", "detail", "savings"],
      },
    },
    checklist: { type: "array", maxItems: 5, items: { type: "string" }, description: "Before-you-leave steps, each under 12 words, most valuable first." },
    answer: { type: ["string", "null"], description: "The answer to the user's question, or null if none was asked." },
  },
  required: ["headline", "insights", "checklist", "answer"],
} as const;

export function buildPrompt(ctx: GhostyContext, question?: string, language?: string): string {
  const who =
    ctx.place === "home"
      ? "a household"
      : ctx.place === "office"
        ? "an office manager"
        : "a student, teacher or facilities manager at a school";
  return [
    `You are Ghosty, the energy coach inside Ghost Watt, an app that finds electricity left idle after hours. You are talking to ${who}.`,
    "Below are the results of a scan. Every figure was computed by the app from published wattages, the local electricity price and the hours the place stands empty. Treat them as correct.",
    "Rules:",
    "- Use ONLY figures that appear in the data, or sums of them. Never estimate, invent or round up a number. If you have no figure, say so or leave savings null.",
    "- Be specific: name the device, the room and the action. No generic energy-saving tips that ignore the data.",
    "- Plain words, no jargon. Say 'a year' not 'per annum'. Dollars without cents.",
    language && language !== "English"
      ? `- Write every text field (headline, titles, details, checklist, answer) in ${language}. Keep the JSON keys and the "kind" values in English.`
      : "",
    "- Free habit changes first, then cheap fixes with fast payback, then upgrades.",
    "- Some things must keep running. A device with keepOn set says why. Never tell anyone to switch off, unplug, turn off or shut down a server, router or network gear, security camera or recorder, alarm, exit or emergency light, medical equipment, aquarium, sump pump, water heater or heating. For those, suggest only their listed fix (for example a night setback or a timer on the lighting). The same goes for anything whose job is to run day and night, even if it is not marked.",
    "- Fridges, freezers and coolers depend on use: one that has food in it stays on, but one that is empty or not being used can usually be unplugged. Say it that way (for example 'if the second fridge is empty, unplug it'), never as a flat 'unplug the fridge'.",
    "- 'watch' insights flag something that looks odd or uncertain (low confidence, something running that should not be, one device dominating).",
    "- 'schedule' insights are about timers, shutdown routines or opening hours.",
    question
      ? `- The user asked: "${question}". Answer it directly in 'answer' (under 120 words; if they ask for a note or email, write it ready to send, under 150 words), using the data.`
      : "- No question was asked: set answer to null.",
    "",
    // Some providers take no schema, so the shape is spelled out here too.
    "Reply with ONLY a JSON object, no prose and no code fences, in exactly this shape:",
    '{"headline": "one sentence, under 25 words", "insights": [{"kind": "quick_win|habit|upgrade|watch|schedule", "title": "under 10 words", "detail": "one or two sentences", "savings": 123 or null}], "checklist": ["before-you-leave step, under 12 words"], "answer": "text or null"}',
    "Give 2 to 4 insights and 3 to 5 checklist steps.",
    "",
    "DATA:",
    JSON.stringify(ctx),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const KINDS: InsightKind[] = ["quick_win", "habit", "upgrade", "watch", "schedule"];

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Accept what the model returned only where it is consistent with the data.
 * A savings figure larger than everything the scan says is recoverable (with a
 * little slack for rounding) is not a figure from the data, so it is dropped.
 */
export function validateReport(raw: unknown, ctx: GhostyContext, model?: string): GhostyReport | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const headline = clean(o.headline, 220);
  if (!headline) return null;
  const ceiling = Math.max(ctx.totals.recoverable, ctx.totals.wasted) * 1.02 + 1;
  const insights: Insight[] = (Array.isArray(o.insights) ? o.insights : [])
    .slice(0, 4)
    .map((x): Insight | null => {
      const i = (x ?? {}) as Record<string, unknown>;
      const title = clean(i.title, 90);
      const detail = clean(i.detail, 360);
      if (!title || !detail) return null;
      const n = Number(i.savings);
      const savings = i.savings === null || !Number.isFinite(n) || n <= 0 || n > ceiling ? null : Math.round(n);
      return { kind: KINDS.includes(i.kind as InsightKind) ? (i.kind as InsightKind) : "quick_win", title, detail, savings };
    })
    .filter((x): x is Insight => x !== null)
    // Never show advice to switch off a fridge, a server or an exit sign, however it was worded.
    .filter((x) => !unsafeAdvice(`${x.title} ${x.detail}`, ctx));
  const checklist = (Array.isArray(o.checklist) ? o.checklist : [])
    .map((c) => clean(c, 100))
    .filter((c) => c && !unsafeAdvice(c, ctx))
    .slice(0, 5);
  const answer = clean(o.answer, 1400) || null;
  return { headline, insights, checklist, answer, source: "ai", model };
}

/** Pull a JSON object out of a reply that may have prose or fences around it. */
export function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

// ---- the rules' side -------------------------------------------------------------

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** The same card from rules alone, for when no model is available. */
export function rulesReport(ctx: GhostyContext, question?: string): GhostyReport {
  const d = ctx.devices;
  const insights: Insight[] = [];
  const wasted = ctx.totals.wasted;

  if (!d.length || wasted <= 0) {
    return {
      headline: "Nothing in this scan is sitting idle after hours. That is exactly what you want to find.",
      insights: [],
      checklist: ["Scan another room, ideally after everyone has gone home"],
      answer: question ? "There is nothing idle in this scan to work with yet. Scan a room that is still lit or running after hours." : null,
      source: "rules",
    };
  }

  const top = d[0];
  const share = wasted > 0 ? top.wastePerYear / wasted : 0;
  const free = ctx.moves.filter((m) => m.cost === 0 && m.savingsPerYear > 0);
  const fast = ctx.moves
    .filter((m) => m.cost > 0 && m.paybackMonths !== null && m.paybackMonths <= 6)
    .sort((x, y) => y.savingsPerYear - x.savingsPerYear);
  const standby = d.filter((x) => x.state === "standby");
  const unsure = d.filter((x) => x.confidence === "low");

  const headline =
    share >= 0.4
      ? `${top.count > 1 ? `${top.count} ${top.label.toLowerCase()}s` : `The ${top.label.toLowerCase()}`} in ${top.room} ${top.count > 1 ? "are" : "is"} ${Math.round(share * 100)}% of the idle cost here: ${money(top.wastePerYear)} a year.`
      : `${money(wasted)} a year goes to things left on after hours, and ${money(ctx.totals.recoverable)} of it can be won back.`;

  if (free.length) {
    const sum = free.reduce((s, m) => s + m.savingsPerYear, 0);
    insights.push({
      kind: "habit",
      title: "Start with what costs nothing",
      detail: `${cap(free.slice(0, 3).map((m) => `${m.title.toLowerCase()} (${m.room})`).join("; "))}. No purchase needed.`,
      savings: Math.round(sum),
    });
  }
  if (fast.length) {
    const m = fast[0];
    insights.push({
      kind: "quick_win",
      title: `${m.title}`,
      detail: `For ${things(m.device, ctx.devices.find((x) => x.label === m.device && x.room === m.room)?.count ?? 1)} in ${m.room}: ${money(m.cost)} once, ${money(m.savingsPerYear)} back a year, paid off in ${months(m.paybackMonths!)}.`,
      savings: m.savingsPerYear,
    });
  }
  if (share >= 0.4 && !fast.some((m) => m.device === top.label)) {
    insights.push({
      kind: "watch",
      title: `Focus on the ${top.label.toLowerCase()}`,
      detail: `One line, ${top.label} in ${top.room}, is ${Math.round(share * 100)}% of everything idle. ${top.fix} saves ${money(top.savingsPerYear)} a year.`,
      savings: top.savingsPerYear,
    });
  }
  if (standby.length) {
    const sum = standby.reduce((s, x) => s + x.wastePerYear, 0);
    insights.push({
      kind: "schedule",
      title: "Standby is not off",
      detail: `${cap(standby.slice(0, 3).map((x) => things(x.label, x.count).replace(/^the /, "")).join(", "))} ${standby.length === 1 && standby[0].count === 1 ? "is" : "are"} asleep, not off, costing ${money(sum)} a year. A timed power strip or shutdown routine clears it.`,
      savings: null,
    });
  }
  if (unsure.length && insights.length < 4) {
    insights.push({
      kind: "watch",
      title: "Double-check before you buy",
      detail: `${unsure[0].label} in ${unsure[0].room} was read with low confidence. Confirm it on the device list before spending money on it.`,
      savings: null,
    });
  }

  // "Switch off" only for things that can be: a fridge or a server gets its own fix instead.
  const where = (x: (typeof d)[number]) => (ctx.rooms.length > 1 ? ` (${x.room})` : "");
  const checklist = d
    .filter((x) => !x.keepOn)
    .slice(0, 4)
    .map((x) => `${x.state === "standby" ? "Fully switch off" : "Switch off"} ${things(x.label, x.count)}${where(x)}`);
  const stay = d.find((x) => x.keepOn);
  if (stay) {
    // A fridge depends on use: on while it has food in it, unplugged when it is empty.
    const inUse = /empty or unused|while it is stocked/.test(stay.keepOn ?? "");
    checklist.push(
      inUse
        ? `Keep ${things(stay.label, stay.count)} on if in use${where(stay)}; unplug any that are empty`
        : `Leave ${things(stay.label, stay.count)} on${where(stay)}: ${stay.fix.toLowerCase()} instead`,
    );
  }

  const answer = question ? rulesAnswer(ctx, question) : null;

  return { headline, insights: insights.slice(0, 4), checklist, answer, source: "rules" };
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const months = (m: number) => (m < 1 ? "under a month" : Math.round(m) === 1 ? "1 month" : `${Math.round(m)} months`);

/** Plural-aware "the 30 computer monitors" / "the projector". */
function things(label: string, count: number): string {
  const l = label.toLowerCase();
  return count > 1 ? `the ${count} ${l.endsWith("s") ? l : l + "s"}` : `the ${l}`;
}

/**
 * Answer the common questions from the figures alone: a budget, "what's free
 * tonight", a note to the principal, or "what first". Said plainly that it's the
 * short version, since no model wrote it.
 */
export function rulesAnswer(ctx: GhostyContext, question: string): string {
  const q = question.toLowerCase();
  const d = ctx.devices;
  if (!d.length) return "There is nothing idle in this scan to work with yet.";
  const top = d[0];
  const free = ctx.moves.filter((m) => m.cost === 0 && m.savingsPerYear > 0);
  const budget = /\$\s?(\d[\d,]*)/.exec(question);

  if (budget) {
    let left = Number(budget[1].replace(/,/g, ""));
    const start = left;
    const picks: GhostyContext["moves"] = [];
    const byValue = [...ctx.moves]
      .filter((m) => m.savingsPerYear > 0)
      .sort((x, y) => (x.cost === 0 ? -Infinity : x.cost / x.savingsPerYear) - (y.cost === 0 ? -Infinity : y.cost / y.savingsPerYear));
    for (const m of byValue) {
      if (m.cost <= left) {
        picks.push(m);
        left -= m.cost;
      }
    }
    if (!picks.length) return `Nothing in this scan's fix list fits in ${money(start)}. The cheapest is ${ctx.moves.length ? money(Math.min(...ctx.moves.map((m) => m.cost))) : "not listed"}.`;
    const spent = start - left;
    const back = picks.reduce((s, m) => s + m.savingsPerYear, 0);
    return `With ${money(start)}: ${picks.map((m) => `${m.title.toLowerCase()} in ${m.room} (${m.cost ? money(m.cost) : "free"}, saves ${money(m.savingsPerYear)} a year)`).join("; ")}. That spends ${money(spent)} and brings back about ${money(back)} a year.`;
  }

  if (/free|tonight|no cost|nothing to buy/.test(q)) {
    const steps = d
      .filter((x) => !x.keepOn)
      .slice(0, 3)
      .map((x) => `switch off ${things(x.label, x.count)} in ${x.room}`);
    if (!steps.length) return `Everything idling here needs to keep running (${things(top.label, top.count)}: ${top.keepOn}). The fix is ${top.fix.toLowerCase()}, not a switch.`;
    return `Tonight, for free: ${steps.join(", ")}.${free.length ? ` Free changes in the fix list add up to ${money(free.reduce((s, m) => s + m.savingsPerYear, 0))} a year.` : ""} Doing it every night saves up to ${money(ctx.totals.wasted)} a year.`;
  }

  if (/principal|note|email|letter|facilities|write/.test(q)) {
    const moves = [...ctx.moves].sort((x, y) => y.savingsPerYear - x.savingsPerYear).slice(0, 3);
    const cost = moves.reduce((s, m) => s + m.cost, 0);
    const back = moves.reduce((s, m) => s + m.savingsPerYear, 0);
    return [
      `Hi,`,
      ``,
      `We scanned ${ctx.buildingName} after hours with Ghost Watt. Things left on cost about ${money(ctx.totals.wasted)} a year while nobody is there. The biggest is ${things(top.label, top.count)} in ${top.room} at ${money(top.wastePerYear)} a year.`,
      ``,
      `Three fixes would bring back about ${money(back)} a year for ${cost ? money(cost) : "nothing"} up front: ${moves.map((m) => `${m.title.toLowerCase()} (${m.room})`).join(", ")}.`,
      ``,
      `Could we talk about trying them? We can share the full report.`,
    ].join("\n");
  }

  return `Start with ${things(top.label, top.count)} in ${top.room}: ${money(top.wastePerYear)} a year idle, and ${top.fix.toLowerCase()} saves ${money(top.savingsPerYear)}.${free.length ? ` Free changes alone save ${money(free.reduce((s, m) => s + m.savingsPerYear, 0))} a year.` : ""} (Short answer from the numbers; Ghosty's AI isn't available on this site right now.)`;
}
