import { Scanner } from "@/components/Scanner";

export const metadata = {
  title: "Scanner - Ghost Watt",
  description:
    "Upload photos of an empty room or building and get a ranked, costed list of phantom-load offenders.",
};

export default function ScanPage() {
  return <Scanner />;
}
