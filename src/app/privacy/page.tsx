import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Privacy - Ghost Watt",
  description: "Exactly what stays on your device and what is sent to a cloud model, in plain language.",
};

const STAYS = [
  ["Your photos and camera frames, in On-device mode.", "The detector runs in your browser. No picture is uploaded, ever, in this mode."],
  ["Every saved scan, room, building, fix and bill.", "Stored in this browser's local storage only. There is no account and no server copy. Clearing site data erases it; Export backup saves a file you keep."],
  ["Your electricity rate, schedule and settings.", "Also local storage. They are sent with a scan request only as numbers (rate, hours), never with anything that identifies you."],
  ["Display and accessibility choices.", "Theme, text size, language and the rest are stored in this browser and never sent anywhere."],
];

const LEAVES = [
  [
    "A photo of an electricity bill, if you choose to read one, in Enhanced (cloud) mode only.",
    "It goes the same way as a scan photo: to this app's server, then to the vision model, then it is discarded. The figures it reads are shown to you to confirm or correct before anything is saved, and only the confirmed numbers are kept, in this browser.",
  ],
  [
    "A photo or camera frame, in Enhanced (cloud) mode only.",
    "It is sent to this app's own server, which forwards it to the configured vision model provider (for example Anthropic, Groq or OpenAI) to be read. The server does not store it. The provider's own retention policy applies while it processes the request. The pill in the header says Enhanced before you scan, so this never happens without you seeing it.",
  ],
  ["A location, if you allow it or a photo carries one.", "Latitude and longitude, rounded to about a kilometre, go to this app's server to look up the serving utility's rate (OpenEI), the place name (OpenStreetMap) and, if you set them, weather and solar resource. Nothing else goes with them."],
  ["Device rows, if you join a class session.", "The computed rows (device, count, watts, dollars) and the area name you type. Never the photo."],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-24 sm:px-6 sm:pt-32">
      <PageHeader eyebrow="Privacy" title="What stays here," accent="what leaves.">
        Ghost Watt photographs the inside of homes and schools, so this is spelled out rather than summarised. The short
        version: in On-device mode nothing leaves your device; in Enhanced mode the picture goes to a cloud model to be read,
        and the app says so before you scan.
      </PageHeader>

      <Section title="Stays on your device">
        {STAYS.map(([lead, rest]) => (
          <Item key={lead} lead={lead} rest={rest} />
        ))}
      </Section>

      <Section title="Leaves your device, and only when">
        {LEAVES.map(([lead, rest]) => (
          <Item key={lead} lead={lead} rest={rest} />
        ))}
      </Section>

      <Section title="What there is none of">
        <Item lead="No accounts, no logins, no email addresses." rest="A class session is a six-letter code that expires on its own." />
        <Item lead="No analytics or tracking scripts." rest="The app makes requests only to its own server and, in Enhanced mode, through it to the model provider." />
        <Item lead="No sale or sharing of data." rest="There is no data on a server to sell. The server keeps rate-limit counters (per network address, for a few minutes) and nothing else." />
      </Section>

      <Section title="Choosing the mode">
        <p className="text-[0.95rem] leading-relaxed text-mist">
          Tap the pill in the header. <span className="text-fog">On-device only</span> keeps every picture on your device at the cost of
          recognising fewer kinds of device. <span className="text-fog">Enhanced (cloud)</span> recognises far more and judges on, standby and
          off, and sends each picture you scan to the model. The choice is remembered on this device. When you are offline the app is
          on-device whatever you chose.
        </p>
      </Section>

      <p className="mt-12 text-[0.85rem] text-dim">
        Questions about a specific flow? The source is open:{" "}
        <Link href="/methodology" className="text-cyan underline-offset-4 hover:underline">
          the Method page
        </Link>{" "}
        names the file behind every number, and <Link href="/terms" className="text-cyan underline-offset-4 hover:underline">Terms</Link> says
        what the numbers are and are not.
      </p>
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

function Item({ lead, rest }: { lead: string; rest: string }) {
  return (
    <p className="flex gap-3 text-[0.95rem] leading-relaxed text-mist">
      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" aria-hidden />
      <span>
        <span className="font-medium text-fog">{lead}</span> {rest}
      </span>
    </p>
  );
}
