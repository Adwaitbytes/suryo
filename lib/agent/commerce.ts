import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { Card } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import type { OrderStatus } from "@/lib/db/schema";
import { emit } from "@/lib/events";
import { emailHtml, sendEmail } from "@/lib/notify/email";
import { RESERVED_EMAIL } from "@/lib/notify/suppress";
import { formatSlot } from "@/lib/time";
import type { ActionContext, ActionResult } from "./actions";

/**
 * Order tools for businesses of kind "store". Store policy (cancellation window,
 * return window, final sale, fees) is enforced here in code, never left to the model.
 */
export const STORE_POLICY = {
  returnWindowDays: 15,
  returnPickupFeeInr: 99,
  cancellableStatuses: ["placed", "packed"] as OrderStatus[],
  feeWaivedReasons: ["damaged", "wrong_item", "defective"],
} as const;

export class CommerceError extends Error {}

const confirmed = z
  .literal(true)
  .describe("Only true after you read the details back and the customer explicitly said yes");
const orderNumber = z
  .string()
  .min(4)
  .transform((v) => v.trim().toUpperCase().replace(/\s+/g, ""))
  .describe("Order number as the customer says it, for example KT-48213");
const verifyPhone = z
  .string()
  .min(4)
  .describe("Phone number on the order (full number or at least the last 4 digits), to verify the customer before changing anything");

export const commerceSchemas = {
  lookup_order: z.object({
    orderNumber: orderNumber.optional(),
    phone: z.string().optional().describe("Customer phone to list their recent orders"),
    email: z.string().optional(),
  }),
  track_order: z.object({ orderNumber }),
  cancel_order: z.object({
    orderNumber,
    phone: verifyPhone,
    reason: z.string().min(2),
    confirmedByCustomer: confirmed,
  }),
  request_return: z.object({
    orderNumber,
    phone: verifyPhone,
    type: z.enum(["return", "exchange"]),
    reason: z.enum(["size_issue", "changed_mind", "damaged", "wrong_item", "defective", "quality", "other"]),
    itemName: z.string().optional().describe("Which item, if the order has several"),
    exchangeSize: z.string().optional().describe("New size, required for exchanges"),
    confirmedByCustomer: confirmed,
  }),
  refund_status: z.object({ orderNumber }),
} as const;

export type CommerceActionName = keyof typeof commerceSchemas;

export const COMMERCE_LABELS: Record<CommerceActionName, string> = {
  lookup_order: "Looking up order",
  track_order: "Tracking shipment",
  cancel_order: "Cancelling order",
  request_return: "Starting return",
  refund_status: "Checking refund",
};

export const COMMERCE_DESCRIPTIONS: Record<CommerceActionName, string> = {
  lookup_order:
    "Find an order by order number, or list a customer's recent orders by phone or email. Returns status, items and what the customer is eligible for (cancel, return, exchange). Call this before answering anything about a specific order.",
  track_order: "Get the shipment status, carrier, tracking number and expected delivery for an order.",
  cancel_order:
    "Cancel an order that has not shipped yet. Needs the phone on the order for verification and an explicit yes after reading back the order and refund.",
  request_return:
    "Start a return or size exchange for a delivered order inside the return window. Needs the phone on the order and an explicit yes after reading back item, type, refund amount and pickup.",
  refund_status: "Check the status of a return, exchange or refund for an order.",
};

type Handlers = {
  [K in CommerceActionName]: (ctx: ActionContext, input: z.output<(typeof commerceSchemas)[K]>) => Promise<ActionResult>;
};

type OrderRow = typeof schema.orders.$inferSelect;
type ItemRow = typeof schema.orderItems.$inferSelect;

