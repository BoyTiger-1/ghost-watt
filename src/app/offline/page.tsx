export const metadata = {
  title: "Offline - Ghost Watt",
};

export default function OfflinePage() {
  return (
    <section className="relative z-10 mx-auto max-w-2xl px-4 pb-16 pt-32 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 bg-amber" />
        <span className="mono-label text-amber">no connection</span>
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-fog">
        You are in the part of the building with no bars.
      </h1>
      <p className="mt-4 leading-relaxed text-mist">
        Which is usually the part worth auditing. This page is here because Ghost Watt could not
        reach the network, but most of the app does not need it:
      </p>
      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-mist">
        <li className="border-l-2 border-line pl-3">
          <span className="text-fog">Saved audits and buildings still open.</span> They live in this
          browser, not on a server.
        </li>
        <li className="border-l-2 border-line pl-3">
          <span className="text-fog">Room-profile estimates still work.</span> The wattage table and
          the room presets ship with the app.
        </li>
        <li className="border-l-2 border-line pl-3">
          <span className="text-fog">Photos are safe.</span> Take them now; a scan that needs a
          hosted model will simply say so, and you can run it when you are back in range.
        </li>
      </ul>
      <p className="mt-6 text-sm leading-relaxed text-dim">
        Live prices, hourly grid carbon and class sessions all need a connection, and Ghost Watt
        would rather tell you that than serve you a stale number that looks current.
      </p>
      <a
        href="/scan"
        className="mt-6 inline-block border border-cyan bg-cyan/10 px-4 py-2 font-mono text-sm tracking-wider text-cyan transition-colors hover:bg-cyan/20"
      >
        back to the scanner
      </a>
    </section>
  );
}
