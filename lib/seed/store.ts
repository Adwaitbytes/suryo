import { eq } from "drizzle-orm";
import type { BusinessProfile, Persona } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import type { OrderStatus } from "@/lib/db/schema";
import { embedDocuments } from "@/lib/kb/embed";

/**
 * Second demo business: a fictional online fashion label. Its knowledge base is written
 * as the company's own policy documents, and its orders cover every state an order can be in,
 * so the agent can both answer from policy and act on real orders.
 */
export const STORE_SLUG = "saanjh";

export const storeProfile: BusinessProfile = {
  name: "Saanjh Studio",
  tagline: "Handloom inspired everyday clothing, made in India",
  description:
    "Saanjh Studio is an online clothing label from Indore selling kurtas, shirts, dresses, co-ord sets and accessories in cotton and linen. Orders ship across India from the Indore warehouse.",
  industry: "E-commerce: fashion and apparel",
  services: [],
  hours: [
    { day: "mon", open: "09:00", close: "21:00" },
    { day: "tue", open: "09:00", close: "21:00" },
    { day: "wed", open: "09:00", close: "21:00" },
    { day: "thu", open: "09:00", close: "21:00" },
    { day: "fri", open: "09:00", close: "21:00" },
    { day: "sat", open: "10:00", close: "19:00" },
    { day: "sun", open: "", close: "" },
  ],
  locations: [{ name: "Online, ships from Indore", address: "Plot 22, Sector C, Sanwer Road Industrial Area, Indore 452015" }],
  contact: { phone: "+91 731 499 0100", email: "help@saanjhstudio.in", whatsapp: "+91 98260 77100" },
  bookingRules: [
    "Returns and size exchanges within 15 days of delivery for unworn items with tags.",
    "Orders can be cancelled until they ship.",
    "Final sale items cannot be returned or exchanged.",
  ],
  bookableOffering: "Styling callback",
  toneOfVoice: "Friendly, quick and practical, like a helpful store associate who knows the policies by heart",
  languages: ["English", "Hindi", "Hinglish"],
};

export const storePersona: Persona = {
  agentName: "Meera",
  greeting: "Hi, this is Meera from Saanjh Studio. How can I help with your order today?",
  style: "Short, friendly sentences. Mirrors English, Hindi or Hinglish. Always verifies the phone number before changing an order.",
  voice: "Kore",
};

export const storePolicies: Array<{ title: string; content: string }> = [
  {
    title: "Returns and exchanges policy",
    content:
      "You can return or exchange an item within 15 days of delivery. Items must be unworn, unwashed, with original tags attached and in the original packaging. Size exchanges are free and the new size ships once the original item is picked up. For returns, a reverse pickup fee of 99 rupees is deducted from the refund. The fee is waived if the item arrived damaged, defective or was the wrong item. Returns are picked up from your address by our courier partner, usually the next working day.",
  },
  {
    title: "Final sale items",
    content:
      "Items marked Final sale cannot be returned or exchanged. This includes products bought in the end of season sale at 50 percent off or more, innerwear, face masks and gift cards. If a final sale item arrives damaged or wrong, report it within 48 hours and we will replace or refund it.",
  },
  {
    title: "Order cancellation policy",
    content:
      "You can cancel an order any time before it ships, while its status is Placed or Packed. Once an order has shipped it cannot be cancelled. You can refuse the delivery at your door, or accept it and request a return within 15 days. Prepaid orders that are cancelled are refunded in full to the original payment method.",
  },
  {
    title: "Refund timelines",
    content:
      "Prepaid orders (UPI or card) are refunded to the original payment method within 5 to 7 business days after the returned item is picked up, or after cancellation. Cash on delivery orders are refunded by UPI or bank transfer within 7 business days after pickup; we will ask for your UPI ID. You can also choose instant store credit for the full amount with no pickup fee deducted.",
  },
  {
    title: "Shipping and delivery",
    content:
      "Shipping is free on orders above 999 rupees, otherwise 79 rupees. Orders are dispatched within 24 hours on working days. Delivery takes 2 to 4 days to metro cities and 4 to 7 days to other places. We ship with Delhivery and Blue Dart. You get a tracking link by SMS and email once the order ships. We currently ship within India only.",
  },
  {
    title: "Payments and cash on delivery",
    content:
      "We accept UPI, all major debit and credit cards, net banking and cash on delivery. Cash on delivery is available on orders up to 5,000 rupees and carries a 49 rupee handling fee. Coupons cannot be combined; only one coupon applies per order. Prices include GST.",
  },
  {
    title: "Damaged, defective or wrong item",
    content:
      "If your order arrives damaged, defective or with the wrong item, report it within 48 hours of delivery with photos of the item and the package. We will arrange a free pickup and send a replacement, or a full refund including shipping. These cases are handled by our support team, who reply within 24 hours.",
  },
  {
    title: "Size guide",
    content:
      "Our kurtas and shirts follow Indian sizing. Chest measurements: XS 34 inches, S 36, M 38, L 40, XL 42, XXL 44. Kurtas are a relaxed fit, so if you are between sizes pick the smaller one. Dresses and co-ord sets are a regular fit; if you are between sizes pick the larger one. Linen may shrink up to 2 percent after the first wash.",
  },
  {
    title: "Fabric care",
    content:
      "Cotton and handloom pieces: hand wash or gentle machine wash cold, wash dark colours separately for the first few washes, dry in shade. Linen: gentle wash, do not tumble dry, iron while slightly damp. Block printed fabrics may release a little colour in the first wash, which is normal for natural dyes.",
  },
  {
    title: "Customer support hours and contact",
    content:
      "Meera, our assistant, answers chat and calls 24 hours a day. Our human support team is available Monday to Friday 9 AM to 9 PM and Saturday 10 AM to 7 PM, closed on Sundays. Phone +91 731 499 0100, WhatsApp +91 98260 77100, email help@saanjhstudio.in.",
  },
  {
    title: "About Saanjh Studio",
    content:
      "Saanjh Studio started in Indore in 2019 working with handloom weavers from Maheshwar and Chanderi. We make everyday kurtas, shirts, dresses and co-ord sets in cotton and linen, and we do not run a physical store; we sell only online.",
  },
  {
    title: "Privacy and account",
    content:
      "We use your phone number and email only to process orders and send updates. To change anything on an order, our assistant verifies the phone number used when ordering. We never ask for card numbers, OTPs or passwords over chat or call.",
  },
];

