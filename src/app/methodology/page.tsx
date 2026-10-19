import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { CatalogTable } from "@/components/CatalogTable";
import { CalibrationTable } from "@/components/CalibrationTable";
import { ROOM_TYPES } from "@/lib/rooms";
import { SOURCES } from "@/lib/sources";
import { GROUP_LABELS, type DeviceGroup } from "@/lib/types";
import { CATALOG_BY_ID } from "@/lib/devices";
import { CodeWindow, DEVICES_TS, ENERGY_TS, ENERGY_TS_SHORT } from "@/components/CodeWindow";
import { PageHeader } from "@/components/PageHeader";
import { DEFAULT_SETTINGS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Methodology - Ghost Watt",
  description:
    "Exactly how Ghost Watt turns a photo into a dollar and CO₂ figure: a vision model for perception, a deterministic wattage table for the energy math.",
};

const TOC = [
  { id: "split", label: "Two jobs, kept apart" },
  { id: "formula", label: "The formula" },
  { id: "defaults", label: "The defaults" },
  { id: "table", label: "The wattage table" },
  { id: "rooms", label: "Hours by room type" },
  { id: "measured", label: "Estimated vs measured" },
  { id: "engines", label: "Which engine read the photo" },
  { id: "carbon", label: "Where the carbon comes from" },
  { id: "totals", label: "What the totals count" },
  { id: "sources", label: "Sources" },
];

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-24 sm:px-6 sm:pt-32">
      <Reveal>
        <PageHeader eyebrow="Methodology" title="How a photo becomes" accent="a number you can defend.">
          The model only does <span className="text-fog">perception</span>; plain, deterministic code
          does all of the <span className="text-fog">energy reasoning</span>. The ranking never
          depends on the model being right about watts, only about what is in the room.
        </PageHeader>
      </Reveal>

      <div className="mt-16 grid gap-12 lg:grid-cols-[13rem_1fr] lg:gap-16">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-28">
            <p className="text-[0.8rem] font-medium text-dim">On this page</p>
            <ul className="mt-3 space-y-1 border-l border-line">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-[0.88rem] text-mist transition-colors hover:border-fog hover:text-fog">
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 max-w-3xl space-y-20">
          {/* the split */}
          <Section id="split" title="Two jobs, kept apart">
            <div className="mt-8 grid gap-10 sm:grid-cols-2">
              <Step n="1" title="Seeing" tag="the model">
                A vision model looks at each photo and returns a list of devices, each with a count
                and a state: on, standby or off. It is asked for nothing about energy. If it
                answers in prose instead of JSON, the parser still reads it clause by clause.
              </Step>
              <Step n="2" title="Counting" tag="plain code">
                Each device is matched to one entry in the wattage table, then run through the same
                formula every time. No model judgement enters the arithmetic, so two identical photos
                always produce identical numbers.
              </Step>
            </div>
          </Section>

          {/* the formula */}
          <Section id="formula" title="The formula">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              This is the code that runs, quoted from the source with its real line numbers. A test
              fails if it ever drifts from what is shown here.
            </p>
            <div className="mt-6 hidden sm:block">
              <CodeWindow files={[ENERGY_TS, DEVICES_TS]} />
            </div>
            <div className="mt-6 sm:hidden">
              <CodeWindow files={[ENERGY_TS_SHORT]} compact />
            </div>
            <ul className="mt-6 space-y-2 text-[0.95rem] leading-relaxed text-mist">
              <li>
                <span className="text-fog">Effective watts</span> are the draw in the observed state
                times the count. Thermostatic gear (fridges, AC, vending) uses a duty-cycle average.
              </li>
              <li>
                <span className="text-fog">Savings</span>{" "}are the waste times the fix&apos;s
                effectiveness; <span className="text-fog">payback</span>{" "}is the fix&apos;s cost over
                the savings.
              </li>
              <li>
                Waste only counts during the hours the building is empty, so every figure scales with
                one assumption you can see and change: <span className="text-fog">empty hours per year</span>.
              </li>
            </ul>
          </Section>

          {/* defaults */}
          <Section id="defaults" title="The defaults">
            <dl className="mt-6 grid grid-cols-3 divide-x divide-line border-y border-line">
              <Default label="Electricity" value={`$${DEFAULT_SETTINGS.ratePerKwh.toFixed(2)}`} unit="per kWh" />
              <Default label="Grid carbon" value={DEFAULT_SETTINGS.co2PerKwh.toFixed(3)} unit="kg CO₂ per kWh" />
              <Default label="Empty hours" value={DEFAULT_SETTINGS.unoccupiedHoursPerYear.toLocaleString()} unit="per year" />
            </dl>
            <p className="mt-4 text-[0.9rem] leading-relaxed text-dim">
              These are the last-resort figures, used only when nothing better is known: a US-average
              electricity price and grid factor, and a building used about 1,900 hours a year
              (≈ 10 hours × 190 school days), which leaves about 6,800 dark. In practice a scan
              starts from the building&apos;s state (Washington: $0.119 residential, $0.100 commercial per
              kWh and about 0.10 kg CO₂/kWh from its mostly-hydro grid), then its utility&apos;s published
              tariff if located, then a line off its own bill, which beats everything. The schedule drawn in{" "}
              <Link href="/settings" className="text-cyan underline-offset-4 hover:underline">settings</Link> sets the empty hours.
            </p>
          </Section>

          {/* table */}
          <Section id="table" title="The wattage table">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              Representative figures, not nameplate maxima. Fuzzy on any single device, but stable
              enough that the <span className="text-fog">ranking</span> holds.
            </p>
            <CatalogTable />
          </Section>

          {/* rooms */}
          <Section id="rooms" title="Hours by room type">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              The same monitor costs a different amount in a classroom, an office and a bedroom,
              because it is used for a different number of hours. Each room type carries the hours a
              day its devices are typically in use; the rest of the lit or standby time is what the
              app calls after-hours waste. Published figures are tagged with their source; the rest
              are this app&apos;s own estimates and are marked as such.
            </p>
            <RoomHoursTable />
            <p className="mt-3 text-[0.8rem] leading-relaxed text-dim">
              A device not listed for a room falls back to the home / school / office profile. The
              hours you type for a device override all of this.
            </p>
          </Section>

          {/* measured */}
          <Section id="measured" title="Estimated vs measured">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              The app never states an accuracy percentage it has not earned. The only one it will show
              is this: on devices where somebody entered a plug-in meter reading, how far off was the
              estimate it replaced?
            </p>
            <CalibrationTable />
          </Section>

          {/* engines */}
          <Section id="engines" title="Which engine read the photo">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              Two paths can read a picture, and the pill in the header always says which one is
              about to run. Whichever one ran, it contributes the same single thing: a list of
              devices and their states. Nothing is ever filled in from a typical room.
            </p>
            <ol className="mt-8 space-y-7">
              <Engine tone="bg-lime" title="A model on your own machine" badge="live model">
                Ollama, running locally. The photo never leaves the device.
              </Engine>
              <Engine tone="bg-cyan" title="A hosted model" badge="live model">
                If nothing local is running and the deployment holds a vision key, that provider
                reads the photo instead, so a visitor with nothing installed still gets a real
                reading. The photo is sent for the scan and is not stored.
              </Engine>
              <Engine tone="bg-lime" title="The detector in your browser" badge="on-device">
                With no cloud model, or when you choose to keep pictures on the device, a small
                object detector reads the picture in the browser. It recognises screens, laptops,
                common appliances and lit fixtures and nothing else, so it undercounts. There is no
                third path: a scan that could not be read says so instead of guessing.
              </Engine>
            </ol>
          </Section>

          {/* carbon */}
          <Section id="carbon" title="Where the carbon comes from">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              A kilowatt-hour does not have a fixed carbon cost; it depends on what was burning to
              make it, which changes hour by hour. Ghost Watt has two answers and says which it used.
            </p>
            <div className="mt-8 grid gap-10 sm:grid-cols-2">
              <Step n="A" title="Without a key" tag="eGRID annual average">
                A stored per-state figure from EPA eGRID subregion generation intensity. Right for a
                yearly report, blunt for a decision made on a Tuesday afternoon.
              </Step>
              <Step n="B" title="With an EIA key" tag="computed hourly">
                EIA-930 publishes generation by fuel for each grid operator. Ghost Watt fetches the
                last 72 hours for the operator serving your state and computes the intensity itself.
              </Step>
            </div>
            <div className="mt-8 rounded-2xl bg-surface2 px-5 py-4 font-mono text-[0.85rem] leading-relaxed text-mist">
              <p className="text-fog">
                gCO₂e/kWh = Σ(MWh<sub>fuel</sub> × kg/MWh<sub>fuel</sub>) ÷ Σ MWh<sub>fuel</sub>
              </p>
              <p className="mt-2 text-dim">coal 1000 · oil 970 · gas 430 · other 550 · geothermal 40</p>
              <p className="text-dim">nuclear, hydro, wind, solar, storage = 0</p>
            </div>
            <p className="mt-5 text-[0.95rem] leading-relaxed text-mist">
              Factors are EPA generation-side values, the same convention eGRID uses, so the live
              figure stays comparable with the stored one. Storage is zero because charging a battery
              from a coal plant already shows up as coal; counting the discharge would count it twice.
            </p>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-dim">
              Two caveats. The feed lags by several hours, so the app stamps the latest published hour
              instead of calling it &ldquo;now&rdquo;. And where a state is split across operators,
              Ghost Watt uses the one carrying most of its load: right for a school-scale estimate,
              not a substitute for a meter.
            </p>
          </Section>

          {/* totals */}
          <Section id="totals" title="What the totals count">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              Adding up rows sounds assumption-free. It is not, and these are the two places the
              arithmetic makes a choice on your behalf.
            </p>
            <div className="mt-8 grid gap-10 sm:grid-cols-2">
              <Step n="1" title="Fix cost is a ceiling" tag="capital">
                Each row carries the cost of its own fix, and the total sums them: two rooms of
                monitors bill two power strips. Right when the rooms are separate, too high when one
                policy would cover both. Savings have no such problem.
              </Step>
              <Step n="2" title="Devices merge, areas don't" tag="counting">
                Within one photo, two &ldquo;monitor&rdquo; lines become one row of five. Across
                photos and phones nothing is de-duplicated, so photograph the same lab twice and it is
                counted twice. Scan each area once.
              </Step>
            </div>
            <p className="mt-8 text-[0.9rem] text-dim">Both behaviours are pinned by tests.</p>
          </Section>

          {/* sources */}
          <Section id="sources" title="Sources">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              Every figure the app multiplies by traces to one of these. Where a figure could not be
              checked against the primary document, the entry says so.
            </p>
            <ol className="mt-6 space-y-5">
              {SOURCES.map((src, i) => (
                <li key={src.id} id={`src-${src.id}`} className="flex gap-4 scroll-mt-28">
                  <span className="font-mono text-[0.8rem] text-dim tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <h3 className="text-[0.98rem] font-semibold text-fog">
                      {src.url.startsWith("http") ? (
                        <a href={src.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-cyan hover:underline">
                          {src.label}
                        </a>
                      ) : (
                        <Link href={src.url} className="underline-offset-4 hover:text-cyan hover:underline">{src.label}</Link>
                      )}
                    </h3>
                    <p className="text-[0.8rem] text-dim">
                      {src.publisher} · {src.year}
                    </p>
                    <p className="mt-1.5 text-[0.9rem] leading-relaxed text-mist">{src.used}</p>
                    {src.caveat && <p className="mt-1 text-[0.84rem] leading-relaxed text-dim">{src.caveat}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <p className="font-editorial border-t border-line pt-10 text-[1.7rem] leading-[1.25] text-fog sm:text-[2rem]">
            Treat the dollars as well-grounded estimates, not meter readings.{" "}
            <span className="italic text-cyan">The deliverable is the order you fix things in, and that order is robust.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <section id={id} className="scroll-mt-28">
        <h2 className="text-[1.45rem] font-semibold tracking-[-0.02em] text-fog sm:text-[1.6rem]">{title}</h2>
        {children}
      </section>
    </Reveal>
  );
}

function Step({ n, title, tag, children }: { n: string; title: string; tag: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="font-editorial text-[2.4rem] leading-none text-cyan">{n}</span>
        <div>
          <h3 className="text-[1.05rem] font-semibold text-fog">{title}</h3>
          <p className="text-[0.82rem] text-dim">{tag}</p>
        </div>
      </div>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-mist">{children}</p>
    </div>
  );
}

function Engine({ tone, title, badge, children }: { tone: string; title: string; badge: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
      <div>
        <h3 className="flex flex-wrap items-center gap-2 text-[1.05rem] font-semibold text-fog">
          {title}
          <span className="rounded-full bg-surface2 px-2 py-0.5 text-[0.72rem] font-medium text-mist">{badge}</span>
        </h3>
        <p className="mt-1.5 text-[0.95rem] leading-relaxed text-mist">{children}</p>
      </div>
    </li>
  );
}

function Default({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="px-3 py-5 text-center first:pl-0 last:pr-0 sm:px-6">
      <dt className="text-[0.8rem] text-dim">{label}</dt>
      <dd className="font-editorial mt-1 text-[2rem] leading-none text-fog sm:text-[2.6rem]">{value}</dd>
      <dd className="mt-1 text-[0.75rem] text-dim">{unit}</dd>
    </div>
  );
}

const SOURCE_SHORT: Record<string, string> = {
  estimate: "app estimate",
  "pnnl-22182": "PNNL lighting study",
  "energystar-displays": "ENERGY STAR displays",
  nielsen: "Nielsen",
};

function RoomHoursTable() {
  const name = (key: string) =>
    key.startsWith("group:") ? GROUP_LABELS[key.slice(6) as DeviceGroup] ?? key.slice(6) : CATALOG_BY_ID[key]?.label ?? key;
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[30rem] text-left text-[0.84rem]">
        <thead>
          <tr className="border-b border-line text-[0.7rem] uppercase tracking-wider text-dim">
            <th className="py-2 pr-3 font-medium">Room</th>
            <th className="py-2 font-medium">Hours a day in use</th>
          </tr>
        </thead>
        <tbody>
          {ROOM_TYPES.filter((r) => Object.keys(r.hours).length).map((r) => (
            <tr key={r.id} className="border-b border-line/60 align-top text-mist">
              <td className="py-2.5 pr-3 text-fog">{r.label}</td>
              <td className="py-2.5">
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(r.hours).map(([k, h]) => (
                    <li key={k} className="whitespace-nowrap">
                      {name(k)} <span className="font-mono text-fog tabular-nums">{h.hours}h</span>
                      <span className="ml-1 text-[0.72rem] text-dim">{SOURCE_SHORT[h.source] ?? h.source}</span>
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
