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

### The pipeline at a glance

| Stage | Goes in | What happens | Comes out |
| --- | --- | --- | --- |
| See | Room photo (and an optional room type) | The in-browser detector (On-device) or a hosted vision model (Enhanced) lists devices and their on/standby/off state | Device observations |
| Count | Device observations | Wattage table x electricity rate x empty hours x grid carbon factor | kWh, dollars, CO2 per device |
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

## Running the live model

Ghost Watt is local-first by design. The vision step runs on [Ollama](https://ollama.com), a
small runtime that serves open models on your own machine. When you start an audit, the app's
server route makes a request to Ollama at `OLLAMA_HOST` (by default `http://127.0.0.1:11434`),
the model reads the photo and reports the devices it sees, and the rest of the work happens in
plain TypeScript. Your images never leave your computer, and there are no API keys or usage
costs involved.

The practical consequence is worth stating plainly: **to use the live model, you run the app
on the same machine that is running Ollama.** This is almost always your own computer.

```powershell
# 1. Install Ollama: https://ollama.com/download
# 2. Download a vision model (moondream is small and CPU-friendly)
ollama pull moondream
# 3. Start the Ollama service (the desktop app does this, or run:)
ollama serve
# 4. In the project folder, in a separate terminal:
npm install
npm run dev
```

Open http://localhost:3000. The status indicator in the top-right confirms the model is live,
and every result card it produces is tagged `live model`.

A deployed copy on a hosting provider is a different situation. The server running your site
cannot reach the Ollama instance on your laptop, because `localhost` on that server is the
server itself, not your machine. A hosted deployment therefore runs in estimate mode unless
you give it an Ollama endpoint it can actually reach (see [Hosting and deployment](#hosting-and-deployment)).
For demonstrating the model end to end, running locally is the most reliable approach.

## Configuration

See [`.env.example`](.env.example). The vars that matter:

| Variable | Default | Notes |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Local Ollama endpoint |
| `OLLAMA_VISION_MODEL` | `moondream` | `qwen2.5vl:3b` or `llama3.2-vision` if you've got the RAM |
| `OLLAMA_TIMEOUT_MS` | `120000` | CPU inference can be slow |

## Built with

Next.js (App Router), TypeScript, Tailwind CSS v4, Framer Motion, React Three Fiber / three.js
for the 3D hero, and [Ollama](https://ollama.com) for the local vision model.

There are no third-party AI APIs, no API keys, and no telemetry. The only AI in the stack is
that local vision model, and it only ever does the seeing. Every energy calculation is regular
TypeScript you can follow line by line.

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
  location is known; a bill beats both.
- **Carbon.** EPA eGRID state output rates. Washington's mostly-hydro grid is about
  0.10 kg CO₂/kWh, roughly a quarter of the US average, and the app uses the state's
  own figure.
- **Photos.** You supply them at runtime. In On-device mode they never leave the browser;
  in Enhanced mode each one is sent to the model once and discarded.

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
    types.ts      Shared types
```

## Hosting and deployment

Ghost Watt is a standard Next.js (App Router) application and deploys to any platform that
runs Node, such as Vercel, Render, or your own server. On Vercel, sign in with GitHub, import
the repository, and deploy with the default settings. The interface and the estimate path
work immediately.

The live vision path needs more thought, because it depends on Ollama. As described in
[Running the live model](#running-the-live-model), the app reaches Ollama through `OLLAMA_HOST`,
and a hosted server cannot see the Ollama process on your personal machine. You have three
realistic options:

1. **Run locally (recommended for demos).** Run the app next to Ollama on the same machine, as
   in [Quick start](#quick-start). This is the simplest way to show the model working on real
   photos.
2. **Deploy the site and tunnel to a local Ollama.** Expose your local Ollama with a tunnel
   (for example `cloudflared tunnel --url http://localhost:11434`) and set `OLLAMA_HOST` on the
   host to the resulting public URL. Your machine must stay online, and serverless function
   time limits can cut off slower inference, so this is better for testing than production.
3. **Host Ollama yourself.** Run Ollama on a cloud machine (ideally with a GPU) behind a
   secured, authenticated endpoint, and point `OLLAMA_HOST` at it. This is the only setup where
   the deployed site performs live inference without your own machine being involved.

A practical recommendation: deploy to Vercel for a shareable link that runs in the fully
functional estimate mode, and run the app locally when you want to demonstrate the live model
on real photos.

> Note: GitHub Pages serves static files only and cannot run the API routes this app relies
> on, so use Vercel, Render, or another Node host for the complete application.

## AI assistance

The design, architecture, energy model, and the product itself were built by us. We used
Claude Code along the way mainly as a debugging aid, for tracking down bugs and tidying up
rough edges, rather than for designing or generating the project. The thinking and the
decisions are ours.

## License

MIT.
