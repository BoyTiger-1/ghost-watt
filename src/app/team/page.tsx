import { TeamScan } from "@/components/TeamScan";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "Team scan - Ghost Watt",
  description: "Scan a big place together: everyone scans their own rooms on their own phone, and the totals add up live.",
};

export default function TeamPage() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-6 sm:pt-32">
      <PageHeader eyebrow="Team scan" title="Too big to scan alone?" accent="Split it up." className="mb-10">
        Start a team, send the link, and everyone scans the rooms they&apos;re in. The whole place adds up here, live. No accounts, and photos never leave
        anyone&apos;s phone.
      </PageHeader>
      <TeamScan />
    </section>
  );
}
