import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "Offline - Ghost Watt",
};

const STILL_WORKS = [
  ["Saved audits and buildings still open.", "They live in this browser, not on a server."],
  ["On-device scanning still works.", "The detector and the wattage table ship with the app, so a scan is read here and priced here."],
  ["Enhanced (cloud) reading waits.", "The mode pill says Offline; it switches back to the cloud model when you have a connection."],
];

export default function OfflinePage() {
  return (
    <section className="relative z-10 mx-auto max-w-2xl px-5 pb-16 pt-28 sm:px-6 sm:pt-36">
      <PageHeader eyebrow="No connection" title="No bars here." accent="Usually the part worth auditing.">
        Ghost Watt couldn&apos;t reach the network, but most of it doesn&apos;t need to.
      </PageHeader>
      <ul className="mt-10 space-y-5">
        {STILL_WORKS.map(([lead, rest]) => (
          <li key={lead} className="flex gap-3 text-[1rem] leading-relaxed text-mist">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
            <span>
              <span className="text-fog">{lead}</span> {rest}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-[0.92rem] leading-relaxed text-dim">
        Live prices, hourly grid carbon and class sessions need a connection, and Ghost Watt would
        rather say so than show a stale number that looks current.
      </p>
      <a
        href="/scan"
        className="mt-8 inline-flex rounded-full bg-fog px-6 py-3 text-[0.95rem] font-medium text-ink"
      >
        Back to the scanner
      </a>
    </section>
  );
}
