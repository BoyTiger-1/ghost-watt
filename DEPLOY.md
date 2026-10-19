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

A static export would still run the on-device scanner, the rooms, buildings, brief
and methodology pages, since those are local arithmetic, an in-browser detector and
`localStorage`. It would not run Enhanced (cloud) reading, bill reading, shared class
sessions, grid carbon, weather or solar.

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
disables one feature and says so on `/settings` rather than erroring. Vision keys are
tried in the order Anthropic, Gemini, Groq, Mistral, OpenAI, OpenRouter, each a
fallback for the one before it, so two free ones (Gemini and Groq) cover a demo well.
After adding or changing a variable in Vercel, redeploy: functions read the
environment at build time.

| Variable | Buys | Where |
| --- | --- | --- |
| `EIA_API_KEY` | State electricity prices, and the hourly fuel mix that live grid carbon is computed from. One key, both features. | [eia.gov/opendata/register](https://www.eia.gov/opendata/register.php) |
| `OPENWEATHER_API_KEY` | Outdoor conditions and degree days, used to weight HVAC and heater findings. | [openweathermap.org/api](https://openweathermap.org/api) |
| `GEMINI_API_KEY` | Enhanced (cloud) reading on Google's free tier: the best free vision model for rooms. Tried after Anthropic, before Groq. | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GROQ_API_KEY` | Enhanced reading, free tier, fastest to answer; at most 3 images per request. | [console.groq.com/keys](https://console.groq.com/keys) |
| `MISTRAL_API_KEY` | Enhanced reading on Mistral's free experiment tier; a further fallback. | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| `OPENROUTER_API_KEY` | One key, many models, some free (`:free` ids); the last fallback. | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Paid providers with the best recognition; tried first / fifth. **Billable.** | [console.anthropic.com](https://console.anthropic.com/settings/keys) · [platform.openai.com](https://platform.openai.com/api-keys) |
| `OPENEI_API_KEY` | The serving utility's published tariff from a photo's location (same api.data.gov key as NREL works). | [openei.org/services/api/signup](https://openei.org/services/api/signup) |
| `UPSTASH_REDIS_REST_URL` | Team scans that last two weeks. Without it, team codes still work: they run end-to-end encrypted over the public ntfy.sh relay straight from each browser, and last about 12 hours there (the board keeps its own copy). | [console.upstash.com](https://console.upstash.com/) |
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

Without Redis, team codes run over an encrypted public relay instead (`src/lib/teamRelay.ts`):
the topic is a hash of the code, every message is AES-GCM encrypted with a key derived from
it, and only device rows travel. It covers a class period comfortably; Redis is still the
better home for a real deployment. A school network that blocks ntfy.sh will block relay
teams too, and the error says so.

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

Tripping a limit returns a clear error on the capture, with a "use the on-device
reading instead" option; nothing is invented.
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