type ProductSeed = { sku: string; name: string; category: string; priceInr: number; sizes: string[]; description: string; finalSale?: boolean };

export const storeProducts: ProductSeed[] = [
  { sku: "KR-INDIGO", name: "Indigo Block Print Kurta", category: "Kurtas", priceInr: 1890, sizes: ["S", "M", "L", "XL", "XXL"], description: "Hand block printed cotton kurta in indigo, relaxed fit." },
  { sku: "KR-MAHESH", name: "Maheshwari Silk Cotton Kurta", category: "Kurtas", priceInr: 2650, sizes: ["S", "M", "L", "XL"], description: "Maheshwari silk cotton with a zari border." },
  { sku: "KR-RUST", name: "Rust Chanderi Kurta", category: "Kurtas", priceInr: 2290, sizes: ["XS", "S", "M", "L", "XL"], description: "Light Chanderi weave in rust, straight cut." },
  { sku: "SH-LINEN-W", name: "White Linen Shirt", category: "Shirts", priceInr: 2190, sizes: ["S", "M", "L", "XL", "XXL"], description: "Pure linen, mandarin collar." },
  { sku: "SH-KHADI", name: "Olive Khadi Shirt", category: "Shirts", priceInr: 1590, sizes: ["S", "M", "L", "XL"], description: "Handspun khadi, regular fit." },
  { sku: "DR-MUL", name: "Mulmul Tiered Dress", category: "Dresses", priceInr: 2490, sizes: ["XS", "S", "M", "L"], description: "Soft mulmul cotton, tiered midi length." },
  { sku: "DR-AJRAKH", name: "Ajrakh Wrap Dress", category: "Dresses", priceInr: 2890, sizes: ["S", "M", "L", "XL"], description: "Natural dyed Ajrakh print, wrap tie." },
  { sku: "CO-SAGE", name: "Sage Linen Co-ord Set", category: "Co-ord sets", priceInr: 3490, sizes: ["XS", "S", "M", "L", "XL"], description: "Linen shirt and trousers in sage." },
  { sku: "PT-PALAZZO", name: "Black Cotton Palazzo", category: "Bottoms", priceInr: 990, sizes: ["S", "M", "L", "XL", "XXL"], description: "Wide leg cotton palazzo with pockets." },
  { sku: "DP-CHANDERI", name: "Chanderi Dupatta", category: "Accessories", priceInr: 1290, sizes: ["Free"], description: "Chanderi dupatta with tassels." },
  { sku: "SALE-KURTA", name: "End of Season Printed Kurta", category: "Sale", priceInr: 790, sizes: ["S", "M", "L"], description: "Printed cotton kurta, end of season sale.", finalSale: true },
  { sku: "MASK-3", name: "Cotton Mask Pack of 3", category: "Accessories", priceInr: 299, sizes: ["Free"], description: "Reusable cotton masks.", finalSale: true },
];

