import type { Metadata } from "next";
import { BookingsView } from "@/components/console/records-views";

export const metadata: Metadata = { title: "Bookings" };

export default function Page() {
  return <BookingsView />;
}
