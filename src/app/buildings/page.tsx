import { Buildings } from "@/components/Buildings";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "Buildings - Ghost Watt",
  description:
    "Every room you scan rolls up into a building total, with the rooms ranked by what they waste after hours.",
};

export default function BuildingsPage() {
  return (
    <section className="@container relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-6 sm:pt-32">
      <PageHeader eyebrow="Buildings" title="Rooms add up." accent="Which one is the problem?" className="mb-10">
        Each room you scan is saved here. Together they make a building total and a ranking of where the after-hours waste is.{" "}
        <span className="hidden sm:inline">Scan with a class and every phone fills in a room.</span>
      </PageHeader>
      <Buildings />
    </section>
  );
}
