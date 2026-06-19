import type { Metadata } from "next";
import { Reveal } from "@/components/Reveal";
import { DEVICE_CATALOG } from "@/lib/devices";
import { DEFAULT_SETTINGS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Methodology — Ghost Watt",
  description:
    "Exactly how Ghost Watt turns a photo into a dollar and CO₂ figure: a local vision model for perception, a deterministic wattage table for the energy math.",
};

const fmt = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(1));

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
          defensible — the ranking never depends on the model being right about watts, only about
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
              looks at each photo and returns a list of devices with a count and a state — on,
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
            per year</span>. You can change it — and the electricity rate and carbon intensity — live
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
          building occupied ~1,900 h/yr (≈10 h × 190 school days) — leaving ~6,800 h dark.
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
          <div className="mt-5 overflow-x-auto border border-line">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-surface2 font-mono text-[0.66rem] uppercase tracking-wider text-dim">
                  <th className="px-3 py-2.5 font-medium">Device</th>
                  <th className="px-3 py-2.5 text-right font-medium">On (W)</th>
                  <th className="px-3 py-2.5 text-right font-medium">Standby (W)</th>
                  <th className="px-3 py-2.5 text-right font-medium">Duty</th>
                  <th className="px-3 py-2.5 font-medium">Recommended fix</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {DEVICE_CATALOG.map((c, i) => (
                  <tr key={c.id} className={i % 2 ? "bg-surface" : "bg-surface/40"}>
                    <td className="px-3 py-2.5 font-sans text-sm text-fog">
                      {c.label}
                      {c.thermostatic && <span className="ml-2 text-[0.6rem] text-amber">cycling</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-mist">{fmt(c.wattsOn)}</td>
                    <td className="px-3 py-2.5 text-right text-mist">{fmt(c.wattsStandby)}</td>
                    <td className="px-3 py-2.5 text-right text-mist">{c.dutyCycle.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-sans text-[0.8rem] text-mist">{c.action.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

      {/* modes */}
      <Reveal delay={0.1}>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <div className="panel border-l-2 border-cyan p-5">
            <div className="mono-label text-cyan">live model</div>
            <p className="mt-2 text-sm leading-relaxed text-mist">
              Devices were read from your photo by the local vision model. Every card in this mode
              carries a <span className="text-cyan">live model</span> badge.
            </p>
          </div>
          <div className="panel border-l-2 border-amber p-5">
            <div className="mono-label text-amber">estimated (fallback)</div>
            <p className="mt-2 text-sm leading-relaxed text-mist">
              If Ollama isn&apos;t running, no devices are recognised, or you skip the photo, Ghost
              Watt falls back to a typical fixture set for the room type — so a demo never blanks.
              These cards carry an <span className="text-amber">estimated</span> badge so the two are
              never confused.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <p className="mt-12 border-t border-line pt-6 text-sm leading-relaxed text-dim">
          Bottom line: treat the dollar figures as well-grounded estimates, not meter readings. The
          deliverable is the prioritized list — the order in which facilities should fix things — and
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
