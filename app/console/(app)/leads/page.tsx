import type { Metadata } from "next";
import { LeadsView } from "@/components/console/records-views";

export const metadata: Metadata = { title: "Leads" };

export default function Page() {
  return <LeadsView />;
}
