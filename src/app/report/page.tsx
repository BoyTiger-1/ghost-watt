import type { Metadata } from "next";
import { ReportBrief } from "@/components/ReportBrief";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Brief - Ghost Watt",
  description:
    "A one-page energy waste brief for the person who signs the purchase order: the ask, what it costs, what it saves, and every assumption behind the number.",
};

export default function ReportPage() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-14 pt-24 sm:px-6 sm:pt-32">
      <div className="no-print mb-10">
        <PageHeader eyebrow="Brief" title="Something to hand" accent="to someone.">
          One page for the person who can authorise the fix.{" "}
          <span className="hidden sm:inline">
            What can be done for free this week, what needs equipment, and what the number is not.
          </span>
        </PageHeader>
      </div>
      <ReportBrief />
    </section>
  );
}
