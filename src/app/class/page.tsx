import { ClassMode } from "@/components/ClassMode";

export const metadata = {
  title: "Class mode - Ghost Watt",
  description:
    "One building, many phones. Open a session, hand out the code, and watch a whole school's phantom load merge into one ranked map.",
};

export default function ClassPage() {
  return (
    <section className="@container relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 grad-energy-bg" />
          <span className="mono-label text-cyan">crowdsourced audit</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-fog sm:text-4xl">
          One building, thirty phones, one map.
        </h1>
        <p className="mt-3 max-w-2xl text-mist">
          Auditing a high school alone is a weekend. A class taking one corridor each is a lunch
          period. Open a session, read the code out, and every scan merges here as it arrives.
        </p>
      </div>
      <ClassMode />
    </section>
  );
}