export const commerceHandlers: Handlers = {
  async lookup_order(ctx, { orderNumber: number, phone, email }) {
    const businessId = ctx.bundle.business.id;
    let rows: OrderRow[] = [];
    if (number) {
      const order = await db.query.orders.findFirst({
        where: and(eq(schema.orders.businessId, businessId), eq(schema.orders.orderNumber, number)),
      });
      rows = order ? [order] : [];
    } else {
      const digits = phone?.replace(/\D/g, "").slice(-10);
      const mail = email?.trim().toLowerCase();
      if (!digits && !mail) throw new CommerceError("need_order_number_or_phone");
      const conds = [digits ? eq(schema.customers.phone, digits) : undefined, mail ? eq(schema.customers.email, mail) : undefined].filter(
        (c): c is NonNullable<typeof c> => Boolean(c),
      );
      const customer = await db.query.customers.findFirst({ where: and(eq(schema.customers.businessId, businessId), or(...conds)) });
      if (customer) {
        await linkCustomer(ctx, customer.id);
        rows = await db
          .select()
          .from(schema.orders)
          .where(and(eq(schema.orders.businessId, businessId), eq(schema.orders.customerId, customer.id)))
          .orderBy(desc(schema.orders.placedAt))
          .limit(5);
      }
    }
    if (rows.length === 0) return { ok: true, data: { found: false, hint: "Ask the customer to check the order number in their confirmation email or SMS." } };
    const items = await itemsFor(rows.map((r) => r.id));
    const summaries = rows.map((o) => summarize(o, items.filter((i) => i.orderId === o.id)));
    return { ok: true, data: { found: true, orders: summaries }, cards: rows.map((o) => orderCard(o, items.filter((i) => i.orderId === o.id))) };
  },

  async track_order(ctx, { orderNumber: number }) {
    const order = await findOrder(ctx, number);
    const items = await itemsFor([order.id]);
    const timeline = [
      `Placed ${formatSlot(order.placedAt)}`,
      ...(["packed", "shipped", "out_for_delivery", "delivered"].includes(order.status) ? ["Packed"] : []),
      ...(["shipped", "out_for_delivery", "delivered"].includes(order.status) ? [`Shipped with ${order.carrier ?? "courier"}`] : []),
      ...(["out_for_delivery", "delivered"].includes(order.status) ? ["Out for delivery"] : []),
      ...(order.deliveredAt ? [`Delivered ${formatSlot(order.deliveredAt)}`] : []),
    ];
    return {
      ok: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        expectedDelivery: order.expectedDelivery ? formatSlot(order.expectedDelivery) : null,
        deliveredAt: order.deliveredAt ? formatSlot(order.deliveredAt) : null,
        timeline,
      },
      cards: [orderCard(order, items)],
    };
  },

  async cancel_order(ctx, { orderNumber: number, phone, reason }) {
    const order = await findOrder(ctx, number);
    await verify(order, phone);
    if (!STORE_POLICY.cancellableStatuses.includes(order.status)) {
      throw new CommerceError(
        `not_cancellable: order is ${order.status}. Orders can only be cancelled before they ship. If it has shipped, the customer can refuse delivery or request a return after it arrives.`,
      );
    }
    const [updated] = await db
      .update(schema.orders)
      .set({ status: "cancelled", cancelledAt: new Date(), conversationId: ctx.conversationId })
      .where(and(eq(schema.orders.id, order.id), inArray(schema.orders.status, STORE_POLICY.cancellableStatuses)))
      .returning();
    if (!updated) throw new CommerceError("not_cancellable: the order status just changed. Look it up again.");
    await linkCustomer(ctx, order.customerId);
    const refund =
      order.paymentMethod === "cod"
        ? "No payment was taken (cash on delivery), so nothing to refund."
        : `Full refund of INR ${order.totalInr.toLocaleString("en-IN")} to the original ${order.paymentMethod === "upi" ? "UPI account" : "card"} within 5 to 7 business days.`;
    const items = await itemsFor([order.id]);
    const cards: Card[] = [orderCard(updated, items)];
    cards.push(
      await notify(ctx, order, `Order ${order.orderNumber} cancelled`, "Your order is cancelled", [
        ["Order", order.orderNumber],
        ["Items", items.map((i) => `${i.name}${i.size ? ` (${i.size})` : ""}`).join(", ")],
        ["Refund", refund],
      ], `Reason noted: ${reason}.`),
    );
    await emit("conversation.updated", { businessId: ctx.bundle.business.id, conversationId: ctx.conversationId }, { order: order.orderNumber, status: "cancelled" });
    return { ok: true, data: { cancelled: true, orderNumber: order.orderNumber, refund, confirmationEmail: emailStatus(cards) }, cards };
  },

  async request_return(ctx, input) {
    const order = await findOrder(ctx, input.orderNumber);
    await verify(order, input.phone);
    const eligibility = returnEligibility(order, await itemsFor([order.id]));
    if (!eligibility.eligible) throw new CommerceError(`not_eligible: ${eligibility.reason}`);
    const items = await itemsFor([order.id]);
    const returnable = items.filter((i) => !i.finalSale);
    const item = input.itemName
      ? returnable.find((i) => i.name.toLowerCase().includes(input.itemName!.toLowerCase()))
      : returnable.length === 1
        ? returnable[0]
        : undefined;
    if (!item) {
      throw new CommerceError(
        `which_item: ask which item. Returnable items: ${returnable.map((i) => `${i.name}${i.size ? ` (${i.size})` : ""}`).join(", ")}. Final sale items cannot be returned.`,
      );
    }
    if (input.type === "exchange" && !input.exchangeSize) throw new CommerceError("need_exchange_size");
    if (input.type === "exchange" && item.productId) {
      const product = await db.query.products.findFirst({ where: eq(schema.products.id, item.productId) });
      if (product && !product.sizes.includes(input.exchangeSize ?? "")) {
        throw new CommerceError(`size_unavailable: ${item.name} comes in ${product.sizes.join(", ")}.`);
      }
    }
    const feeWaived = (STORE_POLICY.feeWaivedReasons as readonly string[]).includes(input.reason);
    const refundInr =
      input.type === "exchange" ? 0 : item.priceInr * item.quantity - (feeWaived ? 0 : STORE_POLICY.returnPickupFeeInr);
    const pickupDate = nextBusinessDay(new Date(), 1);
    let created;
    try {
      [created] = await db
        .insert(schema.returns)
        .values({
          businessId: ctx.bundle.business.id,
          orderId: order.id,
          conversationId: ctx.conversationId,
          type: input.type,
          reason: input.itemName ? `${input.reason}: ${input.itemName}` : input.reason,
          exchangeSize: input.exchangeSize ?? null,
          status: "pickup_scheduled",
          refundInr: input.type === "return" ? refundInr : null,
          refundMethod: input.type === "return" ? (order.paymentMethod === "cod" ? "UPI or bank transfer" : `original ${order.paymentMethod}`) : null,
          pickupDate,
        })
        .returning();
    } catch {
      throw new CommerceError("return_already_open: this order already has an open return or exchange. Use refund_status.");
    }
    await db.update(schema.orders).set({ status: "return_requested", conversationId: ctx.conversationId }).where(eq(schema.orders.id, order.id));
    await linkCustomer(ctx, order.customerId);
    const card: Card = {
      kind: "return",
      orderNumber: order.orderNumber,
      type: input.type,
      status: "pickup_scheduled",
      refundInr: input.type === "return" ? refundInr : null,
      pickupDate: pickupDate.toISOString(),
      exchangeSize: input.exchangeSize ?? null,
    };
    const rows: Array<[string, string]> = [
      ["Order", order.orderNumber],
      ["Item", `${item.name}${item.size ? ` (${item.size})` : ""}`],
      ["Type", input.type === "exchange" ? `Exchange for size ${input.exchangeSize}` : "Return"],
      ["Pickup", formatSlot(pickupDate).replace(/, \d.*$/, "") + ", between 10 AM and 6 PM"],
    ];
    if (input.type === "return") rows.push(["Refund", `INR ${refundInr.toLocaleString("en-IN")} after pickup${feeWaived ? "" : `, includes the INR ${STORE_POLICY.returnPickupFeeInr} pickup fee`}`]);
    const cards: Card[] = [card, await notify(ctx, order, `${input.type === "exchange" ? "Exchange" : "Return"} booked for ${order.orderNumber}`, "Pickup scheduled", rows, "Keep the item unworn with tags attached and packed in its original bag.")];
    const { createFollowUp } = await import("./actions");
    await createFollowUp(ctx, {
      customerId: order.customerId,
      kind: "post_visit",
      channel: "email",
      dueAt: new Date(pickupDate.getTime() + 2 * 86_400_000),
      subject: `Update on your ${input.type} for ${order.orderNumber}`,
      body: input.type === "return" ? `Your refund of INR ${refundInr} is being processed.` : `Your size ${input.exchangeSize} is on its way.`,
    });
    return {
      ok: true,
      data: {
        orderNumber: order.orderNumber,
        type: input.type,
        item: item.name,
        pickupDate: formatSlot(pickupDate).replace(/, \d.*$/, ""),
        refundInr: input.type === "return" ? refundInr : null,
        pickupFeeWaived: feeWaived,
        refundTimeline: input.type === "return" ? "5 to 7 business days after pickup" : null,
        confirmationEmail: emailStatus(cards),
      },
      cards,
    };
  },

  async refund_status(ctx, { orderNumber: number }) {
    const order = await findOrder(ctx, number);
    const ret = await db.query.returns.findFirst({ where: eq(schema.returns.orderId, order.id), orderBy: desc(schema.returns.createdAt) });
    if (!ret) {
      return {
        ok: true,
        data: {
          orderNumber: order.orderNumber,
          hasReturn: false,
          status: order.status,
          note: order.status === "cancelled" ? (order.paymentMethod === "cod" ? "Cancelled before payment, nothing to refund." : "Cancelled. Refund to the original payment method within 5 to 7 business days of cancellation.") : "No return or refund on this order.",
        },
      };
    }
    return {
      ok: true,
      data: {
        orderNumber: order.orderNumber,
        hasReturn: true,
        type: ret.type,
        status: ret.status,
        refundInr: ret.refundInr,
        refundMethod: ret.refundMethod,
        pickupDate: ret.pickupDate ? formatSlot(ret.pickupDate) : null,
      },
      cards: [{ kind: "return", orderNumber: order.orderNumber, type: ret.type, status: ret.status, refundInr: ret.refundInr, pickupDate: ret.pickupDate?.toISOString() ?? null, exchangeSize: ret.exchangeSize }],
    };
  },
};

