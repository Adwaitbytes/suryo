import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { loadBusiness } from "@/lib/agent/business";
import { endConversation } from "@/lib/agent/run";
import { db, schema } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { emit } from "@/lib/events";
import { emailHtml, sendEmail } from "@/lib/notify/email";
import { maskEmailAddress } from "@/lib/console/mask";

const { followUps: f, conversations: c } = schema;

export const ABANDON_AFTER_MINUTES = 10;

const KIND_HEADINGS: Record<(typeof f.$inferSelect)["kind"], string> = {
  reminder: "A quick reminder",
  recovery: "Picking up where we left off",
  callback: "Following up on your call",
  post_visit: "How are you feeling after your visit?",
  lead_nurture: "Still thinking it over?",
};

export type FollowUpRunResult = { processed: number; sent: number; failed: number; callTasksDue: number };

/**
 * Delivers email follow ups that are due. Each row is claimed with a
 * conditional update before sending, so two instances running at once never
 * send the same message twice. Call follow ups are staff tasks: they stay
 * pending and the console flags them once overdue.
 */
export async function processDueFollowUps(limit = 20): Promise<FollowUpRunResult> {
  const due = await db
    .select({ followUp: f, customer: schema.customers, business: schema.businesses })
    .from(f)
    .innerJoin(schema.businesses, eq(schema.businesses.id, f.businessId))
    .leftJoin(schema.customers, eq(schema.customers.id, f.customerId))
    .leftJoin(c, eq(c.id, f.conversationId))
    .where(and(eq(f.status, "pending"), lte(f.dueAt, sql`now()`), sql`coalesce(${c.isEval}, false) = false`))
    .orderBy(asc(f.dueAt))
    .limit(limit);

  const result: FollowUpRunResult = { processed: 0, sent: 0, failed: 0, callTasksDue: 0 };
  for (const { followUp, customer, business } of due) {
    if (followUp.channel === "call") {
      result.callTasksDue += 1;
      continue;
    }
    const ids = { businessId: business.id, conversationId: followUp.conversationId };
    // Claim first: only the instance whose update matches the pending row sends it.
    const [claimed] = await db
      .update(f)
      .set({ status: "sent", sentAt: new Date(), error: null })
      .where(and(eq(f.id, followUp.id), eq(f.status, "pending")))
      .returning({ id: f.id });
    if (!claimed) continue;
    result.processed += 1;

    const fail = async (message: string) => {
      await db.update(f).set({ status: "failed", sentAt: null, error: message }).where(eq(f.id, followUp.id));
      result.failed += 1;
    };

    if (followUp.channel === "whatsapp") {
      await fail("WhatsApp delivery is not configured for this workspace");
      await emit("followup.changed", ids, { followUpId: followUp.id, status: "failed" });
      continue;
    }
    if (!customer?.email) {
      await fail("No email address on file for this customer");
      await emit("followup.changed", ids, { followUpId: followUp.id, status: "failed" });
      continue;
    }

    const link = `${appUrl()}/chat/${business.slug}`;
    const email = await sendEmail({
      to: customer.email,
      subject: followUp.subject,
      fromName: business.name,
      text: `${followUp.body}\n\nContinue the conversation: ${link}`,
      html: emailHtml({
        business: business.name,
        heading: KIND_HEADINGS[followUp.kind],
        rows: [
          ["For", customer.name ?? "You"],
          ["Continue", link],
        ],
        note: followUp.body,
      }),
    });

    if (email.status === "sent") result.sent += 1;
    else await fail(email.status === "failed" ? email.error : `Not sent: ${email.reason}`);

    await db.insert(schema.notifications).values({
      businessId: business.id,
      conversationId: followUp.conversationId,
      channel: "email",
      recipient: maskEmailAddress(customer.email) ?? "unknown",
      subject: followUp.subject,
      status: email.status,
      providerId: email.status === "sent" ? email.providerId : null,
      error: email.status === "failed" ? email.error : email.status === "skipped" ? email.reason : null,
    });
    await emit("followup.changed", ids, { followUpId: followUp.id, status: email.status === "sent" ? "sent" : "failed" });
    await emit("notification.sent", ids, { status: email.status, subject: followUp.subject });
  }
  return result;
}

/**
 * Conversations nobody has touched for ten minutes are closed as abandoned.
 * endConversation writes the summary and, when the customer is known,
 * schedules a recovery follow up.
 */
export async function detectAbandoned(limit = 25): Promise<{ closed: number }> {
  const stale = await db
    .select({ id: c.id, businessId: c.businessId })
    .from(c)
    .where(
      and(
        eq(c.status, "active"),
        eq(c.isEval, false),
        isNull(c.endedAt),
        lte(c.lastActivityAt, sql`now() - make_interval(mins => ${ABANDON_AFTER_MINUTES})`),
      ),
    )
    .orderBy(asc(c.lastActivityAt))
    .limit(limit);
  let closed = 0;
  for (const row of stale) {
    const bundle = await loadBusiness(row.businessId);
    if (!bundle) continue;
    await endConversation(bundle, row.id, "abandoned");
    closed += 1;
  }
  return { closed };
}

export async function runFollowUpMaintenance() {
  const abandoned = await detectAbandoned();
  const followUps = await processDueFollowUps();
  return { abandoned, followUps };
}
