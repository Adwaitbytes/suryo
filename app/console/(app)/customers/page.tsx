import type { Metadata } from "next";
import { CustomersView } from "@/components/console/customers-view";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return <CustomersView />;
}
