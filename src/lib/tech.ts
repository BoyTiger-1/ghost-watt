// What the photo says about *which* device this is.
//
// The catalog band for "overhead lighting" runs 40 W to 250 W, and that is not
// imprecision - it is two different objects. A four-lamp T12 troffer with a
// magnetic ballast draws about 180 W. The LED panel that replaced it draws about
// 40 W. Same fixture opening, same photograph, four and a half times the money.
//
// A vision model is good at exactly this call. Asked "what technology is this?"
// it answers "T8 fluorescent" or "LED troffer" or "CRT" reliably, because that is
// a perceptual judgement about an object's appearance - lamp tube, diffuser,
// bezel depth, colour of the light. It is much worse at "how many watts is it?",
// which is an arithmetic judgement it has no way to make. So the model's
// *categorical* read is treated as strong evidence and its *numeric* read as
// weak evidence, which is the right way round and the opposite of how a naive
// pipeline uses them.
//
// Two channels live here:
//
//   technology   a named lamp, panel or backlight type, matched to the draw that
//                technology actually has in that fixture class.
//   screen size  a diagonal in inches, turned into watts through the area law
//                that display power actually follows.
//
// Both are reported as a watt figure plus a log-normal sigma, so lib/estimate.ts
// can fold them into the same posterior as the catalog prior and the model's own
// guess instead of overriding anything.

export interface TechRule {
  match: RegExp;
  /** Running draw this technology has in this fixture class, W (before duty cycle). */
  watts: number;
  label: string;
  /** How tight the reading is, as a log-normal sigma. Omitted: DEFAULT_TECH_SIGMA. */
  sigma?: number;
}

/**
 * A named technology pins the draw to about +/- 40% at 90% confidence.
 *
 * Tighter than the model's free-form watt guess (AI_SIGMA, 0.36, about x/÷1.8)
 * because naming a technology is a far easier call than estimating a wattage,
 * and much tighter than the catalog band it replaces, which spans the whole
 * installed base of a fixture class.
 */
export const DEFAULT_TECH_SIGMA = 0.22;
/** A technology word that narrows the class but not the unit ("fluorescent", "LED"). */
export const VAGUE_TECH_SIGMA = 0.3;

/**
 * Technology by device class, most specific pattern first.
 *
 * Figures are the draw of a whole unit of that fixture class in that technology -
 * a four-lamp troffer, not one lamp - so they sit on the same footing as the
 * catalog's wattsOn and can be compared with it directly.
 */
