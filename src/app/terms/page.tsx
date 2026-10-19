import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Terms - Ghost Watt",
  description: "What Ghost Watt's numbers are, what they are not, and the terms of using it.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-24 sm:px-6 sm:pt-32">
      <PageHeader eyebrow="Terms" title="Estimates," accent="not meter readings.">
        Plain-language terms for using Ghost Watt. They are short because the app does little that needs terms: it reads
        pictures you choose, does arithmetic you can inspect, and keeps the results on your device.
      </PageHeader>

      <Section title="What the numbers are">
        <P>
          Every dollar, kilowatt-hour and kilogram of CO₂ is an estimate: a published typical wattage for a device class, times
          hours from a usage profile for the kind of room, times an electricity rate for your area or from your bill, times your
          state grid&apos;s emission factor. Each is shown as a range because that is how much is actually known. The{" "}
          <Link href="/methodology" className="text-cyan underline-offset-4 hover:underline">
            Method page
          </Link>{" "}
          cites the source of each figure.
        </P>
        <P>
          A vision model or an on-device detector decides what is in the picture. Both make mistakes: they miss devices, miscount
          them and sometimes name the wrong thing. Items the app cannot cross-check are marked unverified and not counted until you
          confirm them. You can edit or delete any detection. A wattage you measure with a plug-in meter replaces the estimate.
        </P>
      </Section>

      <Section title="What they are not">
        <P>They are not a utility bill, an engineering audit, or a guarantee of savings. Payback figures assume the fix is used as described and the device keeps the state in which it was seen.</P>
        <P>
          Ghost Watt does not state an accuracy percentage because it cannot back one up for your room. The calibration table on the
          Method page shows how the estimates compared with meter readings you entered, and nothing more.
        </P>
      </Section>

      <Section title="Using it">
        <P>Ghost Watt is free, open source (MIT) and provided as is, without warranty of any kind. Decisions about buying, replacing or switching off equipment are yours, or your facilities staff&apos;s, to make.</P>
        <P>
          Photograph only places you are allowed to photograph, and avoid people in frame; the live view does not track people and
          the photo pipeline does not identify them, but a picture sent to a cloud model is still a picture.
        </P>
        <P>
          In Enhanced (cloud) mode, use of the model provider is also subject to that provider&apos;s terms. The app does not store the
          picture; see <Link href="/privacy" className="text-cyan underline-offset-4 hover:underline">Privacy</Link>.
        </P>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-fog">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.95rem] leading-relaxed text-mist">{children}</p>;
}
