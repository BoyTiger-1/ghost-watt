# Ghost Watt

Walk an empty school with your phone, snap a photo of each room, and Ghost Watt tells you
what's quietly burning power and money while nobody's there. It finds the phantom loads (the
projector left on overnight, the wall of monitors stuck in standby, the humming vending
machine) and hands you back a ranked list: what's costing the most, what it costs to fix,
and how fast that fix pays for itself.

The looking is done by a vision model that runs entirely on your own machine. The math is
plain, deterministic code you can read top to bottom. No accounts, no cloud, no paid APIs,
nothing leaves your laptop.

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

The whole design rests on one idea: keep the fuzzy part and the exact part separate. The
model guesses what's in the room. The code does the money and carbon. That way the numbers
people actually act on are always something you can check by hand.

1. **Seeing.** Each photo goes to a vision model running in [Ollama](https://ollama.com) on
   `localhost`. All it reports back is what it sees: the devices in the frame and whether
   each one looks on, in standby, or off. It never touches energy.
2. **Counting.** Every device it spots gets matched against the wattage table in
   [`src/lib/devices.ts`](src/lib/devices.ts) and run through one formula to get kWh, dollars,
   and CO2 per year, plus a suggested fix and its payback. The math lives in
   [`src/lib/energy.ts`](src/lib/energy.ts).
3. **Ranking.** Offenders get sorted worst-first by yearly cost. Even when a single wattage
   guess is off, the ordering tends to hold, and the ordering is the thing that drives action.

Every card on screen is labelled `live model` if it came from your photo, or `estimated` if
it came from the room-profile fallback, so you always know which is which.

### The pipeline at a glance

| Stage | Goes in | What happens | Comes out |
| --- | --- | --- | --- |
| See | Room photo (and an optional room type) | Local vision model lists devices and their on/standby/off state | Device observations |
| Count | Device observations | Wattage table x electricity rate x empty hours x grid carbon factor | kWh, dollars, CO2 per device |
| Recommend | Per-device cost | Match each one to a concrete fix and savings rate, work out payback | Ranked offender cards |

You set the assumptions yourself (electricity rate, grid carbon intensity, how many hours a
year the building sits empty) and every figure on the page recalculates on the spot. The full
formulas and the wattage table are on the in-app Methodology page.

## Quick start

```bash
# 1. Install and run Ollama, then pull a small vision model (fine for 8GB RAM)
ollama pull moondream
#    (Ollama needs to be running: `ollama serve` or the desktop app)

# 2. Install web deps and run
npm install
cp .env.example .env.local   # optional, sane defaults are already baked in
npm run dev
```

Open http://localhost:3000 and it drops you straight into the scanner. The pill in the
top-right tells you whether the local model is live.

### No Ollama? It still runs.

If there's no model it can reach, Ghost Watt falls back to a transparent room-profile
estimate. Pick the room type per photo (or hit the "add a room-profile estimate" button) and
every card gets tagged `estimated`. Start Ollama and the exact same audit runs `live`. So the
app never goes blank on you, and it's always upfront about where a number came from.

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

- **Wattage table.** [`src/lib/devices.ts`](src/lib/devices.ts) is a hand-built lookup of
  typical power figures for common school devices (projectors, monitors, vending machines,
  and so on). These are representative published values, not nameplate maximums.
- **Defaults.** US-average commercial electricity price (around $0.15/kWh), US grid carbon
  intensity (around 0.385 kg CO2/kWh), and roughly 6,800 empty hours a year (a building used
  about 10 hours a day across 190 school days). All three are editable in the app.
- **Room profiles.** Synthetic, representative device mixes per room type (computer lab,
  classroom, hallway, break room, and others) in [`src/lib/parse.ts`](src/lib/parse.ts), used
  for the offline estimate path. Nothing here needs real or private school data to work.
- **Photos.** You supply them at runtime. They're processed locally and never uploaded.

## Responsible AI

**A human decides what to fix, not the AI.** Ghost Watt surfaces and ranks opportunities,
full stop. It never approves a purchase, sets a policy, or points a finger at anyone. A
facilities manager or teacher reads each card and decides whether it's worth doing. One photo
is too thin a basis, and the trade-offs (budget, timetable, safety) too local, to hand that
decision to a model.

**The risk we worried about, and what we did about it.** The obvious failure is the model
misreading a device's state, say calling an off monitor "on", and producing a savings number
that isn't real. So perception and the energy math are kept apart, every figure shows its
assumptions and a live/estimated tag, each offender carries a confidence level, and the
ranking is built to survive fuzzy individual readings so the order you act in stays right.
The app nudges you to spot-check before acting on any single number.

## A note on the numbers

Reading wattage off a photo is an estimate, not a meter reading, and we don't pretend
otherwise. The real deliverable is the priority list, the order facilities should tackle
things in, and that order holds up even when an individual watt figure is rough. Every figure
and formula is laid out on the Methodology page.

## Things that were tricky

- **Guessing power from one photo without overselling it.** Splitting perception from the
  accounting and leaning on ranking instead of false precision is what made this honest.
- **Vision models on ordinary hardware.** Defaulting to a small, CPU-friendly model
  (moondream) and giving inference a generous timeout keeps it usable on an 8 GB laptop.
- **Never showing an empty screen.** The room-profile fallback keeps the app (and a demo)
  working with no model at all, while being clear that those numbers are estimates.
- **Getting structured output from a chatty model.** The parser tries JSON first, then falls
  back to scanning the text clause by clause, so even rambling descriptions are usable. See
  [`src/lib/parse.ts`](src/lib/parse.ts).

## Where it goes next

- Per-school wattage overrides and a CSV/PDF export for facilities staff.
- A guided mobile capture flow (one tap per room) with saved audit history.
- Importing sub-meter readings to calibrate the estimates against reality over time.
- Region- and utility-specific grid carbon factors.

## Project layout

```
src/
  app/            App Router pages (scanner, methodology, about) and API routes
  components/     Scanner UI, offender cards, 3D hero, status pill, and so on
  lib/
    ollama.ts     Local vision client and prompt (seeing only)
    parse.ts      Model/preset output into categorized observations
    devices.ts    Wattage lookup table (the deterministic backbone)
    energy.ts     The energy, cost, and carbon math plus ranking
    types.ts      Shared types
```

## Hosting and deployment

It's a normal Next.js (App Router) app, so it'll deploy anywhere that runs Node.

- **Vercel** is the easy path: sign in with GitHub, import the repo, deploy. The UI and the
  estimate path work straight away.
- **Local or self-hosted:** `npm run build && npm start`.

One thing to know about the live vision path: it talks to an Ollama daemon over `OLLAMA_HOST`.
A cloud server can't reach the Ollama on your laptop, so a hosted copy runs in estimate mode
unless you point `OLLAMA_HOST` at an Ollama it can actually reach. To see the full live
experience, run it locally next to Ollama (see Quick start).

> Heads up: GitHub Pages only serves static files and can't run the API routes, so use
> Vercel, Render, or any Node host for the full thing.

## License

MIT.