/* ------------------------------------------------------------------ */

async function findOrder(ctx: ActionContext, number: string): Promise<OrderRow> {
  const order = await db.query.orders.findFirst({
    where: and(eq(schema.orders.businessId, ctx.bundle.business.id), eq(schema.orders.orderNumber, number)),
  });
  if (!order) throw new CommerceError("order_not_found: ask the customer to check the order number, or look up by phone.");
  return order;
}

/** Changing an order requires the phone on file; this stops anyone with an order number from cancelling it. */
async function verify(order: OrderRow, phone: string): Promise<void> {
  const customer = await db.query.customers.findFirst({ where: eq(schema.customers.id, order.customerId) });
  const given = phone.replace(/\D/g, "");
  const onFile = customer?.phone ?? "";
  const ok = given.length >= 4 && onFile.length >= 4 && (onFile.endsWith(given.slice(-10)) || (given.length < 10 && onFile.endsWith(given)));
  if (!ok) throw new CommerceError("verification_failed: the phone number does not match this order. Ask the customer to confirm the number used when ordering.");
}

async function itemsFor(orderIds: string[]): Promise<ItemRow[]> {
  if (orderIds.length === 0) return [];
  return db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds));
}

export function returnEligibility(order: Pick<OrderRow, "status" | "deliveredAt">, items: Array<Pick<ItemRow, "finalSale">>, now = new Date()): { eligible: boolean; reason: string; windowEndsAt: Date | null } {
  if (order.status !== "delivered" || !order.deliveredAt) {
    return { eligible: false, reason: `order is ${order.status}; returns open once it is delivered`, windowEndsAt: null };
  }
  const windowEndsAt = new Date(order.deliveredAt.getTime() + STORE_POLICY.returnWindowDays * 86_400_000);
  if (now > windowEndsAt) return { eligible: false, reason: `the ${STORE_POLICY.returnWindowDays} day return window ended on ${formatSlot(windowEndsAt)}`, windowEndsAt };
  if (items.length > 0 && items.every((i) => i.finalSale)) return { eligible: false, reason: "all items in this order are final sale", windowEndsAt };
  return { eligible: true, reason: "within the return window", windowEndsAt };
}

