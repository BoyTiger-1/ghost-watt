import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalTable, type LegalSection } from "@/components/Legal";

export const metadata: Metadata = {
  title: "Privacy Policy - Ghost Watt",
  description: "What Ghost Watt collects, what stays on your device, what is sent to third-party services and why, and the choices you have.",
};

const EFFECTIVE = "October 19, 2026";
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
            ["Approximate location", "Only if you allow it, or a photo you add contains it", "Rounded to about 1 km on our server, then used to look up your utility rate, place name, weather and solar resource."],
            ["Room names and device rows", "Only if you join a class session", "Stored on our session store for up to 14 days so classmates' phones can add up one building."],
            ["Technical data (IP address, browser type, request time)", "With every request, as with any website", "Processed by our hosting provider and used by our server for rate limiting (Section 6)."],
          ]}
        />
        <p>We do not ask for, and the Service has no field for, your name, email address, phone number, age or school.</p>
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
          our server, which forwards it to one vision model provider to identify the devices in it. Our server does not store the picture or write it to
          any log; it holds it in memory only for the duration of the request. The provider&apos;s own policies govern how it handles the request while
          processing it (Section 4).
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
            ["Google (Gemini API), Groq, Mistral AI, Anthropic, OpenAI, OpenRouter", "Reading photos in Enhanced mode; only one provider is used per request, in a fixed order of preference", "The picture, a text prompt, and context you supplied (time taken, place name, any note you typed)"],
            ["U.S. Energy Information Administration (EIA)", "Current electricity prices and grid carbon intensity", "A state code"],
            ["National Laboratory of the Rockies (NREL) / OpenEI", "Your utility's published rate", "Rounded coordinates"],
            ["OpenStreetMap Nominatim", "Place name for a location", "Rounded coordinates"],
            ["OpenWeather", "Outdoor conditions for heating and cooling findings", "Rounded coordinates"],
            ["Upstash", "Class session storage", "Session code, room names and device rows"],
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
          <span className="font-medium text-fog">On our server.</span> Pictures are not stored. Class sessions expire automatically after 14 days. Rate-limit
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
    title: "Children and schools",
    body: (
      <>
        <p>
          The Service is intended for use by students under the supervision of a teacher or parent, and by adults. It does not knowingly collect personal
          information from anyone, including children under 13, and it does not require or ask for any. Students should photograph only spaces they are
          permitted to photograph and should avoid capturing people. The live camera does not track or identify people.
        </p>
        <p>
          Schools using the Service with students should choose On-device mode if their policies do not allow images to be processed by third-party services.
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
        <li>Do not join class sessions if you do not want room names stored for 14 days.</li>
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
          mode no picture leaves your device. In Enhanced (cloud) mode each picture you scan is sent to one vision model provider to be read and is not stored
          by us.
        </>
      }
      sections={sections}
    />
  );
}
