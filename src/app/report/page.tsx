import type { Metadata } from "next";
import { ReportBrief } from "@/components/ReportBrief";

export const metadata: Metadata = {
  title: "Brief - Ghost Watt",
  description:
    "A one-page energy waste brief for the person who signs the purchase order: the ask, what it costs, what it saves, and every assumption behind the number.",
};

export default function ReportPage() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-14 pt-24 sm:px-6 sm:pt-28">
      <div className="no-print mb-8 space-y-3">
        <span className="mono-label text-cyan">brief</span>
        <h1 className="text-3xl font-semibold tracking-tight text-fog sm:text-4xl">
          Something to hand to someone
        </h1>
        <p className="max-w-[62ch] leading-relaxed text-mist">
          An audit that stays in a browser tab changes nothing. This turns a saved
          audit into one page for the person who can actually authorise the fix:
          what can be done for free this week, what needs equipment, and what the
          number is not.
        </p>
      </div>
      <ReportBrief />
    </section>
  );
}
