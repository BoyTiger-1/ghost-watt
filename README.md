# Ghost Watt

Point a phone at a room, or upload a photo, and Ghost Watt finds the powered things in it
(screens, computers, lights, appliances), prices each one at your real electricity rate,
separates what it costs in normal use from what it wastes after hours or in standby, and
ranks the fixes by dollars saved per dollar spent. Rooms roll up into a building, the
building into a one-page brief a principal or facilities manager can act on.

Two reading paths, and the pill in the header always says which one is about to run:
**On-device** (a small detector in the browser; no picture ever leaves the device) or
**Enhanced (cloud)** (a hosted vision model reads the photo and discards it). The energy
math is plain, deterministic code you can read top to bottom, every figure is a range
with a cited source, and nothing is ever filled in from a preset: a scan that could not
be read says so.

> My School's Hidden Footprint: take a building's invisible energy waste and make it
> visible, countable, and actually fixable.

## Why it matters

Schools genuinely want to cut waste and carbon. The problem is you can't fix what you can't
see, and after-hours energy waste is exactly the kind of thing nobody notices. One projector
left running overnight is about 250 W of pure loss. Add a corridor of lights, a row of idle
monitors, a vending machine, and it quietly adds up to thousands of dollars and hundreds of
kilos of CO2 a year. A proper energy audit normally means meters, spreadsheets, or paying a
consultant. This needs a phone and about ten minutes.

And the output isn't another dashboard to nod at. It's a to-do list in priority order: fix
this first, here's the price, here's the payback.

## How it works

The whole design rests on one idea: keep the fuzzy part and the exact part separate. A
model guesses what's in the room. The code does the money and carbon. That way the numbers
people actually act on are always something you can check by hand.

1. **Seeing.** A picture is read by one of two engines. In **Enhanced (cloud)** mode a
   hosted vision-language model (Anthropic, Groq, OpenAI or OpenRouter, or a local Ollama
   model during development) answers through a strict JSON schema at temperature 0: for
   each item, its type, count, state, a confidence and whether it is actually visible. In
   **On-device** mode an EfficientDet-Lite0 detector plus a lit-fixture finder read the
   picture in the browser. Both report only what is in the frame; neither touches energy.
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
  huge rectangles and overlapping labels filtered out. Candidates are dashed and unpriced.
  Hold the camera still and that frame goes through the same pipeline a photo gets (cloud in
  Enhanced mode, a tiled on-device pass otherwise); only confirmed detections are priced.
  **Photo** audits the current frame; **Video** records a walkthrough and audits its distinct
  views once.
- **Upload** takes photos or videos (drag, paste or pick). A photo's EXIF supplies where and
  when it was taken, which sets the rate and whether the room should have been empty.

The detector choice is measured, not assumed: see
[`docs/live-detector-benchmark.md`](docs/live-detector-benchmark.md) for EfficientDet-Lite0
against Lite2 and YOLOv8n (ONNX Runtime Web) on 40 Open Images photos.

### Two costs, real prices, and an efficiency verdict

- **Left on vs. typical use.** Each device shows what it costs if it is left on
  whenever the space is empty (the phantom-load figure), and what it costs at typical
  use: hours actually in use for that kind of room (classroom, office, bedroom,
  kitchen and others), standby the rest ([`src/lib/rooms.ts`](src/lib/rooms.ts),
  [`src/lib/usage.ts`](src/lib/usage.ts)). Home lamp hours come from the PNNL
  residential lighting study, monitor duty from ENERGY STAR, TV hours from Nielsen;
  the rest are marked as the app's own estimates. Pick **Home / School / Office** on
  the scanner and the room type on each capture.
