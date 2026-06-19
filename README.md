# Ghost Watt

**The after-hours energy map nobody has.** Walk an empty school with your phone, photograph
each room, and Ghost Watt turns those photos into a ranked, costed list of the biggest
*phantom-load* offenders — the monitors, projectors, vending machines and lights quietly
burning power and money when nobody's there. Every offender comes with a one-line fix and a
payback estimate.

A **local** vision model does the looking. Transparent, deterministic math does the
accounting. No accounts, no cloud, no external or paid APIs — every inference runs on your
own machine.

> **My School's Hidden Footprint** — make a building's invisible energy waste visible,
> measurable, and actually fixable.

---

## Why it matters

Schools want to cut waste and carbon, but the waste they can't *see* is the waste that never
gets fixed. A single projector left on overnight is ~250 W of pure loss; a hallway of lights,
a row of monitors in standby, a humming vending machine — individually small, collectively
thousands of dollars and hundreds of kilograms of CO₂ a year. Existing energy audits need
meters, spreadsheets, or a consultant. Ghost Watt needs a phone and ten minutes.

The output isn't a chart to admire — it's a **prioritized action list**: fix *this* first,
here's what it costs, here's when it pays for itself.

## How it works

Ghost Watt deliberately splits *perception* (fuzzy, model-driven) from *accounting*
(exact, rule-driven), so the part that decides money and carbon is fully auditable.

