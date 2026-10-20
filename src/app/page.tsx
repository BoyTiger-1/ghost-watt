import { ImpactSection } from "@/components/home/ImpactSection";
import { HomeHero } from "@/components/home/HomeHero";
import { Manifesto } from "@/components/home/Manifesto";
import { SeeSection } from "@/components/home/SeeSection";
import { CountSection } from "@/components/home/CountSection";
import { EverywhereSection } from "@/components/home/EverywhereSection";
import { ClassSection } from "@/components/home/ClassSection";
import { MethodSection } from "@/components/home/MethodSection";
import { TrustSection } from "@/components/home/TrustSection";
import { LightsOut } from "@/components/home/LightsOut";
import { HomeFooter } from "@/components/home/HomeFooter";

export default function Home() {
  return (
    <div className="home bg-paper text-graphite">
      <HomeHero />
      <Manifesto />
      <ImpactSection />
      <SeeSection />
      <CountSection />
      <EverywhereSection />
      <ClassSection />
      <MethodSection />
      <TrustSection />
      <LightsOut />
      <HomeFooter />
    </div>
  );
}
