import type { Metadata } from "next";
import { Reveal } from "@/components/Reveal";
import { CatalogTable } from "@/components/CatalogTable";
import { DEFAULT_SETTINGS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Methodology - Ghost Watt",
  description:
    "Exactly how Ghost Watt turns a photo into a dollar and CO₂ figure: a local vision model for perception, a deterministic wattage table for the energy math.",
};

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-12 pt-28 sm:px-6">
      <Reveal>
        <div className="mono-label text-cyan">methodology</div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-fog sm:text-5xl">
          How a photo becomes a number you can defend.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-mist">
          Ghost Watt splits the problem cleanly: the model only does{" "}
          <span className="text-fog">perception</span>, and deterministic code does all the{" "}
          <span className="text-fog">energy reasoning</span>. That&apos;s what makes the output
          defensible - the ranking never depends on the model being right about watts, only about
          what&apos;s in the room.
        </p>
      </Reveal>

      {/* the split */}
      <Reveal delay={0.05}>
        <div className="mt-12 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
          <div className="bg-surface p-6">
            <div className="mono-label text-cyan">step 1 · perception (local model)</div>
            <p className="mt-3 text-sm leading-relaxed text-mist">
              A local vision model (via Ollama, default <span className="font-mono text-fog">moondream</span>)
              looks at each photo and returns a list of devices with a count and a state - on,
              standby, or off. It is asked for nothing about energy. We parse its JSON; if it
              answers in prose, we still scan it clause-by-clause against the device lexicon.
            </p>
          </div>
          <div className="bg-surface p-6">
            <div className="mono-label text-lime">step 2 · energy math (deterministic)</div>
            <p className="mt-3 text-sm leading-relaxed text-mist">
              Each identified device is matched to one category in the wattage table below, then run
              through the same formula every time. No model judgement enters the arithmetic, so two
              identical photos always produce identical numbers.
            </p>
          </div>
        </div>
      </Reveal>

      {/* the formula */}
      <Reveal delay={0.1}>
        <div className="mt-10">
          <h2 className="text-xl font-bold text-fog">The formula</h2>
          <div className="mt-4 panel ticked p-5 font-mono text-sm leading-loose text-mist">
            <div><span className="text-cyan">waste_kWh/yr</span> = (effective_watts ÷ 1000) × empty_hours_per_year</div>
            <div><span className="text-amber">cost_$/yr</span> = waste_kWh/yr × electricity_rate</div>
            <div><span className="text-lime">co2_kg/yr</span> = waste_kWh/yr × grid_carbon_intensity</div>
            <div className="mt-3 text-dim">{"// effective_watts = watts in the observed state × count"}</div>
            <div className="text-dim">{"// thermostatic gear (fridges, AC, vending) uses a duty-cycle average"}</div>
            <div className="text-dim">{"// savings = waste × fix_effectiveness; payback = fix_cost ÷ savings"}</div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-mist">
            Phantom load is only &quot;wasted&quot; during the hours the building is empty, so every
            number scales with one transparent assumption: <span className="text-fog">empty hours
            per year</span>. You can change it - and the electricity rate and carbon intensity - live
            in the scanner.
          </p>
        </div>
      </Reveal>

      {/* defaults */}
      <Reveal delay={0.1}>
        <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden border border-line bg-line">
          <Default label="electricity rate" value={`$${DEFAULT_SETTINGS.ratePerKwh.toFixed(2)}`} unit="per kWh" />
          <Default label="grid carbon" value={DEFAULT_SETTINGS.co2PerKwh.toFixed(3)} unit="kg CO₂ / kWh" />
          <Default label="empty hours" value={DEFAULT_SETTINGS.unoccupiedHoursPerYear.toLocaleString()} unit="hours / year" />
        </div>
        <p className="mt-3 font-mono text-[0.7rem] leading-relaxed text-dim">
          Defaults reflect US-average commercial electricity price, US grid carbon intensity, and a
          building occupied ~1,900 h/yr (≈10 h × 190 school days) - leaving ~6,800 h dark.
        </p>
      </Reveal>

      {/* wattage table */}
      <Reveal delay={0.1}>
        <div className="mt-12">
          <h2 className="text-xl font-bold text-fog">The wattage lookup table</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            Representative figures, not nameplate maxima. Fuzzy on any single device, but stable
            enough that the <span className="text-cyan">ranking</span> holds.
          </p>
          <CatalogTable />
        </div>
      </Reveal>

      {/* modes */}
      <Reveal delay={0.1}>
        <div className="mt-12">
          <h2 className="text-xl font-bold text-fog">Which engine read the photo</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            Perception is a chain, tried in order, stopping at the first that answers. Whichever
            one ran, it contributed the same single thing: a list of devices and their states.
            Every number after that point is identical.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="panel border-l-2 border-cyan p-5">
              <div className="mono-label text-cyan">local model</div>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                Ollama on your own machine. The photo never leaves the device. Cards read from it
                carry a <span className="text-cyan">live model</span> badge.
              </p>
            </div>
            <div className="panel border-l-2 border-lime p-5">
              <div className="mono-label text-lime">hosted model</div>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                If no local model is running and the deployment holds a vision key, the photo is
                read by that provider instead - so a visitor with nothing installed still gets a
                real reading. The photo is sent for the scan and is not stored.
              </p>
            </div>
            <div className="panel border-l-2 border-amber p-5">
              <div className="mono-label text-amber">estimated (fallback)</div>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                No engine available, no devices recognised, or no photo at all: Ghost Watt uses a
                typical fixture set for the room type, so a demo never blanks. These cards carry an{" "}
                <span className="text-amber">estimated</span> badge so the two are never confused.
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* carbon intensity */}
      <Reveal delay={0.1}>
        <div className="mt-12">
          <h2 className="text-xl font-bold text-fog">Where the carbon number comes from</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            A kilowatt-hour does not have a fixed carbon cost. It depends entirely on what was
            burning to produce it, which changes hour by hour. Ghost Watt has two answers and tells
            you which one it used.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="panel p-5">
              <div className="mono-label">without a key - eGRID annual average</div>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                A stored per-state figure derived from EPA eGRID subregion generation intensity.
                Right for a yearly report, blunt for a decision made on a Tuesday afternoon.
              </p>
            </div>
            <div className="panel border-l-2 border-lime p-5">
              <div className="mono-label text-lime">with an EIA key - computed hourly</div>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                EIA-930, the hourly grid monitor, publishes generation by fuel type for each
                balancing authority. Ghost Watt fetches the last 72 hours for the operator serving
                your state and computes intensity itself.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto border border-line bg-ink px-4 py-3 font-mono text-[0.78rem] leading-relaxed text-mist">
            <div>
              <span className="text-lime">gCO₂e/kWh</span> = Σ(MWh_fuel × kg_per_MWh_fuel) ÷ Σ(MWh_fuel)
            </div>
            <div className="mt-1 text-dim">
              coal 1000 · oil 970 · natural gas 430 · other 550 · geothermal 40
            </div>
            <div className="text-dim">
              nuclear, hydro, wind, solar, storage discharge = 0
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-mist">
            Factors are EPA generation-side values, the same convention eGRID uses, so the live
            figure stays comparable with the stored one. Storage is zero because those emissions
            were already counted when the energy was generated - charging a battery from a coal
            plant shows up as coal, and counting the discharge again would double-count it.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            Two honest caveats. The feed lags real time by several hours and the lag differs per
            operator, so the app shows the most recent published hour and stamps it rather than
            calling it &ldquo;now&rdquo;. And several states are split across operators; Ghost Watt
            uses the one carrying most of the state&rsquo;s load, which is right for a
            school-scale estimate and not a substitute for a meter.
          </p>
        </div>
      </Reveal>

      {/* what the totals do and do not mean */}
      <Reveal delay={0.1}>
        <div className="mt-12">
          <h2 className="text-xl font-bold text-fog">What the totals are counting</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            Adding up rows sounds like the part with no assumptions in it. It is not, and these are
            the two places where the arithmetic makes a choice on your behalf.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="panel border-l-2 border-amber p-5">
              <div className="mono-label text-amber">fix cost is an upper bound</div>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                Every offender row carries the cost of its own fix, and the total sums them. Two
                rooms of monitors therefore bill{" "}
                <span className="text-fog">two smart power strips</span>. That is right when the
                rooms are genuinely separate, and too high when one strip or one policy change would
                cover both - a district-wide sleep policy costs nothing per room, but this page
                still prices a strip for each. Read the capital figure as a ceiling. The savings
                figure has no such problem: a monitor left on overnight in Room 214 is not the same
                monitor as the one in Room 220.
              </p>
            </div>
            <div className="panel border-l-2 border-cyan p-5">
              <div className="mono-label text-cyan">devices are merged, areas are not</div>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                Within one photo, two &ldquo;monitor&rdquo; lines from the model collapse into one
                row of five, because facilities wants a count to act on and not two lines to
                reconcile. Across photos - and across phones in a class session - nothing is
                de-duplicated. Photograph the same lab twice and it is counted twice, so scan each
                area once.
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-dim">
            Both behaviours are pinned by tests, so they cannot drift underneath this paragraph.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <p className="mt-12 border-t border-line pt-6 text-sm leading-relaxed text-dim">
          Bottom line: treat the dollar figures as well-grounded estimates, not meter readings. The
          deliverable is the prioritized list - the order in which facilities should fix things - and
          that order is robust.
        </p>
      </Reveal>
    </div>
  );
}

function Default({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-surface p-4 text-center">
      <div className="font-mono text-2xl font-bold text-fog">{value}</div>
      <div className="mono-label mt-1">{label}</div>
      <div className="font-mono text-[0.62rem] text-dim">{unit}</div>
    </div>
  );
}
