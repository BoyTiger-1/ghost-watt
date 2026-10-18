import { ClassMode } from "@/components/ClassMode";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "Class mode - Ghost Watt",
  description:
    "One building, many phones. Open a session, hand out the code, and watch a whole school's phantom load merge into one ranked map.",
};

export default function ClassPage() {
  return (
    <section className="@container relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-6 sm:pt-32">
      <PageHeader eyebrow="Class mode" title="Thirty phones." accent="One map." className="mb-10">
        Open a session, read out the code, and every scan merges here as it arrives.{" "}
        <span className="hidden sm:inline">
          Alone, a high school is a weekend. A class taking one corridor each is a lunch period.
        </span>
      </PageHeader>
      <ClassMode />
    </section>
  );
}
