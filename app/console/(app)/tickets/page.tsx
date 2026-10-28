import type { Metadata } from "next";
import { TicketsView } from "@/components/console/records-views";

export const metadata: Metadata = { title: "Tickets" };

export default function Page() {
  return <TicketsView />;
}
