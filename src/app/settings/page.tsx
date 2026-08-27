import type { Metadata } from "next";
import { SettingsPanel } from "@/components/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings - Ghost Watt",
  description:
    "Which data providers are live, what each optional API key would buy, building defaults, and backup of the audit history stored in this browser.",
};

export default function SettingsPage() {
  return <SettingsPanel />;
}