export const TECH_BY_CATEGORY: Record<string, TechRule[]> = {
  // A bank of troffers or a high bay. Lamp count is the usual four unless the
  // words say otherwise, and the ballast adds roughly 10-15%.
  ceiling_light: [
    { match: /\bled\b.{0,12}high[- ]bay|high[- ]bay.{0,12}\bled\b/i, watts: 150, label: "LED high bay" },
    { match: /sodium|metal[- ]halide|\bhid\b|mercury vapou?r/i, watts: 450, label: "HID (metal halide or sodium)" },
    { match: /high[- ]bay/i, watts: 400, label: "HID high bay", sigma: 0.35 },
    { match: /\bt-?12\b/i, watts: 180, label: "T12 fluorescent" },
    { match: /\bt-?8\b/i, watts: 110, label: "T8 fluorescent" },
    { match: /\bt-?5\b/i, watts: 90, label: "T5 fluorescent" },
    { match: /\bcfl\b|compact fluor/i, watts: 55, label: "compact fluorescent" },
    { match: /incandescent|halogen/i, watts: 150, label: "incandescent" },
    { match: /fluor/i, watts: 110, label: "fluorescent", sigma: VAGUE_TECH_SIGMA },
    { match: /\bled\b/i, watts: 40, label: "LED", sigma: VAGUE_TECH_SIGMA },
  ],
  // One lamp in a can, a pendant or a track head.
  downlight: [
    { match: /incandescent/i, watts: 60, label: "incandescent" },
    { match: /halogen|\bpar-?\d\d\b|\bmr-?16\b/i, watts: 50, label: "halogen" },
    { match: /\bcfl\b|compact fluor|fluor/i, watts: 14, label: "CFL" },
    { match: /\bled\b/i, watts: 9, label: "LED" },
  ],
  exterior_light: [
    { match: /metal[- ]halide/i, watts: 400, label: "metal halide" },
    { match: /high[- ]pressure sodium|\bhps\b|sodium/i, watts: 250, label: "high-pressure sodium" },
    { match: /mercury vapou?r/i, watts: 400, label: "mercury vapour" },
    { match: /\bhid\b/i, watts: 320, label: "HID", sigma: 0.3 },
    { match: /\bled\b/i, watts: 80, label: "LED" },
  ],
  exit_sign: [
    { match: /incandescent/i, watts: 40, label: "incandescent" },
    { match: /\bcfl\b|fluor/i, watts: 11, label: "fluorescent" },
    { match: /\bled\b|photoluminescent|tritium/i, watts: 2, label: "LED" },
  ],
  stage_light: [
    { match: /tungsten|halogen|incandescent|\bpar-?64\b|fresnel/i, watts: 1000, label: "tungsten" },
    { match: /\bled\b/i, watts: 180, label: "LED" },
    { match: /discharge|arc|\bhmi\b/i, watts: 575, label: "arc discharge" },
  ],
  // Backlight technology is the whole story on a desktop monitor.
  monitor: [
    { match: /\bcrt\b|cathode|tube monitor/i, watts: 75, label: "CRT" },
    { match: /ccfl|cold cathode/i, watts: 40, label: "CCFL-backlit LCD" },
    { match: /oled/i, watts: 30, label: "OLED" },
    { match: /\bled\b|\bips\b|\blcd\b/i, watts: 18, label: "LED-backlit LCD", sigma: VAGUE_TECH_SIGMA },
  ],
  tv: [
    { match: /plasma/i, watts: 300, label: "plasma" },
    { match: /\bcrt\b|cathode|tube tv/i, watts: 110, label: "CRT" },
    { match: /ccfl|cold cathode/i, watts: 150, label: "CCFL-backlit LCD" },
    { match: /oled/i, watts: 110, label: "OLED" },
    { match: /qled|mini[- ]?led|micro[- ]?led/i, watts: 100, label: "QLED" },
    { match: /\bled\b|\blcd\b/i, watts: 75, label: "LED-backlit LCD", sigma: VAGUE_TECH_SIGMA },
  ],
  projector: [
    { match: /laser/i, watts: 160, label: "laser" },
    { match: /\bled\b/i, watts: 100, label: "LED" },
    { match: /lamp|bulb|\buhp\b|mercury/i, watts: 280, label: "lamp-based" },
    { match: /\bdlp\b|\blcd\b/i, watts: 260, label: "lamp-based", sigma: VAGUE_TECH_SIGMA },
  ],
  smartboard: [
    // The first generation was a whiteboard plus a ceiling projector; the panel
    // that replaced it draws about half as much and looks completely different.
    { match: /projector|projection/i, watts: 300, label: "projector-based whiteboard" },
    { match: /\bled\b|flat panel|interactive flat/i, watts: 150, label: "LED interactive panel", sigma: VAGUE_TECH_SIGMA },
  ],
  digital_signage: [
    { match: /\bled\b.{0,12}(wall|panel|matrix)|direct[- ]view/i, watts: 350, label: "direct-view LED wall" },
    { match: /\blcd\b|\bled\b/i, watts: 120, label: "LED-backlit LCD", sigma: VAGUE_TECH_SIGMA },
  ],
  // A tower's class is most of its idle draw.
  desktop: [
    { match: /workstation|\bxeon\b|threadripper|render|gaming|graphics card|\bgpu\b|\brtx\b/i, watts: 180, label: "workstation or gaming tower", sigma: 0.3 },
    { match: /mini[- ]?pc|\bnuc\b|thin client|chromebox|micro form|\bsff\b|small form/i, watts: 20, label: "mini PC or thin client" },
    { match: /all[- ]in[- ]one|\bimac\b/i, watts: 60, label: "all-in-one" },
    { match: /\bmac ?mini\b/i, watts: 20, label: "Mac mini" },
  ],
  // Refrigeration: the sealed-system technology and the cabinet style.
  fridge: [
    { match: /walk[- ]?in|cool ?room|cold ?room/i, watts: 900, label: "walk-in", sigma: 0.35 },
    { match: /chest freezer|deep freeze/i, watts: 120, label: "chest freezer" },
    { match: /glass door|display case|reach[- ]?in|merchandiser/i, watts: 350, label: "glass-door merchandiser", sigma: 0.3 },
    { match: /mini[- ]?fridge|bar fridge|compact|dorm|under[- ]?counter/i, watts: 70, label: "compact fridge" },
    { match: /side[- ]by[- ]side|french door/i, watts: 130, label: "side-by-side" },
    { match: /inverter|variable speed/i, watts: 70, label: "inverter compressor" },
  ],
  vending_cold: [
    { match: /\bled\b.{0,20}(lit|light)|energy ?star|vendingmiser|occupancy/i, watts: 280, label: "efficient machine" },
    { match: /fluor/i, watts: 500, label: "fluorescent-lit machine" },
    { match: /glass front/i, watts: 450, label: "glass-front machine", sigma: 0.3 },
  ],
  ac_window: [
    { match: /inverter|variable speed|mini[- ]split/i, watts: 600, label: "inverter" },
    { match: /through[- ]wall|\bptac\b/i, watts: 1100, label: "PTAC", sigma: 0.3 },
  ],
  space_heater: [
    { match: /oil[- ]fill|radiator|convect|ceramic|fan heater|quartz|resist/i, watts: 1500, label: "resistance heater" },
    { match: /heat pump|\bptac\b/i, watts: 600, label: "heat-pump heater" },
  ],
  // Element rating, not average draw: the catalog's duty cycle turns these into
  // an annual average, as it does for every other reading in this table. A
  // tankless heater is deliberately absent - its element is four times a tank's
  // and its duty cycle a quarter, so a figure here could only get it wrong.
  water_heater: [
    { match: /heat pump|hybrid/i, watts: 500, label: "heat-pump water heater" },
    { match: /resist|element|electric tank|\bimmersion\b/i, watts: 4500, label: "resistance tank" },
  ],
  server: [
    { match: /blade|rack.{0,10}(unit|server)s|\b[2-9]u\b/i, watts: 500, label: "rack server", sigma: 0.4 },
    { match: /\bnas\b|network attached|synology|micro ?server|tower server/i, watts: 60, label: "NAS or microserver" },
  ],
  copier: [
    { match: /production|high[- ]volume|floor[- ]standing/i, watts: 300, label: "production copier", sigma: 0.35 },
    { match: /desktop|multifunction|\bmfp\b/i, watts: 90, label: "desktop multifunction" },
  ],
  printer: [
    { match: /laser/i, watts: 90, label: "laser" },
    { match: /ink ?jet|inkjet|thermal/i, watts: 15, label: "inkjet" },
  ],
};

