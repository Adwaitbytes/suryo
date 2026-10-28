import type { Metadata } from "next";
import { OrdersView } from "@/components/console/orders-view";

export const metadata: Metadata = { title: "Orders" };

export default function Page() {
  return <OrdersView />;
}
