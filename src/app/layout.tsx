import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ServiceWorker } from "@/components/ServiceWorker";
import { MotionProvider } from "@/components/MotionProvider";
import { geist, geistMono, instrument } from "@/components/home/fonts";
import { APPLY_PREFS_SCRIPT } from "@/lib/prefs-boot";
import { SkipLink } from "@/components/SkipLink";

export const metadata: Metadata = {
  title: "Ghost Watt - the after-hours energy map nobody has",
  description:
    "Crowdsource a photo-audit of your school after hours. A local vision model spots what's left running; Ghost Watt ranks the biggest phantom-load offenders by dollars and CO₂, with a one-tap fix for each.",
  applicationName: "Ghost Watt",
  keywords: ["energy audit", "phantom load", "schools", "sustainability", "CO2", "vision model"],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Ghost Watt",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f2eb" },
    { media: "(prefers-color-scheme: dark)", color: "#151514" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`} suppressHydrationWarning>
      <head>
        {/* Theme, text size and the other display preferences, applied before first paint so nothing flashes. */}
        <script dangerouslySetInnerHTML={{ __html: APPLY_PREFS_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <MotionProvider>
          <SkipLink />
          <Nav />
          <main id="main" className="relative">
            {children}
          </main>
          <Footer />
          <ServiceWorker />
        </MotionProvider>
      </body>
    </html>
  );
}
