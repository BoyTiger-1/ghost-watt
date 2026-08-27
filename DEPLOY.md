# Deploying Ghost Watt

Ghost Watt is a Next.js app with nine server routes. Those routes exist to hold API
keys: the browser never sees a credential, it asks this app's own backend and the
backend calls the provider. That single design decision determines where this can be
hosted.

## Why not GitHub Pages

GitHub Pages serves static files. It has no server, so:

- The nine routes under `/api/*` do not run at all. Three of them are `POST`
  handlers, which static hosting cannot do under any configuration.
- There is nowhere to keep a key. Making these calls from a static page means
  compiling credentials into JavaScript that any visitor can read. On a public repo
  serving a public URL, a billable key published that way should be treated as
  compromised the moment it ships.

A static export would still run the calculator, room-profile estimates, the portfolio
and the methodology pages, since those are local arithmetic and `localStorage`. It
would not run class mode, live vision, grid carbon, weather or solar.

## Vercel (recommended)

Zero config — this is a stock Next.js App Router project.

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import `ghost-watt`. Vercel detects Next.js; change none of the build settings.
3. Set the branch to deploy. `WebVersion` until it is merged to `main`.
4. Add the environment variables below under **Settings → Environment Variables**,
   for the Production, Preview and Development scopes.
5. Deploy.

### Environment variables

None of these are required. The app is built to degrade honestly: every missing key
disables one feature and says so on `/settings` rather than erroring. Add them in
whatever order you find useful.

| Variable | Buys | Where |
| --- | --- | --- |
| `EIA_API_KEY` | State electricity prices, and the hourly fuel mix that live grid carbon is computed from. One key, both features. | [eia.gov/opendata/register](https://www.eia.gov/opendata/register.php) |
| `OPENWEATHER_API_KEY` | Outdoor conditions and degree days, used to weight HVAC and heater findings. | [openweathermap.org/api](https://openweathermap.org/api) |
| `GROQ_API_KEY` | Hosted vision, so a scan reads a real photo when no local Ollama is present. **Billable — see the note below.** | [console.groq.com/keys](https://console.groq.com/keys) |
| `UPSTASH_REDIS_REST_URL` | Class mode across more than one machine. Without it, sessions live in a single instance's memory and two students may land on different instances and never see each other. | [console.upstash.com](https://console.upstash.com/) |
| `UPSTASH_REDIS_REST_TOKEN` | The token half of the pair above. | same |
| `NREL_API_KEY` | The specific utility serving an address and its commercial rate. Optional — works unkeyed on a shared demo key at a much lower rate limit. | [api.data.gov/signup](https://api.data.gov/signup/) |

`ELECTRICITY_MAPS_KEY` is read but should be left blank. EIA-930 already provides
grid carbon and Electricity Maps no longer has a free tier.

The `OLLAMA_*` variables are for local development only. A serverless function cannot
reach a daemon on your laptop, so on a deployment the vision path is hosted-only.

### Upstash, specifically

Class mode is the one feature that keeps server state. Create a free Upstash Redis
database, copy the **REST** URL and token (not the `redis://` connection string), and
paste them in. If you use Vercel's own KV integration instead, it injects
`KV_REST_API_URL` and `KV_REST_API_TOKEN`; the app reads those names too, so there is
nothing to rename.

Without Redis the feature still works on one instance and `/class` says plainly that
sessions are not durable.

## Cost control on a public URL

`/api/analyze` proxies a metered vision provider. Once deployed it is reachable by
anyone who opens devtools and reads the network tab, so `src/lib/ratelimit.ts` caps it:

- **120 requests per 10 minutes per IP.** Sized for the real case rather than a
  hostile one — a class of thirty on school wifi shares a single public address, and
  a tighter limit would block the exact scenario class mode exists for.
- **1500 requests per day across the whole deployment.** This is the ceiling that
  actually protects the account, because a forwarded-for header can be spoofed but a
  global counter cannot be sidestepped.
- **2 MB request bodies.** The client downscales to 768px at q0.72, which base64s to
  roughly 100–160KB, so this refuses blob-stuffing without touching real traffic.

Tripping a limit returns a room-profile estimate and an honest notice, not an error.
Both numbers live in `RULES` in `src/lib/ratelimit.ts` and are covered by tests in
`src/lib/ratelimit.test.ts`; change them there.

The limiter shares the Upstash store when configured. Without it, counters are
per-instance and therefore advisory — a real deployment that cares about the spend
ceiling should set the Redis variables.

Set a spending cap on the Groq account as well. Rate limiting reduces exposure; a
hard cap at the provider is what bounds it.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in what you have; blanks are fine
npm run dev
```

`npm test` runs the suite. `npm run build` is what Vercel runs.

Keys belong in `.env.local`, which `.gitignore` already covers. Never put a real
value in `.env.example`.
