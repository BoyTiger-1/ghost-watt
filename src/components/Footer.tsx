"use client";

import { usePathname } from "next/navigation";
import { HomeFooter } from "./home/HomeFooter";

export function Footer() {
  // The landing page renders its own footer.
  if (usePathname() === "/") return null;

  return (
    <div className="site-footer mt-16 border-t border-line">
      {/* On a phone the tab bar already carries the navigation; the footer would
          only repeat it, so it shrinks to the one line that matters. */}
      <div className="hidden md:block">
        <HomeFooter />
      </div>
      <p className="px-5 pb-6 pt-6 text-center text-[0.8rem] leading-relaxed text-dim md:hidden">
        Estimates, not meter readings.
        <br />
        The ranking is the deliverable.
      </p>
    </div>
  );
}
