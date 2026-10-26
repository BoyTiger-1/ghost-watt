import { CampusView } from "@/components/campus/CampusView";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "3D building - Ghost Watt",
  description: "The whole building in 3D: its real outline, its floor plans, and every scanned room coloured by what sits idle after hours.",
};

export default function CampusPage() {
  return (
    <section className="relative z-10 mx-auto max-w-[84rem] px-5 pb-16 pt-24 sm:px-6 sm:pt-32">
      <PageHeader eyebrow="3D school" title="The whole building," accent="lit up by its idle cost." className="mb-8">
        Your building&apos;s real shape, its floor plans, and every scanned room coloured from cool to hot by what sits idle after hours.
      </PageHeader>
      <CampusView />
    </section>
  );
}
