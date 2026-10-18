import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

// The landing page has its own type: an editorial serif for the voice, a quiet
// grotesk for the reading, and a mono only where figures need to line up.
export const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
