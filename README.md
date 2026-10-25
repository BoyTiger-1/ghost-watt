# Ghost Watt

Point a phone at a room, or upload a photo, and Ghost Watt finds the powered things in it
(screens, computers, lights, appliances), prices each one at your real electricity rate,
separates what it costs in normal use from what it wastes after hours or in standby, and
ranks the fixes by dollars saved per dollar spent. Rooms roll up into a building, the
building into a 3D model lit up by its waste and a one-page brief a facilities manager,
landlord or owner can act on.

Two reading paths, and the pill in the header always says which one is about to run:
**On-device** (a small detector in the browser; no picture ever leaves the device) or
**Enhanced (cloud)** (a hosted vision model reads the photo and discards it). The energy
math is plain, deterministic code you can read top to bottom, every figure is a range
with a cited source, and nothing is ever filled in from a preset: a scan that could not
be read says so.

> Take any building's invisible energy waste (a home, an office, a school) and make it
> visible, countable, and actually fixable.

Ghost Watt is free and open source under the [MIT License](LICENSE).

## Contents

- [Why it matters](#why-it-matters)
- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Open source](#open-source)
- [Data and sources](#data-and-sources)
- [Responsible AI](#responsible-ai)
- [Accessibility](#accessibility)
- [Project layout](#project-layout)
- [Hosting and deployment](#hosting-and-deployment)
- [AI assistance](#ai-assistance)
- [License](#license)

## Why it matters

Households, offices and schools all want to cut waste and carbon. The problem is you can't
fix what you can't see, and after-hours energy waste is exactly the kind of thing nobody
notices. One projector left running overnight is about 250 W of pure loss. Add a hallway of
lights, a row of idle monitors, a vending machine or a forgotten TV, and it quietly adds up
to thousands of dollars and hundreds of kilos of CO2 a year. A proper energy audit normally
means meters, spreadsheets, or paying a consultant. This needs a phone and about ten minutes.

And the output isn't another dashboard to nod at. It's a to-do list in priority order: fix
this first, here's the price, here's the payback.

## What it does

**Scanning**

- **Live camera with wattage tags.** Point the camera and every powered thing in view gets a
  tag with its draw in watts, largest first, plus what it is and what it costs a year. A meter
  in the corner adds up the watts drawing in view right now. Tap a tag to see the published
  range for that kind of device, what it costs left on versus at typical use, and to correct
  it: set it on, standby or off, or say what it really is from the catalog. Corrections flow
  into the totals and the saved photo.
- **Photo and video.** Take a photo, record a walkthrough, or upload pictures and clips (drag,
  paste or pick). A photo's EXIF sets where and when it was taken, which sets the rate and
  whether the room should have been empty.
- **Type it in.** No camera, or the model got something wrong: search a catalog of over
  1,000 device types and add them by hand, with your own wattage, count and hours if you
  know them.
- **Bill reading.** Photograph a line of a utility bill; once you confirm it, its rate beats
  every estimate.

**Acting on it**

- **A ranked plan.** Every device gets up to two moves (the after-hours fix and an efficient
  swap) ranked by dollars saved per dollar spent, with payback and carbon re-totalled live as
  you tick them.
- **Rebates and replacements.** For each swap, the rebates and tax credits available where you
  are (via Rewiring America when a key is set), and links to the replacement at well-known
  retailers.
- **Ghosty Insights.** A plain-language read of your results: what stands out, what to do
  first, and why, grounded in the numbers on the page.

**Whole buildings**

- **Places, rooms and buildings.** Every scan saves to a room; rooms roll up into buildings,
  buildings into a portfolio, and any of them into a printable one-page brief.
- **3D school.** Search for your school by name. Its real outline and number of floors come
  from OpenStreetMap; upload a photo of each floor plan, mark the rooms (or let the AI suggest
  them), and every scanned room becomes a block on the model, coloured from cool blue to red
  by what it wastes after hours. Filter by lighting, screens, computers and more, pull the
  floors apart, and click any room for its breakdown.
- **Team scan.** Share a class code and a group scans a building together; every room lands
  in one place.
- **Room stickers.** Print a QR sticker for each room so the next scan of that room is one tap
  away.

**Context**

- Local electricity prices, grid carbon intensity, weather and solar potential, each from a
  public source when a location is known, and the app's own fallback figures otherwise.
- Nine languages: English, Spanish, Chinese (Simplified), Tagalog, Vietnamese, French,
  Korean, Portuguese and Hindi.
- Works offline as an installable web app once loaded; scans are stored on the device.

## How it works

The whole design rests on one idea: keep the fuzzy part and the exact part separate. A
model guesses what's in the room. The code does the money and carbon. That way the numbers
people actually act on are always something you can check by hand.

1. **Seeing.** A picture is read by one of two engines. In **Enhanced (cloud)** mode a
   hosted vision-language model (Anthropic, Gemini, Groq, Mistral, OpenAI or OpenRouter, or
   a local Ollama model during development) answers through a strict JSON schema at
   temperature 0: for each item, its type, count, state, a confidence and whether it is
   actually visible. In **On-device** mode an EfficientDet-Lite0 detector plus a lit-fixture
   finder read the picture in the browser. Both report only what is in the frame; neither
   touches energy.
2. **Cross-checking.** Every cloud reading is compared with the on-device detector. A class
   or count the detector cannot back, or a low-confidence item, is shown as *unverified*
   and left out of totals until you confirm it. Any detection can be confirmed, re-typed,
   given a wattage, quantity or hours, or deleted. "X of Y units located" stays visible.
3. **Counting.** Each device is matched to the wattage table in
   [`src/lib/devices.ts`](src/lib/devices.ts) (a published band per class, not a point) and
   costed two ways in [`src/lib/energy.ts`](src/lib/energy.ts): at typical use for its room
   type (hours a day in use, standby the rest; [`src/lib/rooms.ts`](src/lib/rooms.ts)) and
   as after-hours waste (what it draws through the building's empty hours in the state it
   was seen). Totals are 80% ranges from a Monte Carlo over wattage, hours and price.
4. **Deciding.** Each line gets up to two moves, the after-hours fix and an efficient swap,
   ranked by dollars saved per dollar spent ([`src/lib/actions.ts`](src/lib/actions.ts)).
   Tick moves and the annual bill, payback and carbon re-total live.

### Scanning: camera and upload

- **Camera** runs the on-device detector on the live video as a *candidate finder*: a box is
  drawn only after it has been seen in three of the last five frames, tracked so it does not
  flicker, limited to the classes the small model is reliably good at, with bright windows,
  huge rectangles and overlapping labels filtered out. Each tag shows the device's watts,
  easing toward a new reading instead of jumping
  ([`src/lib/wattTags.ts`](src/lib/wattTags.ts)). Hold the camera still and that frame goes
  through the same pipeline a photo gets (cloud in Enhanced mode, a tiled on-device pass
  otherwise), and the confirmed reading replaces the candidates. **Photo** audits the current
  frame; **Video** records a walkthrough and audits its distinct views once.
- **Upload** takes photos or videos (drag, paste or pick).

The detector choice is measured, not assumed: see
[`docs/live-detector-benchmark.md`](docs/live-detector-benchmark.md) for EfficientDet-Lite0
against Lite2 and YOLOv8n (ONNX Runtime Web) on 40 Open Images photos.

### Two costs, real prices, and an efficiency verdict

- **Left on vs. typical use.** Each device shows what it costs if it is left on
  whenever the space is empty (the phantom-load figure), and what it costs at typical
  use: hours actually in use for that kind of room (office, classroom, bedroom,
  kitchen and others), standby the rest ([`src/lib/rooms.ts`](src/lib/rooms.ts),
  [`src/lib/usage.ts`](src/lib/usage.ts)). Home lamp hours come from the PNNL
  residential lighting study, monitor duty from ENERGY STAR, TV hours from Nielsen;
  the rest are marked as the app's own estimates. Pick **Home / School / Office** on
  the scanner and the room type on each capture.
- **Prices.** A home pays the residential rate and an office or school the
  commercial one, often 2x apart in the same state. When a capture has a location,
  the serving utility's current published tariff comes from OpenEI's Utility Rate
  Database, at the marginal rate a typical customer's month reaches, hour-weighted for
  time-of-use plans ([`src/lib/tariff.ts`](src/lib/tariff.ts)). Otherwise the
  state's 2024 average for that sector (EIA, Table 4). A line off a real bill, typed
  or read from a photo of the bill and confirmed by you, beats both. A plug-in meter
  reading for a device replaces its wattage, and the Method page keeps an
  estimated-vs-measured table of every such reading.
- **Efficiency.** Every device is graded A-F against an efficient modern
  equivalent (an LED bulb, an ENERGY STAR monitor, an LED troffer...) and given a
  verdict: *replace* (with savings and payback at typical use), *fix the habit*
  (efficient but left on), *standby*, or *fine* ([`src/lib/efficiency.ts`](src/lib/efficiency.ts)).
  With an AI key, the model reports each unit's technology (halogen, T12, CRT...), so
  grades reflect the actual unit rather than a typical one.

### Four corrections most estimates leave out

Each is the identity until its input exists, so a scan with nothing but a photo gets
the plain `watts x hours x rate` and nothing invented on top of it.

- **Which unit it is** ([`src/lib/tech.ts`](src/lib/tech.ts)). The band for overhead
  lighting runs 40 W to 250 W, and that is not imprecision - it is two different
  objects. A four-lamp T12 troffer draws about 180 W; the LED panel that replaced it
  draws about 40 W. A vision model answers *which technology is this* well and *how
  many watts is it* badly, so the first is weighted above the second, and a stated
  screen diagonal goes through the area law display power actually follows. The same
  table grades the device and prices it, so a card's verdict and its dollars can
  never rest on different wattages.
- **The watt you pay for twice** ([`src/lib/thermal.ts`](src/lib/thermal.ts)). Every
  watt a device draws leaves it as heat, so in a cooled building its real cost is its
  electricity plus the cooling that removes the heat - about a third as much again -
  and in an electrically heated one part of that comes back in winter. Sized from the
  state's degree days ([`src/lib/climate.ts`](src/lib/climate.ts)), and applied only
  once the building says how it is heated and cooled. Nothing is applied to the
  heating and cooling plant itself, whose consumption already *is* the conditioning.
- **The price of the empty hours** ([`src/lib/tariff.ts`](src/lib/tariff.ts)).
  Everything here is about the hours a building is empty, and on a time-of-use tariff
  those are not billed at the average of the year. Which way it goes is not something
  you can assume: a building that shuts at four (an office or a school, say) is closed
  through an evening peak (so its overnight waste costs about a tenth *more* than the
  average said) and open through a midday one (about a fifth less). The tariff sheet has
  a price per hour and the schedule says which hours are empty; crossing the two is the
  whole calculation.
- **Answering to the meter** ([`src/lib/reconcile.ts`](src/lib/reconcile.ts)). A bill
  is the only hard measurement in the chain. If the lines add up to more plug and
  lighting energy than the meter leaves room for, the estimate comes down - each line
  giving up ground in proportion to its own size times its own uncertainty, so a wide
  catalog guess absorbs most of it and a plug-meter reading moves by about a
  thousandth as much. If it fits, nothing moves, and the fit is reported.

The cost range is a Monte Carlo over all of it, with the errors correlated the way
they actually are: one price for the building, one schedule, and one shared catalog
error per device class - because if the table's monitor figure is 20% high it is 20%
high for all twenty-eight monitors at once, and sampling them independently reports a
band several times narrower than the evidence supports
([`src/lib/estimate.ts`](src/lib/estimate.ts)).

### The 3D school

[`src/lib/campus.ts`](src/lib/campus.ts) lays three sources on one flat grid in metres: the
building outline from OpenStreetMap (found by school name through Nominatim, with Overpass
as a second source for nearby buildings), a photo of each floor plan with rooms drawn on it,
and each room's latest scan, matched to a plan room by name ("Room 214", "rm 214" and "214"
all match). A floor plan is fitted onto the outline by a rotation, scale and offset you can
adjust until the two line up. No outline: the plan's own rectangle stands in. The scene is
drawn with React Three Fiber and only re-renders when something changes.

### The pipeline at a glance

| Stage | Goes in | What happens | Comes out |
| --- | --- | --- | --- |
| See | Room photo (and an optional room type) | The in-browser detector (On-device) or a hosted vision model (Enhanced) lists devices, their on/standby/off state, and what each one looks like | Device observations |
| Weigh | Device observations | Catalog band, the technology read off the photo, a screen size, the model's own watt guess and any meter reading, combined as log-normal beliefs | Per-unit watts, with a spread |
| Count | Per-unit watts | x empty hours x the price in *those* hours x what its heat does to the building x grid carbon factor | kWh, dollars, CO2 per device |
| Check | Per-device cost | Reconcile the total against a real bill; propagate the spread by correlated Monte Carlo | Corrected figures and an honest range |
| Recommend | Per-device cost | Match each one to a concrete fix and savings rate, work out payback | Ranked offender cards |

You set the assumptions yourself (electricity rate, grid carbon intensity, how many hours a
year the building sits empty) and every figure on the page recalculates on the spot. The full
formulas and the wattage table are on the in-app Methodology page.

## Quick start

Requires Node.js 20 or newer.

```bash
git clone https://github.com/BoyTiger-1/ghost-watt.git
cd ghost-watt
npm install
npm run dev
```

Open http://localhost:3000. With no keys at all the app runs in **On-device** mode: the
scanner, live wattage tags, costs, plan, rooms, buildings, 3D school and brief all work, and
the pill in the header says so.

To turn on **Enhanced (cloud)** reading, copy [`.env.example`](.env.example) to `.env.local`,
add one or more vision keys, and restart. Keys are tried in this order, each a fallback for
the one before it, so two is better than one: `ANTHROPIC_API_KEY` (paid, best),
`GEMINI_API_KEY` (free tier, best free), `GROQ_API_KEY` (free, fastest), `MISTRAL_API_KEY`
(free tier), `OPENAI_API_KEY` (paid), `OPENROUTER_API_KEY` (some free models). Defaults per
provider: `claude-haiku-5-5`, `gemini-2.5-flash`, `qwen/qwen3.6-27b`,
`mistral-small-latest`, `gpt-4o-mini`, `google/gemini-2.5-flash`; override any with
`<KEY NAME>_MODEL`.

To keep everything on your own machine instead, run a local [Ollama](https://ollama.com)
vision model and the app uses it during development:

```bash
ollama pull moondream   # small and CPU-friendly; qwen2.5vl:3b or llama3.2-vision with more RAM
ollama serve
```

Other scripts: `npm test` runs the test suite, `npm run lint` runs ESLint, `npm run build`
makes a production build.

## Configuration

Every variable is optional. Copy [`.env.example`](.env.example) to `.env.local`; on Vercel,
add the same variables under Settings → Environment Variables and redeploy.

| Variable | What it turns on |
| --- | --- |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | Enhanced (cloud) reading, bill reading, AI room suggestions on floor plans, Ghosty Insights |
| `VISION_PROVIDER`, `VISION_TIMEOUT_MS` | Force one provider; how long to wait for it (default 45000 ms) |
| `OLLAMA_HOST`, `OLLAMA_VISION_MODEL`, `OLLAMA_TIMEOUT_MS` | A local Ollama model (defaults `http://127.0.0.1:11434`, `moondream`, 120000 ms) |
| `OPENEI_API_KEY` | The serving utility's own tariff for a location |
| `EIA_API_KEY` | Live state average electricity prices |
| `ELECTRICITY_MAPS_KEY` | Live grid carbon intensity |
| `NREL_API_KEY` | Solar potential for a location |
| `OPENWEATHER_API_KEY` | Local weather |
| `REWIRING_AMERICA_API_KEY` | Rebates and tax credits for each upgrade |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limits shared across server instances (otherwise kept in memory per instance) |
| `NEXT_PUBLIC_DETECTOR_MODEL_URL` | A custom on-device detector (for example one fine-tuned with `scripts/train-detector.py`) |

The Settings page shows which vision engine and data providers are active on the running server.

## Open source

Ghost Watt is MIT licensed: use it, change it, run it for your own school or business, or
build on it. The code is meant to be read; the energy math in particular is plain
TypeScript with the source of every figure next to it.

**Contributing.** Issues and pull requests are welcome.

1. Fork the repository and create a branch.
2. Make your change. Keep the split between perception (the models) and accounting (the
   code): a model may say what is in a picture, never what it costs.
3. Run `npm test` and `npm run lint` and make sure both pass. There are over 400 tests
   covering the energy math, parsing, the tracker, the 3D geometry and more.
4. If you change a wattage, hours figure or price, cite its source in
   [`src/lib/sources.ts`](src/lib/sources.ts) or on the row itself.
5. Open a pull request describing what changed and why.

**Built on open source.** Next.js and React, TypeScript, Tailwind CSS, Framer Motion,
three.js with React Three Fiber and drei for the 3D views, MediaPipe Tasks Vision for the
on-device detector, qrcode-generator for room stickers, and Vitest for tests. Each is used
under its own license.

**Open data.** Building outlines © OpenStreetMap contributors (ODbL), found through
Nominatim and Overpass; utility tariffs from OpenEI's Utility Rate Database; prices from
the U.S. Energy Information Administration; grid carbon from EPA eGRID. The full list is in
[Data and sources](#data-and-sources).

## Data and sources

Every figure the app multiplies by is listed, with its source, on the Method page
(`/methodology#sources`) and in [`src/lib/sources.ts`](src/lib/sources.ts):

- **Wattage table.** [`src/lib/devices.ts`](src/lib/devices.ts) and
  [`src/lib/appliances.ts`](src/lib/appliances.ts): a representative draw and a published
  low–high band per device class, with a source note on each row.
- **Standby draw.** LBNL's standby power summary table and the DOE microwave standby
  analysis.
- **Hours in use.** PNNL-22182 residential lighting study, ENERGY STAR displays duty
  (35% on / 65% sleep), Nielsen TV hours; room-type hours without a published figure are
  marked as estimates.
- **Prices.** EIA 2024 average retail price by state and sector; OpenEI tariffs when a
  location is known; a bill beats both.
- **Carbon.** EPA eGRID state output rates. Washington's mostly-hydro grid is about
  0.10 kg CO₂/kWh, roughly a quarter of the US average, and the app uses the state's
  own figure.
- **Building outlines.** OpenStreetMap, © OpenStreetMap contributors.
- **Photos.** You supply them at runtime. In On-device mode they never leave the browser;
  in Enhanced mode each one is sent to the model once and discarded.

## Responsible AI

**A human decides what to fix, not the AI.** Ghost Watt surfaces and ranks opportunities,
full stop. It never approves a purchase, sets a policy, or points a finger at anyone. A
homeowner, facilities manager or teacher reads each card and decides whether it's worth
doing. One photo is too thin a basis, and the trade-offs (budget, timetable, safety) too
local, to hand that decision to a model.

**The risk we worried about, and what we did about it.** The obvious failure is the model
misreading a device's state, say calling an off monitor "on", or inventing one that is not
there, and producing a savings number that isn't real. So perception and the energy math
are kept apart, the cloud model answers through a strict schema and is cross-checked by the
on-device detector, anything that cannot be backed is marked unverified and not counted,
every figure is a range with its assumptions shown, and the person scanning can correct any
tag on the spot. The app never states an accuracy percentage it has not earned: the only
one it shows is its own record against meter readings people entered.

**Privacy.** No accounts and no telemetry. Scans, rooms and buildings are stored in your
browser. In On-device mode no picture leaves the device; in Enhanced mode a photo goes to
the configured model once and is not kept. API keys stay on the server and are never sent
to the browser.

**A note on the numbers.** Reading wattage off a photo is an estimate, not a meter reading,
and we don't pretend otherwise. The real deliverable is the priority list, the order to
tackle things in, and that order holds up even when an individual watt figure is rough.

### Things that were tricky

- **Guessing power from one photo without overselling it.** Splitting perception from the
  accounting, showing ranges, and leaning on ranking instead of false precision is what
  made this honest.
- **A small detector that misses things.** Rather than keep tuning it, live mode became a
  candidate finder with temporal smoothing and a confirm step through the strong path. The
  alternatives were measured first (see the benchmark) and the measured winner kept.
- **Hallucinated devices.** A strict schema at temperature 0, a "visible: true/false" field,
  and a cross-check against the detector turn a silent miscount into a visible
  "unverified" tag the user resolves.
- **The 24/7 assumption.** Pricing every device as if it ran all year was wrong and would
  have been caught. Room-type usage profiles and an explicit after-hours state (observed,
  assumed standby, or set by the user) replaced it.
- **No fake fallbacks.** Removing every preset and sample path meant real empty states and
  real error states everywhere, and auto-saving each scan so the rooms, buildings and brief
  pages have real data to show.

## Accessibility

Settings → Display & accessibility, stored on the device and applied before first paint.
Seeing: theme (system, light, dark), text size, high contrast, colour-blind-safe palette,
greyscale, large pointer, always-visible focus ring, lite visuals (no 3D or decorative
motion). Reading: nine languages, plain font, bold text, wider letter spacing, taller lines,
underlined links, a reading guide that follows the pointer, and results read aloud. Motion,
sound and touch: reduce motion (also skips the launch animation and disables every other
animation), bigger touch targets, sound cues, vibration cues. Scanner: confirm only on
request, minimal camera overlay, keyboard shortcuts (Space photo, V video, F flip, C
confirm) and left-handed controls. Screen-reader labels, keyboard navigation with a skip
link and live regions for results are always on.

## Project layout

```
src/
  app/              App Router pages and API routes
    scan/           The scanner (camera, upload, type it in)
    places/ room/ buildings/ portfolio/ report/   Saved scans, rolled up, and the brief
    campus/         The 3D school
    team/ stickers/ Team scan and room QR stickers
    methodology/ about/ settings/ privacy/ terms/
    api/            analyze, bill, class, footprint, ghosty, grid, keys, locate,
                    plan-rooms, rates, rebates, school-search, solar, status, weather
  components/
    scan/           Camera with wattage tags, upload, manual entry, results, rebates
    campus/         3D scene, floor-plan editor, setup flow
    home/           The landing page
  lib/
    vision.ts       Cloud vision providers behind one strict-schema call (seeing only)
    ollama.ts       Local Ollama client and the prompt
    detector.ts     The in-browser detector
    live.ts         Tracking and auto-confirm for the live camera
    wattTags.ts     Wattage tags: easing, the meter, tapping and corrections
    parse.ts        Model output into categorized observations
    devices.ts      Wattage table (the deterministic backbone), with appliances.ts
    energy.ts       The energy, cost and carbon math plus ranking
    estimate.ts     Per-unit watts from every source of evidence, and the cost range
    tech.ts         Technology and screen-size readings: which unit it is
    thermal.ts      What a device's heat costs the building, or saves it
    climate.ts      State degree days, which size that correction
    tariff.ts       The utility's own tariff, split into open and empty hours
    reconcile.ts    Making the estimate answer to a real meter reading
    actions.ts      Fixes and swaps, ranked by payback
    rebates.ts shop.ts   Rebates and replacement links
    campus.ts       Geometry and per-room waste for the 3D school
    i18n.ts i18n-more.ts   Translations
    storage.ts      Rooms, buildings and scans in the browser
docs/               The live detector benchmark
scripts/            Detector training and build helpers
```

## Hosting and deployment

Ghost Watt is a standard Next.js (App Router) application and deploys to any platform that
runs Node, such as Vercel or Render. On Vercel, import the repository and deploy with the
default settings; add any keys under Settings → Environment Variables. The full guide,
including why GitHub Pages cannot run it (the API routes hold the keys and need a server),
is in [`DEPLOY.md`](DEPLOY.md).

A deployed server cannot reach an Ollama model on your own laptop, so on a host use one of
the cloud vision keys, or point `OLLAMA_HOST` at an Ollama instance the host can reach.

## AI assistance

The design, architecture, energy model, and the product itself were built by us. We used
Claude Code along the way mainly as a debugging aid, for tracking down bugs and tidying up
rough edges, and for the styling of the home page, rather than for designing or generating
the project. The thinking and the decisions are ours.

## License

[MIT](LICENSE). Building outlines © OpenStreetMap contributors, available under the Open
Database License.
