import Link from "next/link";
import { Mark } from "./HomeNav";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/scan", label: "Scanner" },
      { href: "/places", label: "My places" },
      { href: "/team", label: "Team scan" },
      { href: "/stickers", label: "Room stickers" },
      { href: "/campus", label: "3D school" },
      { href: "/scan?view=report", label: "Printable report" },
    ],
  },
  {
    title: "Understand it",
    links: [
      { href: "/methodology", label: "Methodology" },
      { href: "/about", label: "About" },
      { href: "/settings", label: "Rates & regions" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function HomeFooter() {
  return (
    <footer className="px-5 pb-10 pt-20 sm:px-8">
      <div className="mx-auto max-w-[84rem]">
        <div className="flex flex-col justify-between gap-12 md:flex-row">
          <div className="max-w-[22rem]">
            <div className="flex items-center gap-2.5">
              <Mark />
              <span className="text-[1.02rem] font-semibold tracking-[-0.02em] text-graphite">Ghost Watt</span>
            </div>
            <p className="mt-4 text-[0.92rem] leading-relaxed text-stone">
              The after-hours energy audit for schools. Find what was left on, price it, and fix
              the worst of it first.
            </p>
          </div>
          <div className="flex gap-16 sm:gap-24">
            {COLUMNS.map((c) => (
              <div key={c.title}>
                <p className="text-[0.85rem] text-pebble">{c.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-[0.92rem] text-graphite transition-colors hover:text-sodium-deep">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-col justify-between gap-3 border-t border-hair pt-6 text-[0.8rem] text-pebble sm:flex-row">
          <p>Estimates, not meter readings. The ranking is the deliverable.</p>
          <p>Open source, MIT licensed.</p>
        </div>
      </div>
    </footer>
  );
}