1. **Perception — local model.** Each photo is sent to a vision model running in
   [Ollama](https://ollama.com) on `localhost`. It returns only what it sees: the devices in
   the frame and whether each is *on / standby / off*. It says nothing about energy.
2. **Accounting — deterministic.** Each detected device is matched to the wattage lookup
   table in [`src/lib/devices.ts`](src/lib/devices.ts) and run through one transparent formula
   → kWh/yr, $/yr, kg CO₂/yr, plus a recommended fix and its payback. See
   [`src/lib/energy.ts`](src/lib/energy.ts).
3. **Ranking.** Offenders are sorted worst-first by annual cost. This ranking is robust even
   when the absolute watts are approximate — and the ranking is what drives the fix.

Every result card is badged **`live model`** (read from your photo) or **`estimated`**
(room-profile fallback) so the two are never confused.

### Architecture at a glance

| Stage | Input | What happens | Output |
| --- | --- | --- | --- |
| Perceive | Room photo (+ optional room type) | Local vision model lists devices and their on/standby/off state | Device observations |
| Account | Device observations | Wattage table × electricity rate × empty-hours × grid carbon factor | kWh, $, CO₂ per device |
| Recommend | Per-device cost | Match each offender to a concrete fix + savings fraction → payback | Ranked offender cards |

The user sets the assumptions — electricity rate, grid carbon intensity, and how many hours
a year the building is empty — and every number on the page recomputes live. Full formulas
and the wattage table are on the in-app **Methodology** page.

## Quick start

```bash
# 1. Install + run Ollama, then pull a small vision model (good for 8GB RAM)
ollama pull moondream
#    (Ollama must be running — `ollama serve` or the desktop app)

# 2. Install web deps and run
npm install
cp .env.example .env.local   # optional; sane defaults are built in
npm run dev
```

Open http://localhost:3000 — it drops straight into the scanner. The status pill in the
top-right shows whether the local model is live.

### No Ollama running? It still works.

With no reachable model, Ghost Watt falls back to a transparent room-profile estimate (pick
the room type per photo, or use the **"add a room-profile estimate"** button) and labels
every card **`estimated`**. Start Ollama and the same audit runs **`live`**. This means the
app — and a demo — never blanks out, and it's always honest about which path produced a
number.

## Configuration

See [`.env.example`](.env.example). Key vars:

| Variable | Default | Notes |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Local Ollama endpoint |
| `OLLAMA_VISION_MODEL` | `moondream` | `qwen2.5vl:3b` / `llama3.2-vision` if you have the RAM |
| `OLLAMA_TIMEOUT_MS` | `120000` | CPU inference can be slow |

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Framer Motion · React Three Fiber /
three.js (the 3D hero) · [Ollama](https://ollama.com) for local vision inference.

No third-party AI APIs, no API keys, no telemetry. The only "AI" in the system is the local
vision model, used purely for perception; all energy reasoning is plain TypeScript you can
read end-to-end.

## Data & sources

- **Device wattage table** — [`src/lib/devices.ts`](src/lib/devices.ts), a hand-built lookup
  of representative power figures for common school devices (projectors, monitors, vending
  machines, etc.). Figures are typical-published values, not nameplate maxima.
- **Defaults** — US-average commercial electricity price (~$0.15/kWh), US grid carbon
  intensity (~0.385 kg CO₂/kWh), and ~6,800 empty hours/year (a building occupied ≈10 h ×
  190 school days). All three are user-editable in the app.
- **Room profiles** — synthetic, representative device mixes per room type (computer lab,
  classroom, hallway, break room, …) in [`src/lib/parse.ts`](src/lib/parse.ts), used for the
  offline estimate path. No real or private school data is required to run anything.
- **Photos** — supplied by the user at runtime; processed locally and never uploaded
  anywhere.

## Responsible AI

**Human in the loop — the AI does not decide what to fix.** Ghost Watt only *surfaces and
ranks* opportunities; it never authorizes a purchase, a policy change, or any disciplinary
action. A facilities manager or teacher reviews each recommendation and decides what's
actually worth doing. The model's view of a single photo is too coarse, and the cost
trade-offs too context-specific, for that call to be automated.

**A real risk, and the guardrail.** *Risk:* the vision model misreads a device's state
(e.g. a monitor that's actually off looks "on"), producing a misleading savings claim.
*Mitigation:* perception and accounting are kept separate, every figure is shown with its
assumptions and a `live` / `estimated` badge, results carry per-device confidence, and the
ranking is designed to stay correct even when individual watt figures are fuzzy — so the
worst-first action order survives noisy detections. Users are pointed to spot-check before
acting on a number.

## Honesty on the numbers

Wattage-from-a-photo is an estimate, not a meter reading. The deliverable is the
**prioritized list** — the order facilities should fix things in — and that order holds even
when individual watt figures are approximate. Full transparency on every figure and formula
lives on the **Methodology** page.

## Challenges

- **Estimating power from a single photo without overclaiming.** Solved by separating
  perception from accounting and leaning on *ranking* rather than absolute precision.
- **Running vision models on modest hardware.** Defaulting to a small CPU-friendly model
  (moondream) and tuning timeouts keeps it usable on an 8 GB laptop.
- **Never showing a blank screen.** A transparent room-profile fallback keeps the experience
  (and demos) working even with no model available — while clearly labeling estimates.
- **Coaxing structured output from a chatty model.** The parser prefers JSON but falls back
  to a clause-by-clause keyword scan, so even free-form descriptions are usable
  ([`src/lib/parse.ts`](src/lib/parse.ts)).

## What's next

- Tunable per-school wattage overrides and a CSV/PDF export for facilities staff.
- A guided mobile capture flow (one tap per room) and saved audit history.
- Optional sub-metering import to calibrate estimates against real readings over time.
- Pluggable grid carbon factors by region/utility.

## Project layout

```
src/
  app/            App Router pages (scanner, methodology, about) + API routes
  components/     Scanner UI, offender cards, 3D hero, status pill, …
  lib/
    ollama.ts     Local vision client + prompt (perception only)
    parse.ts      Model/preset output → categorized observations
    devices.ts    Wattage lookup table (the deterministic backbone)
    energy.ts     The energy + cost + carbon math and ranking
    types.ts      Shared types
```

## Hosting & deployment

Ghost Watt is a standard Next.js (App Router) app, so it deploys anywhere that runs Node.

- **Vercel (recommended)** — sign in with GitHub, import this repo, deploy. The UI and the
  estimate path work out of the box.
- **Local / self-host** — `npm run build && npm start`.

One caveat about the **live vision path**: it talks to an Ollama daemon over `OLLAMA_HOST`.
A cloud deployment can't reach the Ollama running on your laptop, so a hosted instance runs
in the transparent **estimate** mode unless you point `OLLAMA_HOST` at an Ollama endpoint it
can actually reach. The intended way to see the full live experience is to run it locally
alongside Ollama (see **Quick start**).

> Note: GitHub Pages serves static files only and can't run the API routes, so use Vercel,
> Render, or a Node host for the full app.

## License

MIT.
