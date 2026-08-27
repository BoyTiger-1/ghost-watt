import type { Metadata } from "next";
import { Portfolio } from "@/components/Portfolio";

export const metadata: Metadata = {
  title: "Portfolio - Ghost Watt",
  description:
    "Track buildings over time: saved audits, installed fixes, and a device-by-device before-and-after that shows whether the phantom load actually went away.",
};

export default function PortfolioPage() {
  return <Portfolio />;
}
