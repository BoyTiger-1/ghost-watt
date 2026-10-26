// The product, as it appears on each screen in the device composition.
// Sized in em so each one scales with its display (see Devices.tsx).

import { DeviceGlyph } from "@/components/DeviceGlyph";
import { Mark } from "./HomeNav";

export const RANKED = [
  { icon: "light", name: "Gym lights", room: "Gym", cost: 849, fix: "Occupancy sensors · $50", pay: "1 mo" },
  { icon: "monitor", name: "Lab monitors", room: "Room 108", cost: 796, fix: "Smart strips · $60", pay: "1 mo" },
  { icon: "heater", name: "Space heater", room: "Main office", cost: 530, fix: "Smart plug · $25", pay: "1 mo" },
  { icon: "projector", name: "Projector", room: "Room 214", cost: 221, fix: "Auto-off timer · $40", pay: "2 mo" },
  { icon: "vending", name: "Vending machine", room: "Lobby", cost: 194, fix: "Vending controller · $180", pay: "22 mo" },
];

/* ---- laptop: the brief for the decision-maker ------------------------------ */

export function ReportScreen() {
  return (
    <div className="flex h-full flex-col bg-[#fbfaf7] font-grotesk text-[#1c1b18]">
      {/* browser chrome */}
      <div className="flex h-[2.6em] shrink-0 items-center gap-[0.5em] border-b border-[#ebe6dc] bg-[#f3f0ea] px-[1em]">
        <span className="h-[0.75em] w-[0.75em] rounded-full bg-[#ff5f57]" />
        <span className="h-[0.75em] w-[0.75em] rounded-full bg-[#febc2e]" />
        <span className="h-[0.75em] w-[0.75em] rounded-full bg-[#28c840]" />
        <span className="mx-auto rounded-[0.5em] bg-white px-[3em] py-[0.3em] text-[0.8em] text-[#8b867c] ring-1 ring-[#e7e2d8]">
          ghostwatt.app/report
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[13em] shrink-0 flex-col gap-[0.3em] border-r border-[#ebe6dc] p-[1.2em]">
          <div className="mb-[1.2em] flex items-center gap-[0.5em]">
            <Mark className="h-[1.7em] w-[1.29em]" />
            <span className="text-[0.95em] font-semibold">Ghost Watt</span>
          </div>
          {["Scanner", "Portfolio", "Brief", "Class", "Methodology"].map((n) => (
            <span
              key={n}
              className={`rounded-[0.5em] px-[0.7em] py-[0.45em] text-[0.88em] ${n === "Brief" ? "bg-[#1c1b18] text-white" : "text-[#6f6a60]"}`}
            >
              {n}
            </span>
          ))}
          <div className="mt-auto rounded-[0.7em] bg-[#f1ede5] p-[0.8em] text-[0.75em] leading-snug text-[#6f6a60]">
            22 rooms scanned by 27 people
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-[1.8em]">
          <p className="text-[0.8em] text-[#8b867c]">After-hours brief · Riverside Building · October</p>
          <h3 className="font-editorial mt-[0.3em] text-[2.9em] leading-[1] tracking-[-0.02em]">
            $4,820 a year, <span className="italic text-[#3a4566]">recoverable.</span>
          </h3>
          <p className="mt-[0.5em] text-[0.85em] text-[#6f6a60]">38 offenders across 22 rooms · 15.1 t CO₂ · ranked worst first</p>

          <div className="mt-[1.4em] grid grid-cols-[1.45fr_1fr] gap-[1.4em]">
            <div className="rounded-[0.9em] bg-white p-[1em] ring-1 ring-[#ebe6dc]">
              {RANKED.map((r, i) => (
                <div key={r.name} className="flex items-center gap-[0.8em] border-b border-[#f0ece4] py-[0.62em] last:border-0">
                  <span className="w-[1em] font-numeric text-[0.75em] text-[#a19b90]">{i + 1}</span>
                  <span className="grid h-[2.1em] w-[2.1em] place-items-center rounded-[0.55em] bg-[#f4f0e8] text-[#3a4566]">
                    <DeviceGlyph icon={r.icon} className="h-[1.2em] w-[1.2em]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[0.9em] font-medium">
                        {r.name} <span className="font-normal text-[#a19b90]">· {r.room}</span>
                      </span>
                      <span className="font-numeric text-[0.85em] text-[#a8610c]">${r.cost}</span>
                    </div>
                    <div className="mt-[0.35em] h-[0.3em] overflow-hidden rounded-full bg-[#f1ede5]">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#ef9d2e,#d9512c)]" style={{ width: `${(r.cost / 849) * 100}%` }} />
                    </div>
                    <div className="mt-[0.3em] text-[0.72em] text-[#8b867c]">
                      {r.fix} · <span className="text-[#2e5b45]">pays back {r.pay}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-[1.2em]">
              <div className="rounded-[0.9em] bg-white p-[1em] ring-1 ring-[#ebe6dc]">
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.8em] font-medium">Overnight load</span>
                  <span className="text-[0.7em] text-[#8b867c]">4pm to 7am</span>
                </div>
                <svg viewBox="0 0 200 80" className="mt-[0.6em] w-full" aria-hidden="true">
                  <defs>
                    <linearGradient id="rs-a" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#ef9d2e" stopOpacity="0.45" />
                      <stop offset="1" stopColor="#ef9d2e" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[20, 40, 60].map((y) => (
                    <line key={y} x1="0" x2="200" y1={y} y2={y} stroke="#f0ece4" />
                  ))}
                  <path d="M0 14 C20 16 30 30 45 36 S70 40 90 41 S130 42 150 40 S185 30 200 18 L200 80 L0 80Z" fill="url(#rs-a)" />
                  <path d="M0 14 C20 16 30 30 45 36 S70 40 90 41 S130 42 150 40 S185 30 200 18" fill="none" stroke="#d9512c" strokeWidth="1.6" />
                  <path d="M0 62 L200 62" stroke="#2e5b45" strokeWidth="1.2" strokeDasharray="3 3" />
                </svg>
                <div className="mt-[0.4em] flex justify-between text-[0.66em] text-[#8b867c]">
                  <span>idle</span>
                  <span className="text-[#2e5b45]">after fixes</span>
                </div>
              </div>
              <div className="rounded-[0.9em] bg-[#1c1b18] p-[1em] text-white">
                <span className="text-[0.72em] text-white/60">With a $250 budget</span>
                <p className="font-editorial mt-[0.2em] text-[1.7em] leading-[1.05]">Fix four things first.</p>
                <p className="mt-[0.4em] text-[0.75em] text-white/70">$2,154 a year back · pays for itself in under a month</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---- tablet: the budget planner ----------------------------------------- */

const PLAN = [
  { name: "Occupancy sensors, gym", cost: 50, back: 764, on: true },
  { name: "Smart strips, lab", cost: 60, back: 756, on: true },
  { name: "Smart plug, office heater", cost: 25, back: 424, on: true },
  { name: "Auto-off timer, 214", cost: 40, back: 210, on: true },
  { name: "Vending controller, lobby", cost: 180, back: 97, on: false },
];

export function BudgetScreen() {
  return (
    <div className="flex h-full flex-col bg-[#fbfaf7] p-[1.6em] font-grotesk text-[#1c1b18]">
      <div className="flex items-center justify-between text-[0.72em] text-[#8b867c]">
        <span className="font-medium text-[#1c1b18]">9:41</span>
        <span>Budget planner</span>
      </div>
      <div className="mt-[1.2em] flex items-end justify-between">
        <div>
          <p className="text-[0.85em] text-[#6f6a60]">What the PTA can spend</p>
          <p className="font-editorial text-[3.2em] leading-[1]">$250</p>
        </div>
        <span className="rounded-full bg-[#e3ecdf] px-[0.8em] py-[0.35em] text-[0.72em] text-[#2e5b45]">best combination</span>
      </div>
      <div className="relative mt-[1em] h-[0.4em] rounded-full bg-[#ebe6dc]">
        <div className="absolute inset-y-0 left-0 w-[25%] rounded-full bg-[#1c1b18]" />
        <div className="absolute left-[25%] top-1/2 h-[1.3em] w-[1.3em] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)] ring-1 ring-black/5" />
      </div>
      <div className="mt-[1.4em] flex-1 space-y-[0.5em]">
        {PLAN.map((p) => (
          <div
            key={p.name}
            className={`flex items-center gap-[0.8em] rounded-[0.8em] px-[0.9em] py-[0.65em] ${p.on ? "bg-white ring-1 ring-[#ebe6dc]" : "opacity-45"}`}
          >
            <span className={`grid h-[1.3em] w-[1.3em] place-items-center rounded-full ${p.on ? "bg-[#2e5b45] text-white" : "ring-1 ring-[#c9c3b8]"}`}>
              {p.on && (
                <svg viewBox="0 0 12 12" className="h-[0.75em] w-[0.75em]" aria-hidden="true">
                  <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="flex-1 text-[0.9em]">{p.name}</span>
            <span className="font-numeric text-[0.78em] text-[#8b867c]">${p.cost}</span>
            <span className="w-[5.2em] text-right font-numeric text-[0.78em] text-[#2e5b45]">+${p.back}/yr</span>
          </div>
        ))}
      </div>
      <div className="mt-[1em] flex items-center justify-between rounded-[0.9em] bg-[#1c1b18] px-[1.1em] py-[0.9em] text-white">
        <div>
          <p className="text-[0.72em] text-white/60">$235 of $250</p>
          <p className="text-[1.05em] font-medium">$1,120 a year back</p>
        </div>
        <p className="text-right text-[0.78em] text-white/75">
          pays for itself
          <br />
          in 2.5 months
        </p>
      </div>
    </div>
  );
}

/* ---- phone: one offender, in detail ------------------------------------- */

export function OffenderScreen() {
  return (
    <div className="flex h-full flex-col bg-[#f5f2eb] px-[1.1em] pb-[1.2em] pt-[3.6em] font-grotesk text-[#1c1b18]">
      <div className="flex items-center justify-between">
        <span className="text-[0.78em] text-[#6f6a60]">‹ Room 214</span>
        <span className="rounded-full bg-[#e5e9f4] px-[0.6em] py-[0.2em] text-[0.62em] text-[#3a4566]">live model</span>
      </div>

      <div className="mt-[1em] overflow-hidden rounded-[1.2em] bg-[#1a2033]">
        <div className="relative h-[8.5em]">
          <div className="absolute left-1/2 top-[34%] h-[2.6em] w-[5em] -translate-x-1/2 rounded-[0.6em] bg-[#c9cdd8]">
            <span className="absolute bottom-[0.35em] left-1/2 h-[0.9em] w-[0.9em] -translate-x-1/2 rounded-full bg-[#fffbe6] shadow-[0_0_1.2em_0.4em_rgba(255,246,220,0.6)]" />
          </div>
          <div className="absolute left-1/2 top-[26%] h-[4.1em] w-[6.6em] -translate-x-1/2 rounded-[0.4em] border-[0.14em] border-[#ff7a52]" />
          <span className="absolute left-[18%] top-[12%] rounded-[0.3em] bg-[#ff7a52] px-[0.4em] py-[0.1em] text-[0.6em] font-medium">Projector · on</span>
        </div>
      </div>

      <p className="mt-[1.1em] text-[0.78em] text-[#6f6a60]">Projector, left on</p>
      <p className="font-editorial text-[3em] leading-[1]">
        $221<span className="text-[0.4em] text-[#6f6a60]"> / year</span>
      </p>
      <p className="mt-[0.3em] text-[0.72em] text-[#6f6a60]">1,700 kWh · 595 kg CO₂ · confidence high</p>

      <div className="mt-[1.1em] rounded-[1em] bg-white p-[0.9em] ring-1 ring-[#e7e2d8]">
        <p className="text-[0.66em] text-[#8b867c]">The fix</p>
        <p className="mt-[0.15em] text-[0.95em] font-medium">Auto-off timer</p>
        <div className="mt-[0.6em] flex justify-between text-[0.7em]">
          <span className="text-[#6f6a60]">Costs $40</span>
          <span className="text-[#2e5b45]">pays back in 2 months</span>
        </div>
      </div>

      <div className="mt-auto rounded-full bg-[#1c1b18] py-[0.8em] text-center text-[0.82em] font-medium text-white">Add to the plan</div>
    </div>
  );
}
