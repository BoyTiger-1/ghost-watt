# Ghost Watt

Point your phone at a room, or upload a photo of one, and Ghost Watt finds the things
plugged in there: screens, computers, lights, appliances. It prices each one at your actual
electricity rate, works out how much of that is normal use and how much is waste (left on
overnight, sitting in standby), and sorts the fixes by how much they save for what they
cost. Scan enough rooms and you get the whole building, as a 3D model coloured by waste and
as a one-page brief you can hand to whoever pays the bill.

There are two ways it can read a photo, and the pill in the header tells you which one is
about to run. On-device uses a small detector in the browser, so the picture never leaves
your phone. Enhanced sends the photo to a hosted vision model, which reads it and throws it
away. Either way the energy math is ordinary code you can read top to bottom. Every number
comes with a range and a source, and if a scan couldn't be read, the app tells you instead
of filling in a guess.

It works for homes, offices and schools. It's free, and it's open source under the
[MIT License](LICENSE).

## Contents

- [Why we built it](#why-we-built-it)
- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Running a vision model locally](#running-a-vision-model-locally)
- [Where a photo goes](#where-a-photo-goes)
- [Open source](#open-source)
- [Data and sources](#data-and-sources)
- [Responsible AI](#responsible-ai)
- [Accessibility](#accessibility)
- [Project layout](#project-layout)
- [Hosting and deployment](#hosting-and-deployment)
- [AI assistance](#ai-assistance)
- [License](#license)

## Why we built it

You can't fix waste you can't see, and after-hours waste is about as invisible as it gets.
A projector left on overnight burns roughly 250 W for nothing. Add a hallway of lights, a
row of idle monitors and a vending machine, and a single building can lose thousands of
dollars a year without anyone noticing. A real energy audit means meters, spreadsheets or a
consultant. We wanted something a student or a facilities manager could do with a phone in
ten minutes.

What you get at the end is a to-do list: fix this first, here's what it costs, here's when
it pays for itself.

## What it does

### Scanning

The live camera puts a tag on every powered thing it sees, with the watts in big type and
what it is and costs a year underneath. A meter in the corner adds up everything drawing
power in view. Tap a tag and you get the usual range for that kind of device, what it costs
left on versus at normal use, and buttons to fix it if the detector got it wrong: mark it
on, standby or off, or pick what it actually is from the catalog. Your fix carries through
to the totals and to the photo you save.

You can also take a photo, record a walkthrough video, or drag, paste or upload pictures
and clips. A photo's EXIF data says where and when it was taken, which sets the rate and
whether the room should have been empty at the time.

No camera, or the model missed something? Type it in. The catalog has over 1,000 device
types, and you can add your own wattage, count and hours if you know them. A photo of a
line from your electricity bill works too; once you confirm it, that rate beats any
estimate.

### Acting on it

Every device gets up to two suggestions, usually a habit fix for after hours and a more
efficient replacement, ranked by savings per dollar. Tick the ones you'd do and the bill,
payback and carbon update as you go. Replacements come with the rebates and tax credits
you qualify for where you live (through Rewiring America, when that key is set) and links
to the product at retailers you've heard of.

Ghosty Insights reads the results back to you in plain language: what stands out, what to
do first, and why. It only works from the numbers already on the page.

### Whole buildings

Each scan is saved to a room. Rooms roll up into buildings, buildings into a portfolio, and
any of those prints as a one-page brief.

The 3D school view starts with a search for your school's name. Its outline and number of
floors come from OpenStreetMap. Upload a photo of each floor plan, draw the rooms on it (or
let the AI suggest them), and every scanned room shows up as a block, blue for a little
waste and red for a lot. You can filter by lighting, screens, computers and so on, pull the
floors apart to see inside, and click any room for its breakdown.

Team scan gives a group a shared code so a whole class can scan a building together and
have it all land in one place. Room stickers are printable QR codes, so the next scan of a
room is one tap.

### Everything around it

When it knows where you are, the app pulls local electricity prices, grid carbon, weather
and solar potential from public sources, and falls back on its own figures when it can't.
It's available in nine languages (English, Spanish, Simplified Chinese, Tagalog,
Vietnamese, French, Korean, Portuguese and Hindi), and once loaded it works offline as an
installable web app, with your scans stored on the device.

## How it works

One rule shaped the whole design: the fuzzy part and the exact part never mix. A model
guesses what's in the room. Plain code does the money and the carbon. So any number you
act on can be checked by hand.

1. **Seeing.** In Enhanced mode, a hosted vision model (Anthropic, Gemini, Groq, Mistral,
   OpenAI or OpenRouter, or a local Ollama model while developing) answers through a strict
   JSON schema at temperature 0. For each item it gives a type, count, state, confidence,
   and whether it's actually visible. In On-device mode, an EfficientDet-Lite0 detector and
   a finder for lit fixtures read the picture in the browser. Neither one does any energy
   math.
2. **Cross-checking.** Cloud readings are compared against the on-device detector. Anything
   the detector can't back up, or anything low-confidence, is marked *unverified* and kept
   out of the totals until you confirm it. You can confirm, re-type, delete or adjust any
   detection, and "X of Y units located" stays on screen.
3. **Counting.** Each device is matched to the wattage table in
   [`src/lib/devices.ts`](src/lib/devices.ts), which stores a published range per class
   rather than one number. [`src/lib/energy.ts`](src/lib/energy.ts) then costs it twice:
   once at normal use for that kind of room ([`src/lib/rooms.ts`](src/lib/rooms.ts)) and
   once as waste over the hours the building sits empty. Totals are 80% ranges from a
   Monte Carlo run over wattage, hours and price.
4. **Deciding.** Each line gets an after-hours fix and an efficient swap, ranked by savings
   per dollar ([`src/lib/actions.ts`](src/lib/actions.ts)).

If the cloud model can't answer (every key out of quota, the provider down, or too slow),
the scan doesn't fail. The on-device reading of the same picture becomes the result, and
the photo says why and when to try the cloud again
([`src/lib/quota.ts`](src/lib/quota.ts)).

### The camera

The live detector is treated as a way to find candidates, not as the final answer. A box
only appears once something has shown up in three of the last five frames. It's tracked so
it doesn't flicker, it's limited to the classes the small model is good at, and bright
windows and giant rectangles are filtered out. Each tag's watts ease toward a new reading
instead of jumping ([`src/lib/wattTags.ts`](src/lib/wattTags.ts)). Hold the camera still
and that frame goes through the same full read a photo gets, and the confirmed result
replaces the candidates. Photo audits the current frame. Video records a walkthrough and
audits each distinct view once.

We didn't just pick a detector and hope. We benchmarked EfficientDet-Lite0 against Lite2
and YOLOv8n on 40 Open Images photos and kept the winner; the numbers are in
[`docs/live-detector-benchmark.md`](docs/live-detector-benchmark.md).

### Two costs, real prices, a grade

Every device shows two costs. One is what it costs if it's left on whenever the space is
empty. The other is what it costs at normal use for that kind of room, using hours from
real studies where they exist: home lamp hours from PNNL's residential lighting study,
monitor duty from ENERGY STAR, TV hours from Nielsen. Where nobody has published a figure,
the app says it's our estimate ([`src/lib/rooms.ts`](src/lib/rooms.ts),
[`src/lib/usage.ts`](src/lib/usage.ts)).

Prices depend on who's paying. Homes pay residential rates and offices and schools pay
commercial ones, which can be twice as different in the same state. With a location, the
app uses the local utility's published tariff from OpenEI, at the rate a typical month
actually reaches, weighted by hour on time-of-use plans
([`src/lib/tariff.ts`](src/lib/tariff.ts)). Without one, it uses the state's 2024 average
from the EIA. A rate from your own bill beats both, and a plug-in meter reading replaces
the catalog wattage for that device. The Method page keeps a running table of how our
estimates compared to every meter reading people entered.

Each device also gets a grade from A to F against a modern efficient version (an LED bulb,
an ENERGY STAR monitor) and a verdict: replace it, change the habit, it's in standby, or
it's fine ([`src/lib/efficiency.ts`](src/lib/efficiency.ts)). With an AI key, the model
reports the actual technology (halogen, T12, CRT), so the grade is about your unit and not
a typical one.

### Four corrections most estimates skip

Each of these does nothing until it has real input. A scan with just a photo gets plain
`watts × hours × rate` with nothing invented on top.

**Which unit it is** ([`src/lib/tech.ts`](src/lib/tech.ts)). Overhead lighting ranges from
40 W to 250 W, and that's not fuzziness. It's two different objects. An old four-lamp T12
fixture draws about 180 W, and the LED panel that replaced it draws about 40 W. Vision
models are good at telling which technology something is and bad at guessing watts, so we
weight the first much more than the second. Screen size goes through the area law that
display power actually follows. The same table grades the device and prices it, so the
verdict and the dollar figure can't disagree.

**The watt you pay for twice** ([`src/lib/thermal.ts`](src/lib/thermal.ts)). Every watt a
device uses ends up as heat. In an air-conditioned building you pay again to remove it,
roughly a third extra. In an electrically heated building, some of it comes back in
winter. The size of this comes from the state's degree days
([`src/lib/climate.ts`](src/lib/climate.ts)), and it only applies once you've said how the
building is heated and cooled. We don't apply it to the heating and cooling equipment
itself, since that energy already is the conditioning.

**What empty hours cost** ([`src/lib/tariff.ts`](src/lib/tariff.ts)). On a time-of-use
plan, the hours a building sits empty aren't billed at the yearly average, and you can't
guess which way it goes. A school that closes at four is shut through the evening peak, so
its overnight waste costs about 10% more than the average suggests, and it's open through
any midday peak, which costs about 20% less. The tariff gives a price for each hour, the
schedule says which hours are empty, and the answer comes from lining the two up.

**Checking against the meter** ([`src/lib/reconcile.ts`](src/lib/reconcile.ts)). A bill is
the only hard measurement in the whole chain. If the scanned devices add up to more energy
than the bill allows, the estimate comes down, and each line gives up ground based on its
size and how unsure we are about it. A rough catalog guess absorbs most of the cut, and a
plug-meter reading barely moves. If everything fits, nothing changes, and the app tells you
it fit.

The cost range is a Monte Carlo over all of this, with errors linked the way they really
are: one price for the building, one schedule, and one shared catalog error per device
type. If our monitor figure is 20% too high, it's 20% too high for all twenty-eight
monitors in the room. Sampling each monitor separately would give a range several times
narrower than the evidence supports ([`src/lib/estimate.ts`](src/lib/estimate.ts)).

### The 3D school

[`src/lib/campus.ts`](src/lib/campus.ts) puts three things on one grid measured in metres.
The building outline comes from OpenStreetMap, found by school name through Nominatim, with
Overpass as a backup for nearby buildings. Floor plans are photos with rooms drawn on them.
Scans are matched to plan rooms by name, so "Room 214", "rm 214" and "214" all count as the
same room. You line each floor plan up with the outline by rotating, scaling and nudging it.
If there's no outline, the floor plan's own rectangle stands in. The scene uses React Three
Fiber and only redraws when something changes.

### At a glance

| Step | Input | What happens | Output |
| --- | --- | --- | --- |
| See | A room photo, plus an optional room type | The browser detector or a hosted model lists each device, whether it's on, in standby or off, and what it looks like | Device observations |
| Weigh | Device observations | Combines the catalog range, the technology seen in the photo, screen size, the model's own guess and any meter reading | Watts per unit, with a spread |
| Count | Watts per unit | Times the empty hours, the price in those hours, what the heat does to the building, and the grid's carbon factor | kWh, dollars and CO2 per device |
| Check | Cost per device | Reconciles against a real bill and runs the correlated Monte Carlo | Corrected figures and an honest range |
| Recommend | Cost per device | Picks a concrete fix and its savings, and works out payback | Ranked cards |

You can change the assumptions (electricity rate, grid carbon, how many hours a year the
building is empty) and every number on the page recalculates. The full formulas and the
wattage table are on the Methodology page in the app.

## Quick start

You'll need Node.js 20 or newer.

```bash
git clone https://github.com/BoyTiger-1/ghost-watt.git
cd ghost-watt
npm install
npm run dev
```

Open http://localhost:3000. Without any keys the app runs on-device, and almost everything
works: the scanner, the wattage tags, costs, the plan, rooms, buildings, the 3D school and
the brief.

For the cloud reader, copy [`.env.example`](.env.example) to `.env.local`, add at least one
vision key, and restart. They're tried in this order, each one a backup for the last, so
two keys are better than one:

| Key | Notes | Default model |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Paid, most accurate | `claude-haiku-5-5` |
| `GEMINI_API_KEY` | Best of the free tiers | `gemini-3.5-flash` |
| `GROQ_API_KEY` | Free, fastest; 3 images per request | `qwen/qwen3.8-27b` |
| `MISTRAL_API_KEY` | Free tier | `mistral-small-latest` |
| `OPENAI_API_KEY` | Paid | `gpt-4o-mini` |
| `OPENROUTER_API_KEY` | Paid models, with free ones behind them | `google/gemini-2.5-flash` |

Set `<KEY NAME>_MODEL` to use a different model with any of them, or `VISION_PROVIDER` to
pin one provider. Each variable can also hold several keys, comma-separated or as
`GROQ_API_KEY_2` through `GROQ_API_KEY_9`: requests take turns, and a key that hits its rate
limit rests while the next one answers.

The data keys are optional too. Each one swaps a built-in figure for a live lookup:

| Key | What it turns on | Where to get one |
| --- | --- | --- |
| `EIA_API_KEY` | Live state electricity prices, and the hourly fuel mix behind live grid carbon | [eia.gov/opendata](https://www.eia.gov/opendata/register.php) |
| `OPENEI_API_KEY` / `NREL_API_KEY` | The local utility's own published tariff, split into open-hours and empty-hours prices; NREL also gives solar potential | [api.data.gov/signup](https://api.data.gov/signup/) (one key works for both) |
| `OPENWEATHER_API_KEY` | Outdoor conditions, to sanity-check a heater running in July | [openweathermap.org/api](https://openweathermap.org/api) |
| `REWIRING_AMERICA_API_KEY` | Rebates and tax credits for upgrades | [rewiringamerica.org/api](https://www.rewiringamerica.org/api) |
| `ELECTRICITY_MAPS_KEY` | Live grid carbon for one zone (EIA already covers the U.S., so this can stay blank) | [electricitymaps.com](https://www.electricitymaps.com/) |

These take one key each; if you put a list in one, only the first is used. Two more,
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, make team scans last two weeks
instead of about 12 hours and share rate limits across server instances. Every variable is
explained in [`.env.example`](.env.example). Put real values in `.env.local`, which git
ignores, never in `.env.example`.

`npm test` runs the tests, `npm run lint` runs ESLint, and `npm run build` makes a
production build.

## Running a vision model locally

You don't have to send photos to anyone's cloud. [Ollama](https://ollama.com) runs open
vision models on your own machine, and the app uses it like any other provider: it sends the
photo to `OLLAMA_HOST` (`http://127.0.0.1:11434` unless you change it), the model lists what
it sees, and the math runs the same way it always does. There are no keys or usage costs, and
the photo stays on your computer.

```bash
# 1. Install Ollama: https://ollama.com/download
# 2. Pull a vision model (moondream is small and runs on a CPU;
#    qwen2.5vl:3b or llama3.2-vision if you have the RAM)
ollama pull moondream
# 3. Start the service (the desktop app does this for you)
ollama serve
```

Then open http://localhost:3000. The pill in the header shows whether the app can reach the
model, and every result says which engine read it.

The catch: the app has to run on the same machine as Ollama. A deployed copy can't reach it,
because `localhost` on a hosting server means that server, not your laptop. So a deployment
needs a hosted vision key or an Ollama server it can reach over the network (see
[Hosting and deployment](#hosting-and-deployment)). Without either, it runs on-device. That
still works, nothing breaks, but a hosted model recognises a lot more of a room.

## Where a photo goes

No accounts, no tracking. What happens to a photo depends on which mode reads it, and the
pill in the header always tells you which one is about to run:

| | Where the photo goes | Needs a key |
| --- | --- | --- |
| On-device | Nowhere. The detector runs in your browser. | No |
| Enhanced (cloud) | Sent once to the vision model, which doesn't keep it. | Yes, one vision key |
| Local Ollama | Nowhere off your own machine. | No, but you run the model |

## Open source

Ghost Watt is MIT licensed. Use it for your own school, office or home, change it, or build
something on top of it. We wrote it to be read, especially the energy math, which is plain
TypeScript with a source next to every figure.

### Contributing

Issues and pull requests are welcome.

1. Fork the repo and make a branch.
2. Make your change. Please keep models and math apart: a model can say what's in a
   picture, but never what it costs.
3. Run `npm test` and `npm run lint`. Both should pass. There are over 400 tests, covering
   the energy math, parsing, the tracker, the 3D geometry and more.
4. If you change a wattage, an hours figure or a price, cite where it came from, either in
   [`src/lib/sources.ts`](src/lib/sources.ts) or on the row itself.
5. Open a pull request that says what you changed and why.

### What it's built on

It's TypeScript almost all the way down. Next.js (App Router) and React for the app,
Tailwind CSS v4 for styling, Framer Motion for animation, three.js with React Three Fiber and
drei for the 3D school, MediaPipe Tasks running EfficientDet-Lite0 for the in-browser
detector, qrcode-generator for the room stickers and Vitest for the tests. The one bit of
Python is the script that fine-tunes the detector on light fixtures
([`scripts/train-detector.py`](scripts/train-detector.py)). Each library is used under its
own license.

The seeing is done by a vision model, either a hosted one (Anthropic, Google, Groq, Mistral,
OpenAI or OpenRouter) or a local [Ollama](https://ollama.com) model, and that's all the AI
does. It's asked what's in the frame and whether each thing is on. Every watt, dollar,
kilogram of CO₂ and payback date after that is plain TypeScript you can follow line by line,
which is why the Method page can publish every formula and you can check any number by hand.

Building outlines are © OpenStreetMap contributors (ODbL), found through Nominatim and
Overpass. Tariffs come from OpenEI's Utility Rate Database, prices from the U.S. Energy
Information Administration, and grid carbon from EPA eGRID. The full list is below.

## Data and sources

The Method page (`/methodology#sources`) lists every number the app multiplies by, every
statistic quoted on the site, and every outside service and model it uses, grouped the same
way as below, with what we took from each and any caveat. The list itself lives in
[`src/lib/sources.ts`](src/lib/sources.ts). Claims on the home page and under each result
have a "Sources:" line linking straight to their entry, and a test fails the build if any of
those links points nowhere.

### Figures the math uses

- Wattages: [`src/lib/devices.ts`](src/lib/devices.ts) and
  [`src/lib/appliances.ts`](src/lib/appliances.ts), a typical draw and a published
  low-to-high range for each kind of device, with a source note on every row. Which unit it
  is ([`src/lib/tech.ts`](src/lib/tech.ts)) comes from lamp and ballast ratings, ENERGY STAR
  specifications and manufacturer figures.
- Standby power: [LBNL standby power summary table](https://standby.lbl.gov/data/summary-table/)
  and the [DOE microwave standby analysis](https://www.federalregister.gov/documents/2013/06/17/2013-13535/energy-conservation-program-energy-conservation-standards-for-standby-mode-and-off-mode-for).
- Hours in use: the [PNNL residential lighting study](https://www.energy.gov/eere/ssl/residential-lighting-end-use-consumption)
  (PNNL-22182), [ENERGY STAR display duty](https://www.energystar.gov/products/displays)
  (35% on, 65% asleep) and Nielsen TV hours. Room types with no published figure are marked
  as estimates.
- Prices: the [EIA's 2024 average retail price by state and sector](https://www.eia.gov/electricity/sales_revenue_price/),
  [OpenEI tariffs](https://openei.org/wiki/Utility_Rate_Database) when we know the location,
  and your bill over both.
- Carbon: [EPA eGRID](https://www.epa.gov/egrid/summary-data) rates by state. Washington's
  grid is mostly hydro and runs about 0.10 kg CO₂/kWh, around a quarter of the US average,
  and the app uses each state's own number.
- Heating and cooling: [NOAA 1991–2020 climate normals](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals)
  for degree days, and the retrofit-practice
  [cooling adjustment for internal loads](https://www.csemag.com/articles/factoring-lighting-into-cooling-loads/).

### Statements on the site

- "Commercial buildings spend $119 billion a year on electricity" and "5.9 million
  commercial buildings": [EIA CBECS 2018](https://www.eia.gov/consumption/commercial/data/2018/).
- "About 30% of their energy is wasted": a long-standing
  [EPA ENERGY STAR estimate](https://www.epa.gov/archive/epapages/newsroom_archive/newsreleases/6723b7f2facee90c85257712005a3969.html).
  The home page's live counter is $119 billion × 30%, about $35.7 billion a year; at $0.13/kWh
  that's a steady 31 GW, about thirty large reactors at roughly a gigawatt each. Treat it as a
  ballpark, not an audit.
- "Up to $2.4 billion a year wasted by K-12 schools": [ENERGY STAR for K-12](https://www.energystar.gov/buildings/resources-audience/k-12-schools)
  says districts spend over $8 billion a year on energy and more than 30% of it is wasted.
- The CO₂ comparisons under each result (cars, homes, miles, gallons, tree seedlings):
  EPA's current [Greenhouse Gas Equivalencies Calculator figures](https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references).
- "6,800 empty hours a year": the app's default. 8,760 hours in a year, minus about 1,960
  for a building open 9 hours a day, 5 days a week, 43–44 weeks. You can set your own.
- The "what the money would buy" comparisons (school lunches, Chromebooks and so on) use
  round illustrative prices, and say so.

### Live data services

[OpenStreetMap](https://www.openstreetmap.org/copyright) through Nominatim and Overpass
(school search, building outlines, place names; © OpenStreetMap contributors, ODbL),
[OpenEI Utility Rate Database](https://openei.org/wiki/Utility_Rate_Database) (tariffs),
[EIA Open Data](https://www.eia.gov/opendata/) (live prices and fuel mix),
[Electricity Maps](https://www.electricitymaps.com/) (live grid carbon),
[NREL PVWatts](https://developer.nrel.gov/docs/solar/pvwatts/v8/) and
[Open-Meteo](https://open-meteo.com/) (solar estimates),
[OpenWeather](https://openweathermap.org/api) (local weather), and
[Rewiring America](https://www.rewiringamerica.org/api) (rebates and tax credits).

### Models and datasets

The on-device reader is Google's [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector)
EfficientDet-Lite detector, trained on [COCO](https://cocodataset.org/), with an
EfficientNet-Lite0 classifier trained on [ImageNet](https://www.image-net.org/) for a
second look. The detectors were benchmarked on photos from
[Open Images](https://storage.googleapis.com/openimages/web/index.html). In Enhanced mode a
hosted vision-language model reads the photo (Anthropic, Gemini, Groq, Mistral, OpenAI or
OpenRouter).

A few figures we couldn't check against the original document, and their entries in
[`src/lib/sources.ts`](src/lib/sources.ts) say so instead of pretending to be exact. The
state price, carbon and degree-day tables are all marked that way.

## Responsible AI

People decide what gets fixed, not the AI. Ghost Watt finds and ranks opportunities. It
never approves a purchase, sets a policy or blames anyone. A homeowner, a facilities
manager or a teacher reads each card and decides if it's worth doing, because one photo
isn't enough to go on, and things like budget, timing and safety depend on the place.

The failure we worried about most was the model getting a device wrong, like calling a
switched-off monitor "on" or inventing one that isn't there, and producing savings that
don't exist. That's why seeing and math are kept apart. The cloud model has to answer in a
strict format and gets checked against the on-device detector. Anything it can't back up is
marked unverified and left out. Every figure is a range with its assumptions shown, and you
can correct any tag on the spot. The app never claims an accuracy number it hasn't earned;
the only one it shows is how its estimates compared to meter readings people actually
entered.

There are no accounts and no tracking. Scans, rooms and buildings live in your browser.
API keys stay on the server and are never sent to the browser.

Reading wattage off a photo is an estimate, not a meter reading, and we don't pretend
otherwise. What matters most is the order of the list: what to tackle first. That order
holds up even when a single watt figure is a bit off.

### What was hard

Guessing power from one photo without overselling it. Keeping the seeing apart from the
accounting, showing ranges, and leaning on the ranking instead of fake precision is what
made it honest.

The small detector misses things. Instead of tuning it forever, we made live mode a
candidate finder with smoothing over time, plus a step where a steady frame gets the full
read. We measured the alternatives first (that's the benchmark) and kept the one that won.

Models invent devices. A strict schema at temperature 0, a field asking whether the item is
actually visible, and the detector cross-check turn a silent miscount into an "unverified"
tag you can see and fix.

We started out pricing every device as if it ran all year, which was wrong. Usage profiles
per room type and an explicit after-hours state (seen, assumed standby, or set by you)
replaced it.

We also took out every preset and sample result. That meant building real empty states and
real error states everywhere, and saving each scan automatically so the rooms, buildings
and brief pages always show real data.

## Accessibility

Settings → Display & accessibility has the options, saved on your device and applied before
the page first draws.

For seeing: light, dark or system theme, text size, high contrast, a colour-blind-safe
palette, greyscale, a large pointer, an always-visible focus ring, and a lite mode with no
3D or decorative motion. For reading: nine languages, a plain font, bold text, wider letter
spacing, taller lines, underlined links, a reading guide that follows your pointer, and
results read aloud. For motion, sound and touch: reduce motion (which also skips the launch
animation), bigger touch targets, and sound and vibration cues. In the scanner: confirm
only when you ask, a minimal camera overlay, keyboard shortcuts (Space for photo, V for
video, F to flip, C to confirm) and left-handed controls.

Screen-reader labels, keyboard navigation, a skip link and live announcements for results
are always on.

## Project layout

```
src/
  app/              Pages and API routes
    scan/           The scanner (camera, upload, type it in)
    places/ room/ buildings/ portfolio/ report/   Saved scans, rolled up, and the brief
    campus/         The 3D school
    team/ stickers/ Team scan and room QR stickers
    methodology/ about/ settings/ privacy/ terms/
    api/            analyze, bill, class, footprint, ghosty, grid, keys, locate,
                    plan-rooms, rates, rebates, school-search, solar, status, weather
  components/
    scan/           Camera and wattage tags, upload, manual entry, results, rebates
    campus/         3D scene, floor plan editor, setup steps
    home/           The landing page
  lib/
    vision.ts       Cloud vision providers behind one strict-schema call (seeing only)
    ollama.ts       Local Ollama client and prompt
    detector.ts     The in-browser detector
    live.ts         Tracking and auto-confirm for the live camera
    wattTags.ts     Wattage tags: easing, the meter, tapping, corrections
    parse.ts        Turns model output into device observations
    devices.ts      The wattage table, with appliances.ts
    energy.ts       Energy, cost and carbon math, and ranking
    estimate.ts     Watts per unit from all the evidence, and the cost range
    tech.ts         Which unit it is: technology and screen size
    thermal.ts      What a device's heat costs or saves the building
    climate.ts      State degree days for that correction
    tariff.ts       The utility's tariff, split into open and empty hours
    reconcile.ts    Checking the estimate against a real meter reading
    actions.ts      Fixes and swaps, ranked by payback
    rebates.ts shop.ts   Rebates and replacement links
    campus.ts       Geometry and per-room waste for the 3D school
    i18n.ts i18n-more.ts   Translations
    storage.ts      Rooms, buildings and scans, stored in the browser
docs/               The detector benchmark
scripts/            Detector training and build helpers
```

## Hosting and deployment

It's a standard Next.js app, so it runs anywhere that runs Node: Vercel, Render, or your own
server. On Vercel, sign in with GitHub, import the repo and deploy with the default settings.
It works straight away in on-device mode, which handles the scanner, costs, plan, rooms,
buildings and the brief with no keys at all.

For cloud reading on a deployment, you have a few options:

1. Add a vision key. This is the easy one, and what a shared link should use. Put one or more
   of `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY` or `OPENROUTER_API_KEY` under
   Settings → Environment Variables and redeploy. All four have free tiers. `ANTHROPIC_API_KEY`
   and `OPENAI_API_KEY` recognise the most but cost money. Two providers beat one, since each
   backs up the one before it, and any variable can hold several comma-separated keys that
   take turns.
2. Host Ollama yourself on a cloud machine, ideally with a GPU, behind a secured endpoint, and
   point `OLLAMA_HOST` at it. No per-request cost and no third party sees a photo, but now
   you're running a model server.
3. Tunnel to Ollama on your own machine with something like
   `cloudflared tunnel --url http://localhost:11434`, and set `OLLAMA_HOST` to the public URL.
   Your laptop has to stay awake, and serverless time limits can cut off a slow answer, so
   it's for testing, not for a link you share.
4. Skip hosting and run everything on one machine next to Ollama, as in
   [Running a vision model locally](#running-a-vision-model-locally). For showing the whole
   pipeline on real photos, it's the most reliable.

What we'd do: deploy to Vercel with a free Gemini or Groq key for a link that does
everything, and keep a local Ollama setup for when you want to show the seeing step running
with nothing leaving the machine.

GitHub Pages won't work: it only serves static files, and the API routes that hold the keys
need a server. After adding or changing a variable on Vercel, redeploy so it takes effect.

Once it's public, anyone can find the photo route in their browser's network tab, so
[`src/lib/ratelimit.ts`](src/lib/ratelimit.ts) caps it: 120 requests per 10 minutes per
network (sized so a class of thirty on one school connection isn't blocked), 1,500 a day
across the whole site, and 2 MB per request. Hitting a limit never shows an error; the photo
is read on the device instead, with a note saying when to try the cloud again. Without
Upstash the counters are per server instance, so they're a soft limit. Set a spending cap
with any paid provider as well: rate limits reduce the exposure, but a cap at the provider is
what actually bounds it.

## AI assistance

The design, architecture, energy model, and the product itself were built by us. We used
Claude Code along the way mainly as a debugging aid, for tracking down bugs and tidying up
rough edges, and for the styling of the home page, rather than for designing or generating
the project. The thinking and the decisions are ours.

## License

[MIT](LICENSE). Building outlines © OpenStreetMap contributors, under the Open Database
License.
