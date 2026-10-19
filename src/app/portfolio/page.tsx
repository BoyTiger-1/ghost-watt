import { redirect } from "next/navigation";

// Rooms and buildings are one page now: My places.
export default function PortfolioPage() {
  redirect("/places");
}
