import type { Metadata } from "next";
import { EscalationsView } from "@/components/console/escalations-view";

export const metadata: Metadata = { title: "Escalations" };

export default function Page() {
  return <EscalationsView />;
}
