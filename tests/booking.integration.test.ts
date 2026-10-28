import { and, eq, gte } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { executeAction } from "@/lib/agent/actions";
import { loadBusiness } from "@/lib/agent/business";
import { startConversation } from "@/lib/agent/run";
import { db, schema } from "@/lib/db";

/**
 * Runs against the real database: two customers race for the same slot at the
 * same instant. Exactly one booking may succeed.
 */
describe.skipIf(!process.env.DATABASE_URL)("transactional booking", () => {
  const created: string[] = [];

  afterAll(async () => {
    for (const id of created) await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
  });

  it("makes double booking impossible under concurrency", async () => {
    const bundle = await loadBusiness("kesar");
    if (!bundle) throw new Error("Seed the demo clinic first");
    const slot = await db.query.slots.findFirst({
      where: and(eq(schema.slots.businessId, bundle.business.id), eq(schema.slots.status, "open"), gte(schema.slots.startsAt, new Date(Date.now() + 86_400_000))),
    });
    if (!slot) throw new Error("No open slot");
    const [a, b] = await Promise.all([startConversation(bundle, "chat", true), startConversation(bundle, "chat", true)]);
    created.push(a.id, b.id);
    const book = (conversationId: string, n: number) =>
      executeAction({ bundle, conversationId, channel: "chat" }, "book_appointment", {
        slotId: slot.id,
        service: "Teeth cleaning and polishing",
        customerName: `Race Test ${n}`,
        phone: `90000000${n}${n}`,
        confirmedByCustomer: true,
      });
    const results = await Promise.all([book(a.id, 1), book(b.id, 2)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)?.data.error).toMatch(/slot_unavailable/);
    const live = await db.select().from(schema.appointments).where(and(eq(schema.appointments.slotId, slot.id), eq(schema.appointments.status, "confirmed")));
    expect(live).toHaveLength(1);

    // Restore: cancel the winner so the slot is open again for the demo.
    const winner = results.find((r) => r.ok);
    await executeAction({ bundle, conversationId: a.id, channel: "chat" }, "cancel_appointment", {
      appointmentId: String(winner?.data.appointmentId),
      confirmedByCustomer: true,
    });
    const reopened = await db.query.slots.findFirst({ where: eq(schema.slots.id, slot.id) });
    expect(reopened?.status).toBe("open");
    for (const n of [1, 2]) await db.delete(schema.customers).where(and(eq(schema.customers.businessId, bundle.business.id), eq(schema.customers.phone, `90000000${n}${n}`)));
  });
});