function summarize(o: OrderRow, items: ItemRow[]) {
  const eligibility = returnEligibility(o, items);
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    placed: formatSlot(o.placedAt),
    totalInr: o.totalInr,
    payment: o.paymentMethod,
    items: items.map((i) => ({ name: i.name, size: i.size, quantity: i.quantity, priceInr: i.priceInr, finalSale: i.finalSale })),
    expectedDelivery: o.expectedDelivery ? formatSlot(o.expectedDelivery) : null,
    deliveredAt: o.deliveredAt ? formatSlot(o.deliveredAt) : null,
    canCancel: STORE_POLICY.cancellableStatuses.includes(o.status),
    canReturnOrExchange: eligibility.eligible,
    returnNote: eligibility.reason,
    returnWindowEnds: eligibility.windowEndsAt ? formatSlot(eligibility.windowEndsAt) : null,
  };
}

function orderCard(o: OrderRow, items: ItemRow[]): Card {
  return {
    kind: "order",
    orderNumber: o.orderNumber,
    status: o.status,
    items: items.map((i) => ({ name: i.name, size: i.size, quantity: i.quantity })),
    totalInr: o.totalInr,
    expectedDelivery: o.expectedDelivery?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    carrier: o.carrier,
    trackingNumber: o.trackingNumber,
  };
}

