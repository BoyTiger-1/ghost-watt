import type { Metadata } from "next";
import { AboutView } from "@/components/about/AboutView";

export const metadata: Metadata = {
  title: "About - Ghost Watt",
  description:
    "Why Ghost Watt exists and how it works: the after-hours energy map nobody has, built so students can hand facilities a prioritized fix list they can act on Monday.",
};

export default function AboutPage() {
  return <AboutView />;
}
