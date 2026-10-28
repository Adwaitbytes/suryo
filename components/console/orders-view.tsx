"use client";

import { Package, Undo2 } from "lucide-react";
import { useState } from "react";
import { itemLine, orderStatusMeta, returnStatusMeta } from "@/components/chat/order-meta";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/primitives";
import type { OrdersResponse } from "@/lib/console/types";
import { cn, formatInr } from "@/lib/utils";
import { ErrorNote, PageHeader, TableSkeleton, td, th } from "./bits";
import { CustomerDrawer } from "./customers-view";
import { formatDate, relativeTime, titleCase } from "./format";
import { touches, useNow, useResource } from "./hooks";
import { useConsole } from "./provider";
import { CustomerCell, Tabs, TranscriptLink } from "./records-views";

const PAYMENT_LABEL: Record<OrdersResponse["orders"][number]["paymentMethod"], string> = { upi: "UPI", card: "Card", cod: "COD" };
const OPEN_STATUSES = new Set(["placed", "packed", "shipped", "out_for_delivery", "return_requested"]);

export function OrdersView() {
  const { business } = useConsole();
  const now = useNow(30_000);
  const [tab, setTab] = useState<"orders" | "returns">("orders");
  const [customer, setCustomer] = useState<string | null>(null);
  const isStore = business?.kind === "store";
  const res = useResource<OrdersResponse>(business && isStore ? `/api/console/orders?business=${business.id}` : null, {
    refreshOn: touches(["tool.called", "conversation.updated"]),
  });
  const orders = res.data?.orders ?? [];
  const returns = res.data?.returns ?? [];
  const inFlight = orders.filter((o) => OPEN_STATUSES.has(o.status)).length;

  if (business && !isStore) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <PageHeader title="Orders" description="Orders, returns and exchanges handled by the assistant." />
        <EmptyState
          icon={<Package className="size-4" />}
          title="No orders for this business"
          body={`${business.name} books appointments rather than selling online. Switch to an online store business to see its orders.`}
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Orders"
        meta={res.data ? `${inFlight} in flight` : null}
        description="Every order the assistant can look up, track, cancel or return, with the returns it has booked."
        actions={
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "orders", label: "Orders", count: orders.length },
              { value: "returns", label: "Returns and exchanges", count: returns.length },
            ]}
          />
        }
      />
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {res.error ? <ErrorNote message={res.error} onRetry={() => void res.refresh()} /> : null}
        {res.loading || !business ? (
          <TableSkeleton cols={6} />
        ) : tab === "orders" ? (
          orders.length === 0 ? (
            <EmptyState icon={<Package className="size-4" />} title="No orders yet" body="Orders placed on the store show up here, along with every change the assistant makes to them." />
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
                <tr>
                  <th className={cn(th, "w-28")}>Order</th>
                  <th className={th}>Customer</th>
                  <th className={th}>Status</th>
                  <th className={th}>Items</th>
                  <th className={cn(th, "text-right")}>Total</th>
                  <th className={th}>Placed</th>
                  <th className={th}>Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => {
                  const meta = orderStatusMeta(o.status);
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-surface">
                      <td className={cn(td, "tabular font-mono text-xs text-fg")}>{o.orderNumber}</td>
                      <td className={td}>
                        <CustomerCell name={o.customerName} sub={o.customerPhone} onOpen={() => setCustomer(o.customerId)} />
                      </td>
                      <td className={td}>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className={cn(td, "max-w-[360px]")}>
                        <ul className="space-y-0.5">
                          {o.items.map((item, i) => (
                            <li key={`${item.name}_${i}`} className="truncate text-fg-muted">
                              {itemLine(item)}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className={cn(td, "text-right")}>
                        <div className="tabular font-medium text-fg">{formatInr(o.totalInr)}</div>
                        <div className="font-mono text-[11px] text-fg-faint">{PAYMENT_LABEL[o.paymentMethod]}</div>
                      </td>
                      <td className={cn(td, "tabular whitespace-nowrap text-xs text-fg-subtle")}>{relativeTime(o.placedAt, now)}</td>
                      <td className={cn(td, "whitespace-nowrap text-xs")}>
                        <div className="text-fg-muted">
                          {o.deliveredAt ? `Delivered ${formatDate(o.deliveredAt)}` : o.expectedDelivery && meta.step !== null ? `ETA ${formatDate(o.expectedDelivery)}` : "None"}
                        </div>
                        {o.carrier && o.trackingNumber ? (
                          <div className="font-mono text-[11px] text-fg-faint">
                            {o.carrier} {o.trackingNumber}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : returns.length === 0 ? (
          <EmptyState icon={<Undo2 className="size-4" />} title="No returns or exchanges" body="When a customer asks to return an item or swap a size, the assistant books the pickup and it lands here." />
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
              <tr>
                <th className={cn(th, "w-28")}>Order</th>
                <th className={th}>Type</th>
                <th className={th}>Customer</th>
                <th className={th}>Status</th>
                <th className={th}>Pickup</th>
                <th className={cn(th, "text-right")}>Refund</th>
                <th className={th}>Requested</th>
                <th className={th}>Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returns.map((r) => {
                const meta = returnStatusMeta(r.status);
                return (
                  <tr key={r.id} className="transition-colors hover:bg-surface">
                    <td className={cn(td, "tabular font-mono text-xs text-fg")}>{r.orderNumber}</td>
                    <td className={td}>
                      <div className="text-fg">{r.type === "exchange" ? `Exchange${r.exchangeSize ? ` to ${r.exchangeSize}` : ""}` : "Return"}</div>
                      <div className="text-2xs text-fg-subtle">{titleCase(r.reason)}</div>
                    </td>
                    <td className={td}>
                      <CustomerCell name={r.customerName} />
                    </td>
                    <td className={td}>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-xs text-fg-muted")}>{r.pickupDate ? formatDate(r.pickupDate) : "None"}</td>
                    <td className={cn(td, "tabular text-right text-fg")}>{r.type === "exchange" ? <span className="text-fg-subtle">Free swap</span> : formatInr(r.refundInr) || "Pending"}</td>
                    <td className={cn(td, "tabular whitespace-nowrap text-xs text-fg-subtle")}>{relativeTime(r.createdAt, now)}</td>
                    <td className={cn(td, "text-xs")}>
                      <TranscriptLink id={r.conversationId} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <CustomerDrawer customerId={customer} onClose={() => setCustomer(null)} />
    </div>
  );
}
