import { Places } from "@/components/Places";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "My places - Ghost Watt",
  description: "Every room you scan, grouped by place: which room wastes the most, one to-do list of fixes, and a re-scan that checks they worked.",
};

export default function PlacesPage() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-6 sm:pt-32">
      <PageHeader eyebrow="My places" title="Every room you've scanned." accent="One plan to fix them." className="mb-10">
        Your home, a school, an office: each room you scan is saved to a place. See which room wastes the most, tick off fixes as you do them, and scan again
        to check they worked.
      </PageHeader>
      <Places />
    </section>
  );
}