function nextBusinessDay(from: Date, offset: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < offset) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) added += 1;
  }
  d.setUTCHours(4, 30, 0, 0);
  return d;
}

async function linkCustomer(ctx: ActionContext, customerId: string): Promise<void> {
  await db.update(schema.conversations).set({ customerId }).where(eq(schema.conversations.id, ctx.conversationId));
}

function emailStatus(cards: Card[]): string {
  const card = cards.find((c) => c.kind === "email");
  return card && card.kind === "email" ? card.status : "no_email_on_file";
}

async function notify(
  ctx: ActionContext,
  order: OrderRow,
  subject: string,
  heading: string,
  rows: Array<[string, string]>,
  note: string,
): Promise<Card> {
  const customer = await db.query.customers.findFirst({ where: eq(schema.customers.id, order.customerId) });
  const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, ctx.conversationId) });
  const to = customer?.email;
  const { maskEmail } = await import("./actions");
  if (!to) return { kind: "email", to: "no email on file", subject, status: "skipped" };
  const suppressed = conversation?.isEval || RESERVED_EMAIL.test(to);
  const result = suppressed
    ? ({ status: "skipped", reason: conversation?.isEval ? "Evaluation conversation" : "Reserved test domain" } as const)
    : await sendEmail({
        to,
        subject,
        fromName: ctx.bundle.business.name,
        text: `${heading}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${note}`,
        html: emailHtml({ business: ctx.bundle.business.name, heading, rows, note }),
      });
  await db.insert(schema.notifications).values({
    businessId: ctx.bundle.business.id,
    conversationId: ctx.conversationId,
    channel: "email",
    recipient: maskEmail(to),
    subject,
    status: result.status,
    providerId: result.status === "sent" ? result.providerId : null,
    error: result.status === "failed" ? result.error : result.status === "skipped" ? result.reason : null,
  });
  await emit("notification.sent", { businessId: ctx.bundle.business.id, conversationId: ctx.conversationId }, { status: result.status, subject });
  return { kind: "email", to: maskEmail(to), subject, status: result.status };
}
