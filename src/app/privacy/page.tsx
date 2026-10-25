import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalTable, type LegalSection } from "@/components/Legal";

export const metadata: Metadata = {
  title: "Privacy Policy - Ghost Watt",
  description: "What Ghost Watt collects, what stays on your device, what is sent to third-party services and why, and the choices you have.",
};

const EFFECTIVE = "October 25, 2026";
const ISSUES = "https://github.com/BoyTiger-1/ghost-watt/issues";

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "Who we are and what this covers",
    body: (
      <>
        <p>
          Ghost Watt (&ldquo;Ghost Watt&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a free, open-source web application that estimates the electricity used
          by devices in photographs of rooms. This Privacy Policy explains what information the application handles when you use the website and
          its installable version (together, the &ldquo;Service&rdquo;), where that information goes, and the choices you have.
        </p>
        <p>
          The Service is designed so that it does not need to know who you are. There are no accounts, no sign-in, and no advertising.
        </p>
      </>
    ),
  },
  {
    id: "collect",
    title: "Information the Service handles",
    body: (
      <>
        <p>The Service handles only the following categories of information, and only when you use the feature concerned.</p>
        <LegalTable
          head={["Information", "When", "Where it goes"]}
          rows={[
            ["Photos, video frames and live camera frames", "When you scan", "Processed in your browser. In Enhanced (cloud) mode only, also sent to a vision model provider (Section 4)."],
            ["A photo of an electricity bill", "Only if you choose to read one, in Enhanced mode", "Sent to a vision model provider to read the printed figures; you confirm the figures before they are kept."],
            ["Scan results, rooms, buildings, fixes, bill figures, meter readings and settings", "As you use the Service", "Stored only in your browser's local storage on your device."],
            ["The name of a school you search for", "Only when you use the 3D school", "Sent through our server to OpenStreetMap's Nominatim to find it; its location is then used to look up building outlines (Overpass). Not stored by us."],
            ["Floor plan photos and the rooms you draw on them", "Only when you add them to the 3D school", "Stored only in your browser. A plan is sent to a vision model provider only if you choose \"Suggest rooms with AI\"."],
            ["Approximate location", "Only if you allow it, or a photo you add contains it", "Rounded to about 1 km on our server, then used to look up your utility rate, place name, weather and solar resource."],
            ["Room names, device rows and the display name you type", "Only if you send a scan to a team", "Shared with everyone who has that team's code, so their phones can add up one building. Kept up to 14 days (Upstash) or, on a site without it, about 12 hours on an encrypted public relay (Section 4)."],
            ["Scan figures (device types, counts, costs and fixes) and any question you type", "Only when Ghosty Insights runs on a scan", "Sent to one AI model provider to write the insights. No picture is sent."],
            ["ZIP code, and an income range and household size only if you choose one", "Only when you look up rebates for a home scan", "Sent to Rewiring America to find programs that apply. Not stored by us; the income range is optional."],
            ["A room's top devices and costs, inside a sticker's QR code", "Only if you print room stickers", "Carried in the link itself. Anyone who scans the sticker can read it; opening the link sends none of it to our server."],
            ["Technical data (IP address, browser type, request time)", "With every request, as with any website", "Processed by our hosting provider and used by our server for rate limiting (Section 6)."],
          ]}
        />
        <p>We do not ask for your email address, phone number or age. The only name field is the optional display name shown to your team when you send it a scan; any nickname works.</p>
      </>
    ),
  },
  {
    id: "modes",
    title: "On-device mode and Enhanced (cloud) mode",
    body: (
      <>
        <p>
          The indicator in the header always shows which mode a scan will use. You can change it at any time by selecting the indicator.
        </p>
        <p>
          <span className="font-medium text-fog">On-device mode.</span> Pictures are analysed by a detector that runs inside your browser. No picture is
          uploaded to us or to anyone else. This is also the mode used automatically when you are offline or when no cloud provider is configured.
        </p>
        <p>
          <span className="font-medium text-fog">Enhanced (cloud) mode.</span> Each picture you scan is downscaled and sent over an encrypted connection to
          our server, which forwards it to a vision model provider to identify the devices in it. If that provider is busy or does not answer, the same
          picture is sent to the next one; if none can answer, the picture is read in your browser instead. Our server does not store the picture or write
          it to any log; it holds it in memory only for the duration of the request. The provider&apos;s own policies govern how it handles the request
          while processing it (Section 4).
        </p>
      </>
    ),
  },
  {
    id: "processors",
    title: "Third-party services",
    body: (
      <>
        <p>
          Depending on how the Service is configured and which features you use, requests may be sent to the providers below. We send each provider only
          what that feature needs. We do not sell or share information with any provider for advertising.
        </p>
        <LegalTable
          head={["Provider", "Purpose", "What it receives"]}
          rows={[
            ["Google (Gemini API), Groq, Mistral AI, Anthropic, OpenAI, OpenRouter", "Reading photos and floor plans in Enhanced mode, and writing Ghosty Insights. Providers are tried in a fixed order of preference: if one is busy or does not answer, the same request goes to the next, and to keep the live camera quick a held-still frame may go to two at once", "For a photo: the picture, a text prompt, and context you supplied (time taken, place name, any note you typed). For a floor plan: the plan image. For Ghosty: the scan's figures and your question, never a picture"],
            ["Ollama (only if you run the Service yourself with it)", "Reading photos with a model on your own machine", "The picture, which stays on that machine"],
            ["Google (model download)", "Downloading the on-device detector's model files the first time it runs", "A standard file request, including your IP address. No picture or result is sent; the files are then cached by your browser"],
            ["U.S. Energy Information Administration (EIA)", "Current electricity prices and grid carbon intensity", "A state code"],
            ["National Laboratory of the Rockies (NREL) / OpenEI", "Your utility's published rate", "Rounded coordinates"],
            ["OpenStreetMap (Nominatim and Overpass)", "Place name for a location, finding a school by name, and building outlines for the 3D school", "Rounded coordinates, or the school name you typed; requests go through our server, not from your browser"],
            ["NREL PVWatts and Open-Meteo", "Solar estimates", "Rounded coordinates"],
            ["Electricity Maps (only when configured)", "Live grid carbon intensity", "A grid zone"],
            ["OpenWeather", "Outdoor conditions for heating and cooling findings", "Rounded coordinates"],
            ["Upstash", "Team scan storage, when configured", "Team code, room names, display names and device rows"],
            ["Rewiring America", "Household rebate lookups", "ZIP code, the kinds of upgrade, and an income range and household size if you chose them"],
            ["ntfy.sh", "Team scan relay, on a site without Upstash", "End-to-end encrypted messages under a topic derived from the team code; without the code they cannot be read"],
            ["Vercel", "Hosting the website and server", "Standard request data, including IP address"],
          ]}
        />
        <p>
          Each provider processes information under its own privacy policy and terms. Some providers may retain request data for a limited period for abuse
          monitoring, and some free tiers may use submitted content to improve their services. If that matters to you, use On-device mode.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How information is used",
    body: (
      <>
        <p>Information is used only to provide the feature you asked for: to identify devices, estimate their energy use and cost, look up prices and grid factors, show results, and keep the Service available and secure.</p>
        <p>We do not use information for advertising, profiling, or automated decisions about you, and we do not sell personal information.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Storage and retention",
    body: (
      <>
        <p>
          <span className="font-medium text-fog">On your device.</span> Results and settings stay in your browser until you delete them. You can erase all of
          it under Settings → Your data → Erase everything, or by clearing this site&apos;s data in your browser. Export backup creates a file you control.
        </p>
        <p>
          <span className="font-medium text-fog">On our server.</span> Pictures are not stored. Teams expire automatically: after 14 days in Upstash, or after about 12 hours on the relay. Rate-limit
          counters, keyed to a network address, are kept for minutes to a day and then discarded.
        </p>
        <p>
          <span className="font-medium text-fog">With our hosting provider.</span> Vercel may keep standard request logs for a short period under its own policy.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children and organisations",
    body: (
      <>
        <p>
          The Service is intended for use by adults, and by children under the supervision of a parent, teacher or other responsible adult. It does not knowingly collect personal
          information from anyone, including children under 13, and it does not require or ask for any. Everyone should photograph only spaces they are
          permitted to photograph and should avoid capturing people. The live camera does not track or identify people.
        </p>
        <p>
          Households, offices, schools and any other organisation should choose On-device mode if their policies do not allow images to be processed by third-party services.
        </p>
      </>
    ),
  },
  {
    id: "choices",
    title: "Your choices",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Use On-device mode so no picture leaves your device.</li>
        <li>Decline location access; the Service then uses state-average prices instead.</li>
        <li>Skip &ldquo;Suggest rooms with AI&rdquo; on a floor plan; drawing rooms yourself keeps the plan in your browser.</li>
        <li>Do not send scans to a team if you do not want room names shared with the people who have its code.</li>
        <li>Erase everything stored in your browser at any time from Settings.</li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        All traffic to the Service uses HTTPS. API keys for third-party services are held on the server and never sent to your browser. No method of
        transmission or storage is completely secure, and we cannot guarantee absolute security.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as the Service changes. The date at the top shows when it was last updated. Material changes will be noted on this page.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions or requests about privacy can be raised through the project&apos;s{" "}
        <a href={ISSUES} className="text-cyan underline-offset-4 hover:underline">
          GitHub issue tracker
        </a>
        . Please do not include personal information in a public issue. See also the{" "}
        <Link href="/terms" className="text-cyan underline-offset-4 hover:underline">
          Terms of Service
        </Link>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      kind="Legal"
      title="Privacy Policy"
      effective={EFFECTIVE}
      other={{ href: "/terms", label: "Terms of Service" }}
      summary={
        <>
          <span className="font-medium text-fog">In short:</span> no accounts, no tracking, no advertising. Your results stay in your browser. In On-device
          mode no picture leaves your device. In Enhanced (cloud) mode each picture you scan is sent to a vision model provider to be read, and is not stored
          by us.
        </>
      }
      sections={sections}
    />
  );
}
