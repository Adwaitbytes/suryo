import type { Tone } from "@/components/ui/badge";
import type { Card } from "@/lib/contracts";

/** The happy path an order walks; anything else is an end state shown instead of the stepper. */
export const ORDER_STEPS = [
  { status: "placed", label: "Placed" },
  { status: "packed", label: "Packed" },
  { status: "shipped", label: "Shipped" },
  { status: "out_for_delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
] as const;

const END_STATES: Record<string, { label: string; tone: Tone }> = {
  cancelled: { label: "Cancelled", tone: "neutral" },
  return_requested: { label: "Return requested", tone: "warning" },
  returned: { label: "Returned", tone: "info" },
  refunded: { label: "Refunded", tone: "info" },
};

export type OrderStatusMeta = { label: string; tone: Tone; step: number | null };

/** step is the index into ORDER_STEPS, or null for end states. */
export function orderStatusMeta(status: string): OrderStatusMeta {
  const step = ORDER_STEPS.findIndex((s) => s.status === status);
  if (step !== -1) {
    const label = ORDER_STEPS[step].label;
    return { label, tone: status === "delivered" ? "success" : status === "placed" ? "neutral" : "accent", step };
  }
  const end = END_STATES[status];
  return end ? { ...end, step: null } : { label: humanize(status), tone: "neutral", step: null };
}

const RETURN_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Requested", tone: "warning" },
  pickup_scheduled: { label: "Pickup scheduled", tone: "accent" },
  received: { label: "Received", tone: "info" },
  refunded: { label: "Refunded", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export function returnStatusMeta(status: string): { label: string; tone: Tone } {
  return RETURN_STATUS[status] ?? { label: humanize(status), tone: "neutral" };
}

export function itemLine(item: { name: string; size: string | null; quantity: number }): string {
  const size = item.size && item.size !== "Free" ? `, size ${item.size}` : "";
  return `${item.name}${size}${item.quantity > 1 ? `, qty ${item.quantity}` : ""}`;
}

function humanize(s: string): string {
  const words = s.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A turn that looks an order up and then tracks it yields two cards for one order; only the latest is worth showing. */
export function distinctCards(cards: Card[]): Card[] {
  const key = (card: Card) => (card.kind === "order" || card.kind === "return" ? `${card.kind}:${card.orderNumber}` : null);
  return cards.filter((card, i) => {
    const k = key(card);
    return k === null || !cards.slice(i + 1).some((later) => key(later) === k);
  });
}
