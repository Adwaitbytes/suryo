import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { emit } from "@/lib/events";
import { runAfter } from "@/lib/background";
import type { ActionContext } from "./actions";
import { summarizeConversation } from "./summary";

export type EscalationInput = {
  reason: string;
  urgency: "low" | "medium" | "high" | "critical";
  trigger: string;
};

/** Idempotent per conversation: a second trigger raises urgency instead of duplicating the queue item. */
export async function escalateConversation(ctx: Pick<ActionContext, "bundle" | "conversationId">, input: EscalationInput) {
  const businessId = ctx.bundle.business.id;
  const rank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
  const existing = await db.query.escalations.findFirst({
    where: (e, { and, eq: equals, ne }) => and(equals(e.conversationId, ctx.conversationId), ne(e.status, "resolved")),
  });
  let escalation;
  if (existing) {
    const urgency = rank[input.urgency] > rank[existing.urgency] ? input.urgency : existing.urgency;
    [escalation] = await db.update(schema.escalations).set({ urgency }).where(eq(schema.escalations.id, existing.id)).returning();
  } else {
    [escalation] = await db
      .insert(schema.escalations)
      .values({
        businessId,
        conversationId: ctx.conversationId,
        reason: input.reason,
        trigger: input.trigger,
        urgency: input.urgency,
        summary: input.reason,
      })
      .returning();
  }
  await db
    .update(schema.conversations)
    .set({ status: "escalated", resolvedByAi: false })
    .where(eq(schema.conversations.id, ctx.conversationId));
  await emit("escalation.created", { businessId, conversationId: ctx.conversationId }, { urgency: escalation.urgency, reason: input.reason });
  const escalationId = escalation.id;
  await runAfter(async () => {
    const summary = await summarizeConversation(ctx.conversationId);
    if (!summary) return;
    await db
      .update(schema.escalations)
      .set({ summary: [summary.headline, ...summary.bullets].slice(0, 3).join("\n") })
      .where(eq(schema.escalations.id, escalationId));
    await emit("escalation.updated", { businessId, conversationId: ctx.conversationId }, { escalationId });
  });
  return escalation;
}