type OrderSeed = {
  number: string;
  customer: number;
  status: OrderStatus;
  payment: "upi" | "card" | "cod";
  placedDaysAgo: number;
  deliveredDaysAgo?: number;
  items: Array<{ sku: string; size: string; qty?: number }>;
};

export const storeCustomers = [
  { name: "Aarav Mehta", phone: "9826055501", email: "aarav.mehta@example.com", address: "B-12, Scheme 78, Vijay Nagar, Indore 452010" },
  { name: "Ishita Rao", phone: "9893055502", email: "ishita.rao@example.com", address: "Flat 402, Prestige Heights, Kondapur, Hyderabad 500084" },
  { name: "Kabir Singh", phone: "9752055503", email: "kabir.singh@example.com", address: "45 Ashok Nagar, Bhopal 462023" },
  { name: "Nandini Joshi", phone: "9425055504", email: "nandini.j@example.com", address: "12 Laxmi Road, Pune 411030" },
  { name: "Rohit Agarwal", phone: "9301055505", email: null, address: "7 Malviya Nagar, Jaipur 302017" },
  { name: "Fatima Sheikh", phone: "9179055506", email: "fatima.s@example.com", address: "21 Bandra West, Mumbai 400050" },
] as const;

export const storeOrders: OrderSeed[] = [
  { number: "SJ-48213", customer: 0, status: "delivered", payment: "upi", placedDaysAgo: 6, deliveredDaysAgo: 3, items: [{ sku: "KR-INDIGO", size: "M" }, { sku: "PT-PALAZZO", size: "M" }] },
  { number: "SJ-48390", customer: 0, status: "placed", payment: "cod", placedDaysAgo: 0, items: [{ sku: "SH-LINEN-W", size: "L" }] },
  { number: "SJ-47120", customer: 1, status: "shipped", payment: "card", placedDaysAgo: 2, items: [{ sku: "DR-AJRAKH", size: "S" }] },
  { number: "SJ-47355", customer: 1, status: "delivered", payment: "card", placedDaysAgo: 26, deliveredDaysAgo: 21, items: [{ sku: "CO-SAGE", size: "S" }] },
  { number: "SJ-47802", customer: 2, status: "out_for_delivery", payment: "upi", placedDaysAgo: 3, items: [{ sku: "SH-KHADI", size: "L" }, { sku: "DP-CHANDERI", size: "Free" }] },
  { number: "SJ-47911", customer: 2, status: "delivered", payment: "upi", placedDaysAgo: 8, deliveredDaysAgo: 5, items: [{ sku: "SALE-KURTA", size: "M" }, { sku: "MASK-3", size: "Free" }] },
  { number: "SJ-48001", customer: 3, status: "packed", payment: "upi", placedDaysAgo: 1, items: [{ sku: "DR-MUL", size: "M" }] },
  { number: "SJ-46590", customer: 3, status: "refunded", payment: "upi", placedDaysAgo: 30, deliveredDaysAgo: 26, items: [{ sku: "KR-RUST", size: "S" }] },
  { number: "SJ-48122", customer: 4, status: "delivered", payment: "cod", placedDaysAgo: 5, deliveredDaysAgo: 2, items: [{ sku: "KR-MAHESH", size: "XL" }] },
  { number: "SJ-48277", customer: 5, status: "delivered", payment: "card", placedDaysAgo: 4, deliveredDaysAgo: 1, items: [{ sku: "DR-AJRAKH", size: "M" }, { sku: "DP-CHANDERI", size: "Free" }] },
];

const DAY = 86_400_000;

