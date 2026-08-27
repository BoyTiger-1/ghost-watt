import Link from "next/link"; 

export function Footer() {
  return (
    <footer className="site-footer relative z-10 mt-24 border-t border-line bg-void/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div>
          <div className="font-mono text-sm font-bold tracking-[0.2em] text-fog">
            GHOST<span className="text-cyan">{"//"}</span>WATT
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-mist">
            The after-hours energy map nobody has. Crowdsource a photo-audit, get a
            prioritized fix list facilities can act on Monday.
          </p>
        </div>

        <div>
          <div className="mono-label">Pages</div>
          <ul className="mt-3 space-y-2 text-sm text-mist">
            <li><Link href="/scan" className="hover:text-cyan">Scanner</Link></li>
            <li><Link href="/portfolio" className="hover:text-cyan">Portfolio</Link></li>
            <li><Link href="/class" className="hover:text-cyan">Class mode</Link></li>
            <li><Link href="/methodology" className="hover:text-cyan">Methodology</Link></li>
            <li><Link href="/settings" className="hover:text-cyan">Settings</Link></li>
            <li><Link href="/about" className="hover:text-cyan">About</Link></li>
          </ul>
        </div>

        <div>
          <div className="mono-label">Local first</div>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            When Ollama is running, photos are read on your own machine and never leave the
            building. Without it, a scan falls back to a hosted model, and the badge in the
            header says which one read your photo before you upload it.
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <p className="font-mono text-[0.68rem] tracking-wider text-dim">
            ESTIMATES, NOT METER READINGS - THE RANKING OF WORST OFFENDERS IS THE DELIVERABLE.
          </p>
        </div>
      </div>
    </footer>
  );
}
