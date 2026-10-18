// Hardware drawn in CSS, so the screens stay pin-sharp at any size.
//
// Each screen is a size container and its contents are laid out in em, with the
// root font size set in cqw: a screen therefore scales as one picture, exactly the
// way a real display does, instead of reflowing like a web page.

import type { ReactNode } from "react";

export function Phone({ children, className = "", tone = "titanium" }: { children: ReactNode; className?: string; tone?: "titanium" | "dark" }) {
  const edge =
    tone === "titanium"
      ? "bg-[linear-gradient(145deg,#e6e1d8,#b9b3a8_30%,#d9d4cb_55%,#a7a196_80%,#cfc9be)]"
      : "bg-[linear-gradient(145deg,#4a4a4f,#1c1c1f_40%,#3a3a3e_70%,#202023)]";
  return (
    <div className={`relative aspect-[9/19.5] rounded-[15%/7%] p-[1.6%] device-shadow ${edge} ${className}`}>
      {/* side buttons */}
      <span className="absolute -left-[1.2%] top-[20%] h-[4%] w-[1.4%] rounded-l-sm bg-[#a9a397]" />
      <span className="absolute -left-[1.2%] top-[27%] h-[7%] w-[1.4%] rounded-l-sm bg-[#a9a397]" />
      <span className="absolute -left-[1.2%] top-[36%] h-[7%] w-[1.4%] rounded-l-sm bg-[#a9a397]" />
      <span className="absolute -right-[1.2%] top-[30%] h-[10%] w-[1.4%] rounded-r-sm bg-[#a9a397]" />
      <div className="h-full w-full rounded-[13.5%/6.3%] bg-[#0b0b0c] p-[3.2%]">
        <div className="relative h-full w-full overflow-hidden rounded-[11%/5.1%] bg-black [container-type:inline-size]">
          <div className="absolute inset-0 text-[4.1cqw]">{children}</div>
          {/* dynamic island */}
          <div className="pointer-events-none absolute left-1/2 top-[1.6%] z-30 h-[3.6%] w-[31%] -translate-x-1/2 rounded-full bg-black" />
          {/* glass */}
          <div className="pointer-events-none absolute inset-0 z-40 bg-[linear-gradient(115deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0)_38%)]" />
        </div>
      </div>
    </div>
  );
}

export function Laptop({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative mx-[5.5%] rounded-t-[2.2%/3.4%] bg-[linear-gradient(180deg,#2b2b2e,#161618)] p-[1.25%] pb-[1.6%] shadow-[0_0_0_1px_#cfc9be]">
        <div className="pointer-events-none absolute left-1/2 top-[0.55%] h-[1.2%] w-[1.2%] -translate-x-1/2 rounded-full bg-[#0c0c10] ring-1 ring-[#333]" />
        <div className="relative aspect-[16/10] overflow-hidden rounded-[0.6%] bg-white [container-type:inline-size]">
          <div className="absolute inset-0 text-[1.35cqw]">{children}</div>
          <div className="pointer-events-none absolute inset-0 z-40 bg-[linear-gradient(120deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_30%)]" />
        </div>
      </div>
      {/* the deck */}
      <div className="relative h-0 pb-[3%]">
        <div className="absolute inset-0 rounded-b-[45%_100%] bg-[linear-gradient(180deg,#e4dfd6_0%,#cbc5ba_45%,#9d978c_100%)] device-shadow" />
        <div className="absolute left-1/2 top-0 h-[38%] w-[14%] -translate-x-1/2 rounded-b-[40%] bg-[linear-gradient(180deg,#b5afa4,#d6d0c6)]" />
      </div>
    </div>
  );
}

export function Tablet({ children, className = "", landscape = true }: { children: ReactNode; className?: string; landscape?: boolean }) {
  return (
    <div
      className={`relative rounded-[4.4%/5.8%] p-[0.9%] device-shadow ${className}`}
      style={{ background: "linear-gradient(145deg,#e4dfd6,#b4aea3 40%,#d6d0c6)" }}
    >
      <div className="h-full w-full rounded-[3.8%/5%] bg-[#0b0b0c] p-[2.6%]">
        <div
          className={`relative ${landscape ? "aspect-[4/3]" : "aspect-[3/4]"} overflow-hidden rounded-[1.6%/2.1%] bg-white [container-type:inline-size]`}
        >
          <div className="absolute inset-0 text-[1.9cqw]">{children}</div>
          <div className="pointer-events-none absolute inset-0 z-40 bg-[linear-gradient(120deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_34%)]" />
        </div>
      </div>
    </div>
  );
}