/** Full rebuild of the demo store including policy embeddings. */
export async function seedStore(): Promise<string> {
  await db.delete(schema.businesses).where(eq(schema.businesses.slug, STORE_SLUG));
  const [business] = await db
    .insert(schema.businesses)
    .values({
      slug: STORE_SLUG,
      name: storeProfile.name,
      kind: "store",
      website: "https://saanjhstudio.in",
      profile: storeProfile,
      persona: storePersona,
      isDemo: true,
    })
    .returning();
  await db.insert(schema.products).values(
    storeProducts.map((p) => ({ businessId: business.id, sku: p.sku, name: p.name, category: p.category, priceInr: p.priceInr, sizes: p.sizes, description: p.description, finalSale: p.finalSale ?? false, stock: 40 })),
  );
  const embeddings = await embedDocuments(storePolicies.map((k) => `${k.title}\n${k.content}`));
  await db.insert(schema.kbChunks).values(
    storePolicies.map((k, i) => ({
      businessId: business.id,
      sourceUrl: `doc://Saanjh Studio policies.pdf#${k.title}`,
      title: k.title,
      content: k.content,
      embedding: embeddings[i],
    })),
  );
  await resetStoreState(business.id);
  return business.id;
}

/** Restores the demo store's customers, orders and returns without re-embedding. */
export async function resetStoreState(businessId?: string): Promise<{ ms: number } | null> {
  const started = Date.now();
  const business = businessId
    ? await db.query.businesses.findFirst({ where: eq(schema.businesses.id, businessId) })
    : await db.query.businesses.findFirst({ where: eq(schema.businesses.slug, STORE_SLUG) });
  if (!business) return null;
  const id = business.id;
  await db.transaction(async (tx) => {
    await tx.delete(schema.conversations).where(eq(schema.conversations.businessId, id));
    await tx.delete(schema.returns).where(eq(schema.returns.businessId, id));
    await tx.delete(schema.orders).where(eq(schema.orders.businessId, id));
    await tx.delete(schema.tickets).where(eq(schema.tickets.businessId, id));
    await tx.delete(schema.leads).where(eq(schema.leads.businessId, id));
    await tx.delete(schema.followUps).where(eq(schema.followUps.businessId, id));
    await tx.delete(schema.notifications).where(eq(schema.notifications.businessId, id));
    await tx.delete(schema.events).where(eq(schema.events.businessId, id));
    await tx.delete(schema.customers).where(eq(schema.customers.businessId, id));
  });
  const products = await db.select().from(schema.products).where(eq(schema.products.businessId, id));
  const customers = await db
    .insert(schema.customers)
    .values(storeCustomers.map((c) => ({ businessId: id, name: c.name, phone: c.phone, email: c.email, language: "en" })))
    .returning();
  const now = Date.now();
  for (const o of storeOrders) {
    const lines = o.items.map((item) => {
      const product = products.find((p) => p.sku === item.sku);
      if (!product) throw new Error(`Unknown sku ${item.sku}`);
      return { product, size: item.size, qty: item.qty ?? 1 };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.product.priceInr * l.qty, 0);
    const total = subtotal + (subtotal > 999 ? 0 : 79) + (o.payment === "cod" ? 49 : 0);
    const placedAt = new Date(now - o.placedDaysAgo * DAY - 3 * 3600_000);
    const shipped = ["shipped", "out_for_delivery", "delivered", "return_requested", "returned", "refunded"].includes(o.status);
    const [order] = await db
      .insert(schema.orders)
      .values({
        businessId: id,
        customerId: customers[o.customer].id,
        orderNumber: o.number,
        status: o.status,
        totalInr: total,
        paymentMethod: o.payment,
        shippingAddress: storeCustomers[o.customer].address,
        carrier: shipped ? (o.number.endsWith("0") || o.number.endsWith("2") ? "Blue Dart" : "Delhivery") : null,
        trackingNumber: shipped ? `${o.number.replace("SJ-", "")}${o.placedDaysAgo}7741IN` : null,
        placedAt,
        expectedDelivery: o.deliveredDaysAgo === undefined ? new Date(placedAt.getTime() + 4 * DAY) : null,
        deliveredAt: o.deliveredDaysAgo !== undefined ? new Date(now - o.deliveredDaysAgo * DAY - 5 * 3600_000) : null,
      })
      .returning();
    await db.insert(schema.orderItems).values(
      lines.map((l) => ({ orderId: order.id, productId: l.product.id, name: l.product.name, size: l.size, quantity: l.qty, priceInr: l.product.priceInr, finalSale: l.product.finalSale })),
    );
    if (o.status === "refunded") {
      await db.insert(schema.returns).values({
        businessId: id,
        orderId: order.id,
        type: "return",
        reason: "size_issue",
        status: "refunded",
        refundInr: lines[0].product.priceInr - 99,
        refundMethod: "original upi",
        pickupDate: new Date(now - 24 * DAY),
      });
    }
  }
  return { ms: Date.now() - started };
}