- **Prices.** A home pays the residential rate and a school or office the
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
  you can assume: a school that shuts at four is closed through an evening peak (so
  its overnight waste costs about a tenth *more* than the average said) and open
  through a midday one (about a fifth less). The tariff sheet has a price per hour and
  the schedule says which hours are empty; crossing the two is the whole calculation.
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

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no keys at all the app runs in **On-device** mode: the
scanner, costs, plan, rooms, buildings and brief all work, and the pill in the header says
so. To turn on **Enhanced (cloud)** reading, add one or more vision keys to `.env.local`, or
run a local Ollama vision model (`ollama pull moondream`), and restart. Keys are tried in
this order, each a fallback for the one before it, so two is better than one:
`ANTHROPIC_API_KEY` (paid, best), `GEMINI_API_KEY` (free tier, best free),
`GROQ_API_KEY` (free, fastest), `MISTRAL_API_KEY` (free tier), `OPENAI_API_KEY` (paid),
`OPENROUTER_API_KEY` (some free models). On Vercel, add the same variables under
Settings → Environment Variables and redeploy. Defaults per provider: `claude-haiku-5-5`,
`gemini-2.5-flash`, `qwen/qwen3.6-27b`, `mistral-small-latest`, `gpt-4o-mini`,
`google/gemini-2.5-flash`; override any with `<KEY NAME>_MODEL`.

## Running a vision model locally

Enhanced reading does not have to go to anybody's cloud. [Ollama](https://ollama.com) is a
small runtime that serves open vision models on your own machine, and the app treats it as
one more provider: the server route posts the photo to `OLLAMA_HOST` (by default
`http://127.0.0.1:11434`), the model reports the devices it sees, and the energy math happens
in TypeScript exactly as it does for every other path. No keys, no usage costs, and the image
never leaves your computer.

```powershell
# 1. Install Ollama: https://ollama.com/download
# 2. Pull a vision model (moondream is small and CPU-friendly)
ollama pull moondream
# 3. Start the service (the desktop app does this, or run:)
ollama serve
# 4. In the project folder, in a separate terminal:
npm install
npm run dev
```

Open http://localhost:3000. The pill in the header confirms the model is reachable, and each
result is labelled with the engine that produced it.