export interface TechReading {
  /** Running draw this technology implies, W (before duty cycle). */
  watts: number;
  label: string;
  sigma: number;
}

/**
 * The technology named anywhere in what the model said about this device.
 *
 * `words` is everything the engine wrote - the tech field, the evidence phrase,
 * the device label - because a model that was not asked for a technology often
 * mentions it anyway ("old fluorescent troffers, two tubes out").
 */
export function readTech(categoryId: string, words: string): TechReading | null {
  const rules = TECH_BY_CATEGORY[categoryId];
  if (!rules || !words) return null;
  for (const r of rules) {
    if (r.match.test(words)) {
      return { watts: r.watts, label: r.label, sigma: r.sigma ?? DEFAULT_TECH_SIGMA };
    }
  }
  return null;
}

// ---- screen size --------------------------------------------------------

/**
 * Watts per square inch of panel, by display class.
 *
 * Display power scales with area, not diagonal, which is why a 65-inch TV draws
 * four times a 32-inch one rather than twice. The coefficients are least-squares
 * fits to the catalog's own sized rows, which come from manufacturer figures:
 *
 *   monitor  0.098 W/in^2   fitted to 19"/18 W, 22"/20 W, 24"/22 W, 27"/30 W,
 *                           32"/40 W; reproduces them to 15% or better
 *   tv       0.045 W/in^2   55" -> 58 W, against the 58.6 W average measured
 *                           across 107 current efficient televisions
 *   panel    0.083 W/in^2   fitted to the catalog's 75-inch interactive panel
 *                           at 200 W; 86" -> 262 W, 65" -> 150 W
 *
 * Monitors run hotter per unit area than televisions because they are brighter
 * at the distances they are viewed from and have no power-saving picture modes.
 */
const WATTS_PER_SQ_IN: Record<string, number> = {
  monitor: 0.098,
  tv: 0.045,
  smartboard: 0.083,
  digital_signage: 0.083,
};

/** Panel area of a 16:9 display, square inches, from the diagonal. 144/337 = 0.4273. */
export const AREA_16_9 = 144 / 337;

/** A diagonal in inches is a solid read; a watt figure derived from it is +/- 50%. */
export const SIZE_SIGMA = 0.26;

// Only an unambiguous diagonal counts. A bare "in" is excluded on purpose: "24 in
// the corner" is not a screen size, and a wrong size is worse than no size.
const SIZE_RE = /\b(\d{2,3})\s*-?\s*(?:inch(?:es)?\b|["”″])/i;

export interface SizeReading {
  inches: number;
  watts: number;
  sigma: number;
}

/**
 * A display's draw from its stated diagonal.
 *
 * Only for the generic display classes: the long-tail catalog already has a row
 * per size ("computer monitor 24 inch"), and re-deriving the size for one of
 * those would be arguing with a figure that already came from the size.
 */
export function readScreenSize(categoryId: string, words: string): SizeReading | null {
  const perSqIn = WATTS_PER_SQ_IN[categoryId];
  if (!perSqIn || !words) return null;
  const m = SIZE_RE.exec(words);
  if (!m) return null;
  const inches = Number(m[1]);
  // Below 10 inches it is not one of these classes; above 120 it is a video wall,
  // which does not follow a single-panel area law.
  if (!Number.isFinite(inches) || inches < 10 || inches > 120) return null;
  return { inches, watts: perSqIn * AREA_16_9 * inches * inches, sigma: SIZE_SIGMA };
}

/**
 * Everything the engine said about one device, as one lowercase haystack for the
 * two readers above.
 */
export function evidenceWords(parts: readonly (string | undefined)[]): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}
