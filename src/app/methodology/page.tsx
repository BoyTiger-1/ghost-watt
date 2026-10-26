import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { CatalogTable } from "@/components/CatalogTable";
import { CalibrationTable } from "@/components/CalibrationTable";
import { ROOM_TYPES } from "@/lib/rooms";
import { SOURCES, SOURCE_GROUPS } from "@/lib/sources";
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
  { id: "tech", label: "Which unit it is" },
  { id: "hvac", label: "The watt you pay for twice" },
  { id: "when", label: "The price of the empty hours" },
  { id: "bill", label: "Answering to the meter" },
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
            {/* wider than the prose column on a large screen, so whole lines fit */}
            <div className="mt-6 hidden sm:block xl:w-[calc(100%+7rem)]">
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
                <span className="text-fog">Savings</span>{" "}are the idle cost times the fix&apos;s
                effectiveness; <span className="text-fog">payback</span>{" "}is the fix&apos;s cost over
                the savings.
              </li>
              <li>
                Idle cost only counts during the hours the building is empty, so every figure scales with
                one assumption you can see and change: <span className="text-fog">empty hours per year</span>.
              </li>
              <li>
                <span className="text-fog">One total, two parts.</span> Every device is shown as{" "}
                <span className="font-mono text-[0.9em] text-fog">$total a year = $used + $idle</span>, and the two parts always add up.
                Idle is what it costs through the empty hours; used is the rest of the year&apos;s cost. The idle figure
                depends on what a device does when nobody is there, so it also carries a range: from sleeping (its standby draw)
                to staying fully on. Beside every idle figure a short caption says what it assumes:{" "}
                <span className="text-fog">&ldquo;assumes it sleeps overnight&rdquo;</span> when the photo was taken in the day and
                the device was seen on, <span className="text-fog">&ldquo;as photographed&rdquo;</span> when it was seen in the state
                it is priced in, or <span className="text-fog">&ldquo;set by you&rdquo;</span> when you said what it does; then{" "}
                <span className="text-fog">&ldquo;your hours&rdquo;</span> or the place&apos;s schedule and its empty hours a year.
              </li>
              <li>
                Four terms refine that figure when — and only when — something is known that supports
                them: which unit it is, what its heat does to the building, what a kilowatt-hour costs
                in the empty hours specifically, and whether the whole thing agrees with a meter
                reading. Each is the identity until its input exists, so a scan with nothing but a
                photo gets exactly the arithmetic above.
              </li>
            </ul>
          </Section>

          {/* which unit it is */}
          <Section id="tech" title="Which unit it is">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              The band for overhead lighting runs 40 W to 250 W. That is not imprecision — it is two
              different objects. A four-lamp T12 troffer on a magnetic ballast draws about 180 W; the
              LED panel that replaced it draws about 40 W. Same ceiling, same photograph, four and a
              half times the money.
            </p>
            <p className="mt-4 text-[1rem] leading-relaxed text-mist">
              A vision model answers that question well, because “is that a fluorescent tube or an LED
              panel?” is about how a thing looks. It answers{" "}
              <span className="text-fog">“how many watts is it?”</span> badly, because that is
              arithmetic it has no way to do. So the two readings are weighted differently: a named
              technology counts for more than a named wattage, and a stated screen diagonal goes
              through the area law that display power actually follows — a 65-inch panel is four times
              a 32-inch one, not twice.
            </p>
            <p className="mt-4 text-[0.9rem] leading-relaxed text-dim">
              Every reading is blended with the published band rather than replacing it, so one
              misread moves a figure part of the way and never all of it. A plug-in meter reading
              replaces the lot. The same table grades the device and prices it, so the efficiency
              verdict on a card and the dollars above it can never rest on different wattages.
            </p>
          </Section>

          {/* hvac interaction */}
          <Section id="hvac" title="The watt you pay for twice">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              A 30 W monitor left on overnight does not cost 30 W. Every watt a device draws comes out
              of it as heat, and in a building that is being cooled that heat is a load the air
              conditioner has to remove — about another third of a watt per watt, at the efficiency a
              typical packaged unit actually achieves. In a building that is being heated, the same
              heat is heat the system did not have to make, so part of it comes back.
            </p>
            <p className="mt-4 text-[1rem] leading-relaxed text-mist">
              How much of each depends on the climate, which is why this needs the building&apos;s
              state and how it is heated and cooled before it will do anything at all. Without both,
              the factor is exactly 1: a correction nobody can check is worse than no correction.
            </p>
            <ul className="mt-6 space-y-2 text-[0.95rem] leading-relaxed text-mist">
              <li>
                Gas heat earns <span className="text-fog">no credit</span>. The saving there is therms,
                which is real and is not something this app bills for.
              </li>
              <li>
                The heating credit is <span className="text-fog">halved</span> on purpose. The cooling
                penalty is unavoidable — the heat has to go somewhere — while a credit needs the heat
                to arrive where somebody wanted it, and the device being costed is one nobody is using
                in a room nobody is in, in a building that has dropped to a setback temperature.
              </li>
              <li>
                Nothing is applied to the heating and cooling plant itself: an air conditioner&apos;s
                consumption already <span className="text-fog">is</span> the conditioning. Nothing is
                applied to a device whose heat goes outdoors either — a car-park light, an exhaust fan.
              </li>
            </ul>
          </Section>

          {/* time of use */}
          <Section id="when" title="The price of the empty hours">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              Everything on this site is about the hours a building is empty, and on a time-of-use
              tariff those hours are not billed at the average of the year. Published commercial
              on-peak to off-peak ratios run from about 1.3:1 to 3:1, so the gap is worth tens of
              percent on the one figure the app asks anyone to act on.
            </p>
            <p className="mt-4 text-[1rem] leading-relaxed text-mist">
              Which way it goes is not something you can assume, and that is the reason it is
              computed. A building that shuts at four o&apos;clock (an office or a school, say) is{" "}
              <span className="text-fog">closed through an evening peak</span> — so its overnight idle cost
              costs about a tenth <em>more</em> than the average said — and{" "}
              <span className="text-fog">open through a midday one</span>, where the same idle hours cost
              about a fifth less. A tariff sheet carries a price for every hour of every month; the
              schedule says which of those hours the building is open; crossing the two is the whole
              calculation.
            </p>
            <p className="mt-4 text-[0.9rem] leading-relaxed text-dim">
              Only available when a tariff was looked up from the building&apos;s location. A price
              typed in, or taken off a bill, is one blended figure for the whole year and is not split
              — inventing a peak and off-peak share for it would be making a number up.
            </p>
          </Section>

          {/* bill reconciliation */}
          <Section id="bill" title="Answering to the meter">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              Everything above is a bottom-up estimate. Count the devices, look up what they draw,
              multiply by hours and a price — every step defensible, every step an assumption, and the
              assumptions multiply. A utility bill is the only hard measurement in the chain: the
              building stating, with no modelling in between, how much electricity it actually used.
            </p>
            <p className="mt-4 text-[1rem] leading-relaxed text-mist">
              So when a bill is entered, the audit answers to it. If the lines add up to more plug and
              lighting energy than the meter leaves room for, the estimate is wrong and{" "}
              <span className="text-fog">comes down</span>. If it fits, nothing moves — and the fit is
              reported, because it is the only independent check the model could have failed.
            </p>
            <p className="mt-4 text-[1rem] leading-relaxed text-mist">
              The correction is not spread evenly. Each line gives up ground in proportion to its own
              size times its own uncertainty, so a wide catalog guess absorbs most of it and a line
              somebody measured with a plug-in meter moves by about a thousandth as much. Squeezing
              both equally would take the one honest number in the audit and make it wrong to make a
              guess look better.
            </p>
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
              (≈ 10 hours × 190 days, a school-year pattern), which leaves about 6,800 dark. In practice a scan
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
              app calls idle cost. Published figures are tagged with their source; the rest
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
                Only when you run Ghost Watt yourself with Ollama installed (for development or a
                private install). The photo never leaves that machine. The public site never uses
                this path.
              </Engine>
              <Engine tone="bg-cyan" title="A hosted model" badge="live model">
                If nothing local is running and the deployment holds a vision key, that provider
                reads the photo instead, so a visitor with nothing installed still gets a real
                reading. The photo is sent for the scan and is not stored.
              </Engine>
              <Engine tone="bg-lime" title="The detector in your browser" badge="on-device">
                With no cloud model, or when you choose to keep pictures on the device, a small
                object detector reads the picture in the browser. It recognises screens, laptops,
                common appliances and lit fixtures and nothing else, so it undercounts. If a cloud
                model was asked and could not answer (out of quota, down, or too slow), this reading
                is used instead and the result says why. There is no further path: a scan that could
                not be read says so instead of guessing.
              </Engine>
            </ol>
          </Section>

          {/* ghosty */}
          <Section id="ghosty" title="What Ghosty Insights does, and doesn't">
            <p className="mt-3 text-[1rem] leading-relaxed text-mist">
              Ghosty reads a finished scan and says what matters: the device to fix first, what can be
              done tonight for free, what looks odd, and a note to send to whoever holds the budget. It is
              given only the figures this page describes (devices, counts, costs, fixes and paybacks),
              never a photo, and it does no arithmetic anyone acts on. Every dollar figure it hands back is
              checked against the scan&apos;s own totals, and one that does not fit is dropped. With no AI
              provider on the site, the same card is written by fixed rules over the same figures and is
              labelled as such.
            </p>
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
              Ghost Watt uses the one carrying most of its load: right for a building-scale estimate,
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
              Every figure the app multiplies by, every statistic quoted on this site, and every
              outside service and model it relies on, with what is taken from each. Where a figure
              could not be checked against the primary document, the entry says so.
            </p>
            {SOURCE_GROUPS.map((g) => {
              const items = SOURCES.filter((src) => (src.group ?? "figures") === g.id);
              if (!items.length) return null;
              return (
                <div key={g.id} id={`sources-${g.id}`} className="mt-10 scroll-mt-28">
                  <h3 className="text-[1.05rem] font-semibold text-fog">{g.title}</h3>
                  <p className="mt-1 text-[0.88rem] text-dim">{g.blurb}</p>
                  <ol className="mt-5 space-y-5">
                    {items.map((src) => {
                      const n = SOURCES.indexOf(src) + 1;
                      return (
                        <li key={src.id} id={`src-${src.id}`} className="flex gap-4 scroll-mt-28">
                          <span className="font-mono text-[0.8rem] text-dim tabular-nums">{String(n).padStart(2, "0")}</span>
                          <div className="min-w-0">
                            <h4 className="text-[0.98rem] font-semibold text-fog">
                              {src.url.startsWith("http") ? (
                                <a href={src.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-cyan hover:underline">
                                  {src.label}
                                </a>
                              ) : (
                                <Link href={src.url} className="underline-offset-4 hover:text-cyan hover:underline">{src.label}</Link>
                              )}
                            </h4>
                            <p className="text-[0.8rem] text-dim">
                              {src.publisher} · {src.year}
                            </p>
                            <p className="mt-1.5 text-[0.9rem] leading-relaxed text-mist">{src.used}</p>
                            {src.caveat && <p className="mt-1 text-[0.84rem] leading-relaxed text-dim">{src.caveat}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
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
