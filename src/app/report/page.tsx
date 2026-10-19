import { redirect } from "next/navigation";

// The brief is a tab of the scanner now, where it can preview the scan just
// made. Old links and bookmarks land there.
export default function ReportPage() {
  redirect("/scan?view=report");
}
