import { notFound } from "next/navigation";
import { BenchHarness } from "@/components/dev/BenchHarness";

export const metadata = { title: "Detector bench - Ghost Watt" };

/** Development only: the page that compares on-device detectors on saved frames. */
export default function BenchPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BenchHarness />;
}