**The catch is that you have to run the app on the same machine as Ollama.** A deployed copy
cannot reach it: `localhost` on a hosting provider's server is that server, not your laptop.
So a deployment either gets a hosted vision key, or an Ollama endpoint it can actually reach
over the network, or it runs in On-device mode (see
[Hosting and deployment](#hosting-and-deployment)). On-device is a real mode rather than a
degraded one, so nothing breaks without a key, but a hosted model recognises considerably
more of a room.

## Configuration

**Every variable is optional.** With none of them the app still scans, costs, plans and
reports; each key turns an assumption into a lookup. [`.env.example`](.env.example) documents
all of them and [DEPLOY.md](DEPLOY.md) explains what each one buys and where to get it.

The ones that change what the app can do:

| Variable | Buys |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enhanced reading, best recognition. **Billable.** Tried first. |
| `GEMINI_API_KEY` | Enhanced reading, best of the free tiers. Tried second. |
| `GROQ_API_KEY` | Enhanced reading, fastest to answer; 3 images per request. |
| `MISTRAL_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | Further fallbacks, in that order |
| `OLLAMA_HOST` | A vision model on your own machine instead (default `http://127.0.0.1:11434`) |
| `OPENEI_API_KEY` / `NREL_API_KEY` | The serving utility's own published tariff, split into open-hours and empty-hours prices |
| `EIA_API_KEY` | State electricity prices, and the hourly fuel mix behind live grid carbon |
| `OPENWEATHER_API_KEY` | Outdoor conditions, to sanity-check a heater running in July |
| `REWIRING_AMERICA_API_KEY` | Household rebates on the fix list |
| `ELECTRICITY_MAPS_KEY` | Live grid carbon intensity for one zone |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Team scans that last two weeks (without it they still work, end-to-end encrypted over a public relay, for about 12 hours) |
| `NEXT_PUBLIC_DETECTOR_MODEL_URL` | A fine-tuned on-device detector that can box light fixtures ([`scripts/train-detector.py`](scripts/train-detector.py)) |

Vision keys are tried in the order above, each a fallback for the one before, so two is
better than one. Override any provider's model with `<KEY NAME>_MODEL`, or pin one provider
with `VISION_PROVIDER`.

## Built with

TypeScript throughout. Next.js (App Router) and React for the app, Tailwind CSS v4 for
styling, Framer Motion for animation, React Three Fiber / three.js for the 3D school,
MediaPipe Tasks running EfficientDet-Lite0 for the in-browser detector, Vitest for the
tests, and Python for the script that fine-tunes the detector on light fixtures
([`scripts/train-detector.py`](scripts/train-detector.py)).

The seeing step is a vision model, either a hosted one (Anthropic, Google, Groq, Mistral,
OpenAI or OpenRouter) or a local [Ollama](https://ollama.com) model. **The AI only ever does
the seeing.** It is asked what is in the frame and whether each thing is on, and that is the
end of its involvement: every watt, dollar, kilogram of CO₂ and payback figure is ordinary
TypeScript you can follow line by line, which is why the Method page can publish the formulas
and you can check any number by hand.

There is no telemetry and there are no accounts. What happens to a photo depends on which
mode read it, and the pill in the header always says which is about to run:

| | Where the photo goes | Needs a key |
| --- | --- | --- |
| **On-device** | Nowhere. The detector runs in your browser. | No |
| **Enhanced (cloud)** | Sent once to the vision model, which discards it. | Yes, one vision key |
| **Local Ollama** | Nowhere off your own machine. | No, but you host the model |

With no keys configured at all, the app runs fully in On-device mode: scanner, costs, plan,
rooms, buildings and brief all work.

## Data and sources

Every figure the app multiplies by is listed, with its source, on the Method page
(`/methodology#sources`) and in [`src/lib/sources.ts`](src/lib/sources.ts):

- **Wattage table.** [`src/lib/devices.ts`](src/lib/devices.ts): a representative draw and a
  published low–high band per device class, with a source note on each row.
- **Standby draw.** LBNL's standby power summary table and the DOE microwave standby
  analysis.
- **Hours in use.** PNNL-22182 residential lighting study, ENERGY STAR displays duty
  (35% on / 65% sleep), Nielsen TV hours; room-type hours without a published figure are
  marked as estimates.
- **Prices.** EIA 2024 average retail price by state and sector; OpenEI tariffs when a
  location is known, split into the price charged while the building is open and the price
  charged while it is empty; a bill beats both.
- **Which unit it is.** Lamp and ballast ratings, ENERGY STAR specifications and
  manufacturer figures, in [`src/lib/tech.ts`](src/lib/tech.ts). A four-lamp T12 troffer and
  the LED panel that replaced it are both "overhead lighting" and about 4x apart; display
  power is fitted to panel area against the catalog's own sized rows.
- **Climate.** Annual heating and cooling degree days per state, base 65 °F, in the pattern
  of NOAA's 1991–2020 normals and EIA's State Energy Data System. A compiled table, flagged
  approximate, used only to weight a correction of order ±20%.
- **Heat as a load.** The cooling side is 1/COP at a seasonal COP of 3.2, which is 0.31,
  within rounding of the 0.33 cooling adjustment factor long used in retrofit practice. The
  heating credit is deliberately halved, and nothing is applied until the building says how
  it is heated and cooled.
- **Carbon.** EPA eGRID state output rates. Washington's mostly-hydro grid is about
  0.10 kg CO₂/kWh, roughly a quarter of the US average, and the app uses the state's
  own figure.
- **Photos.** You supply them at runtime. In On-device mode they never leave the browser;
  in Enhanced mode each one is sent to the model once and discarded.

Where a figure could not be checked against its primary document from this build
environment, the entry in [`src/lib/sources.ts`](src/lib/sources.ts) says so rather than
implying a precision it does not have. The state price, carbon and degree-day tables are all
marked that way.

## Responsible AI

**A human decides what to fix, not the AI.** Ghost Watt surfaces and ranks opportunities,
full stop. It never approves a purchase, sets a policy, or points a finger at anyone. A
facilities manager or teacher reads each card and decides whether it's worth doing. One photo
is too thin a basis, and the trade-offs (budget, timetable, safety) too local, to hand that
decision to a model.

**The risk we worried about, and what we did about it.** The obvious failure is the model
misreading a device's state, say calling an off monitor "on", or inventing one that is not
there, and producing a savings number that isn't real. So perception and the energy math
are kept apart, the cloud model answers through a strict schema and is cross-checked by the
on-device detector, anything that cannot be backed is marked unverified and not counted,
every figure is a range with its assumptions shown, and the app never states an accuracy
percentage it has not earned: the only one it shows is its own record against meter
readings people entered.

## A note on the numbers

Reading wattage off a photo is an estimate, not a meter reading, and we don't pretend
otherwise. The real deliverable is the priority list, the order facilities should tackle
things in, and that order holds up even when an individual watt figure is rough. Every figure
and formula is laid out on the Methodology page.

## Things that were tricky

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

Twenty-four settings under Settings → Display & accessibility, stored on the device and
applied before first paint. Seeing: theme (system, light, dark), text size, high contrast,
colour-blind-safe palette, greyscale, large pointer, always-visible focus ring, lite visuals
(no 3D or decorative motion). Reading: English or Spanish for the core flow, plain font,
bold text, wider letter spacing, taller lines, underlined links, a reading guide that follows
the pointer, and results read aloud. Motion, sound and touch: reduce motion (also disables
every animation), bigger touch targets, sound cues, vibration cues. Scanner: confirm only on
request, minimal camera overlay, keyboard shortcuts (Space photo, V video, F flip, C confirm)
and left-handed controls. Screen-reader labels, keyboard navigation with a skip link and live
regions for results are always on.

## Project layout

```
src/
  app/            App Router pages (scanner, methodology, about) and API routes
  components/     Scanner UI, offender cards, action plan, brief, engine indicator
  lib/
    vision.ts     Cloud vision providers behind one strict-schema call (seeing only)
    ollama.ts     Local Ollama client and the prompt
    parse.ts      Model output into categorized observations
    devices.ts    Wattage lookup table (the deterministic backbone)
    energy.ts     The energy, cost, and carbon math plus ranking
    estimate.ts   Per-unit watts from every source of evidence, and the cost range
    tech.ts       Technology and screen-size readings: which unit it is
    thermal.ts    What a device's heat costs the building, or saves it
    climate.ts    State degree days, which size that correction
    tariff.ts     The utility's own tariff, split into open and empty hours
    demand.ts     Peak-demand charges, with a coincidence factor per device class
    reconcile.ts  Making the estimate answer to a real meter reading
    types.ts      Shared types
```

## Hosting and deployment

Ghost Watt is a standard Next.js (App Router) application and deploys to any platform that
runs Node, such as Vercel, Render, or your own server. On Vercel, sign in with GitHub, import
the repository, and deploy with the default settings. Everything works immediately in
**On-device** mode, which is a real mode and not a crippled one: the scanner, the costs, the
plan, rooms, buildings and the brief all run with no keys at all.

To give a deployment **Enhanced (cloud)** reading, pick whichever of these suits you:

1. **Add a vision key (easiest, and what a shared link should do).** Put one or more of
   `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY` or `OPENROUTER_API_KEY` into Settings →
   Environment Variables and redeploy. All four have free tiers. `ANTHROPIC_API_KEY` and
   `OPENAI_API_KEY` recognise the most but are billable. Two keys is better than one, because
   each is a fallback for the one before it.
2. **Host Ollama yourself.** Run Ollama on a cloud machine, ideally with a GPU, behind a
   secured endpoint, and point `OLLAMA_HOST` at it. No per-request cost and no third party
   sees a photo, but you are now running a model server.
3. **Tunnel to a local Ollama.** Expose your own machine with something like
   `cloudflared tunnel --url http://localhost:11434` and set `OLLAMA_HOST` to the public URL.
   Your laptop has to stay awake, and serverless time limits can cut off slow inference, so
   this is for testing rather than for anything shared.
4. **Just run it locally.** Next to Ollama on one machine, as in
   [Running a vision model locally](#running-a-vision-model-locally). The most reliable way to
   demonstrate the whole pipeline on real photos.

A practical recommendation: deploy to Vercel with a free Gemini or Groq key for a shareable
link that does everything, and keep a local Ollama setup for when you want to show that the
seeing step can run with nothing leaving the machine.

> Note: GitHub Pages serves static files only and cannot run the API routes this app relies
> on, so use Vercel, Render, or another Node host for the complete application.

## AI assistance

The design, architecture, energy model, and the product itself were built by us. We used
Claude Code along the way mainly as a debugging aid, for tracking down bugs and tidying up
rough edges, rather than for designing or generating the project. The thinking and the
decisions are ours.

## License

MIT.
