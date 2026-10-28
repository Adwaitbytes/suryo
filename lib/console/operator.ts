import { generateText, Output } from "ai";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { classifierModel } from "@/lib/ai/models";
import { loadBusiness } from "@/lib/agent/business";
import { transcriptText } from "@/lib/agent/summary";
import { runAfter } from "@/lib/background";
import { db, schema } from "@/lib/db";
import { emit } from "@/lib/events";

export const DEFAULT_OPERATOR = "Priya (front desk)";

export class OperatorError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const { conversations: c, escalations: e, messages: m } = schema;

/** "Priya (front desk)" reads as "Priya from the front desk" in the transcript. */
export function operatorIntro(operator: string): string {
  const match = operator.match(/^(.+?)\s*\((.+)\)$/);
  return match ? `${match[1]} from the ${match[2]}` : operator;
}

async function loadLiveConversation(conversationId: string) {
  const conversation = await db.query.conversations.findFirst({ where: and(eq(c.id, conversationId), eq(c.isEval, false)) });
  if (!conversation) throw new OperatorError(404, "Conversation not found");
  return conversation;
}

async function systemMessage(conversationId: string, businessId: string, content: string, operator?: string) {
  const [row] = await db.insert(m).values({ conversationId, role: "system", content, meta: operator ? { operator } : {} }).returning({ id: m.id });
  await emit("message.created", { businessId, conversationId }, { role: "system", messageId: row.id });
}

export async function takeOver(conversationId: string, operator: string) {
  const conversation = await loadLiveConversation(conversationId);
  if (conversation.status === "resolved" || conversation.status === "abandoned") {
    throw new OperatorError(409, "This conversation has already ended");
  }
  const ids = { businessId: conversation.businessId, conversationId };
  if (conversation.status === "human") return { status: "human" as const, alreadyOwned: true };

  await db.update(c).set({ status: "human", resolvedByAi: false, lastActivityAt: new Date() }).where(eq(c.id, conversationId));
  const claimed = await db
    .update(e)
    .set({ status: "claimed", claimedBy: operator })
    .where(and(eq(e.conversationId, conversationId), eq(e.status, "open")))
    .returning({ id: e.id });
  await systemMessage(conversationId, conversation.businessId, `${operatorIntro(operator)} joined`, operator);
  await emit("conversation.updated", ids, { status: "human", operator });
  for (const x of claimed) await emit("escalation.updated", ids, { escalationId: x.id, status: "claimed", claimedBy: operator });
  return { status: "human" as const, alreadyOwned: false };
}

export async function sendHumanReply(conversationId: string, operator: string, content: string, suggested: boolean) {
  const conversation = await loadLiveConversation(conversationId);
  if (conversation.status !== "human") throw new OperatorError(409, "Take over the conversation before replying");
  const [row] = await db
    .insert(m)
    .values({ conversationId, role: "human", content, meta: { operator, suggested } })
    .returning();
  await db.update(c).set({ lastActivityAt: new Date() }).where(eq(c.id, conversationId));
  await emit("message.created", { businessId: conversation.businessId, conversationId }, { role: "human", messageId: row.id, operator });
  return { id: row.id, createdAt: row.createdAt.toISOString() };
}

/**
 * Returns the conversation to the AI. The human has dealt with whatever was
 * escalated, so any claimed escalation is closed rather than left in the queue.
 */
export async function handBack(conversationId: string, operator: string) {
  const conversation = await loadLiveConversation(conversationId);
  if (conversation.status !== "human") throw new OperatorError(409, "Only conversations owned by a human can be handed back");
  const ids = { businessId: conversation.businessId, conversationId };
  await db.update(c).set({ status: "active", lastActivityAt: new Date() }).where(eq(c.id, conversationId));
  const closed = await resolveEscalations(conversationId);
  await systemMessage(conversationId, conversation.businessId, `${operatorIntro(operator)} handed the conversation back to the assistant`, operator);
  await emit("conversation.updated", ids, { status: "active" });
  for (const x of closed) await emit("escalation.updated", ids, { escalationId: x.id, status: "resolved" });
  return { status: "active" as const };
}

export async function resolveConversation(conversationId: string, operator: string) {
  const conversation = await loadLiveConversation(conversationId);
  const ids = { businessId: conversation.businessId, conversationId };
  const closed = await resolveEscalations(conversationId);
  if (conversation.status !== "resolved") {
    await db
      .update(c)
      .set({ status: "resolved", endedAt: conversation.endedAt ?? new Date(), lastActivityAt: new Date(), resolvedByAi: closed.length || conversation.status === "human" ? false : conversation.resolvedByAi })
      .where(eq(c.id, conversationId));
    await systemMessage(conversationId, conversation.businessId, `Marked resolved by ${operatorIntro(operator)}`, operator);
    await emit("conversation.updated", ids, { status: "resolved" });
  }
  for (const x of closed) await emit("escalation.updated", ids, { escalationId: x.id, status: "resolved" });
  await runAfter(async () => {
    const { summarizeConversation } = await import("@/lib/agent/summary");
    await summarizeConversation(conversationId);
    await emit("conversation.updated", ids, { summary: true });
  });
  return { status: "resolved" as const };
}

export async function resolveEscalation(escalationId: string, operator: string) {
  const escalation = await db.query.escalations.findFirst({ where: eq(e.id, escalationId) });
  if (!escalation) throw new OperatorError(404, "Escalation not found");
  return resolveConversation(escalation.conversationId, operator);
}

/** Claims through a takeover while the customer is still there; otherwise just records the owner. */
export async function claimEscalation(escalationId: string, operator: string) {
  const escalation = await db.query.escalations.findFirst({ where: eq(e.id, escalationId) });
  if (!escalation) throw new OperatorError(404, "Escalation not found");
  if (escalation.status === "resolved") throw new OperatorError(409, "This escalation is already resolved");
  const conversation = await loadLiveConversation(escalation.conversationId);
  if (conversation.status !== "resolved" && conversation.status !== "abandoned") {
    await takeOver(conversation.id, operator);
    return { conversationId: conversation.id, tookOver: true };
  }
  await db.update(e).set({ status: "claimed", claimedBy: operator }).where(eq(e.id, escalationId));
  await emit("escalation.updated", { businessId: conversation.businessId, conversationId: conversation.id }, { escalationId, status: "claimed", claimedBy: operator });
  return { conversationId: conversation.id, tookOver: false };
}

function resolveEscalations(conversationId: string) {
  return db
    .update(e)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(eq(e.conversationId, conversationId), ne(e.status, "resolved")))
    .returning({ id: e.id });
}

/* ------------------------------------------------------------------ */
/* Reply drafts                                                        */
/* ------------------------------------------------------------------ */

const draftsSchema = z.object({
  replies: z.array(z.string().min(2).max(320)).min(2).max(3),
});

const cleanDraft = (s: string) =>
  s
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();

export async function suggestReplies(conversationId: string, operator: string): Promise<string[]> {
  const conversation = await loadLiveConversation(conversationId);
  const bundle = await loadBusiness(conversation.businessId);
  if (!bundle) throw new OperatorError(404, "Business not found");
  const transcript = await transcriptText(conversationId, 24);
  if (!transcript.trim()) throw new OperatorError(409, "Nothing to reply to yet");
  const { profile } = bundle.business;
  const services = bundle.services
    .slice(0, 30)
    .map((s) => `${s.name}${s.priceInr ? ` (INR ${s.priceInr})` : s.priceNote ? ` (${s.priceNote})` : ""}`)
    .join("; ");
  const hours = profile.hours.map((h) => `${h.day} ${h.open && h.close ? `${h.open}-${h.close}` : "closed"}`).join(", ");
  const language = conversation.language === "hi" ? "Hindi" : conversation.language === "hinglish" ? "Hinglish (Hindi in Latin script mixed with English)" : "English";

  const { output } = await generateText({
    model: classifierModel(),
    output: Output.object({ schema: draftsSchema }),
    abortSignal: AbortSignal.timeout(15_000),
    system: [
      `You draft replies for ${operatorIntro(operator)} at ${bundle.business.name}, who has taken over a live customer conversation from the AI assistant.`,
      "Write 2 or 3 distinct next replies the staff member could send right now. Each is one or two short sentences, warm and specific, and moves the issue forward.",
      "Vary them: for example one that acknowledges and apologises, one that proposes a concrete next step, one that asks for the single missing detail.",
      `Reply in ${language}, matching the customer's register. No em dashes, no emojis, no sign offs, no placeholders in brackets.`,
      "Only state facts found in the business details or the transcript. Never promise refunds, discounts or clinical outcomes; offer to check instead.",
    ].join(" "),
    prompt: [
      `Business: ${bundle.business.name}. ${profile.description}`,
      `Hours: ${hours}`,
      `Contact: phone ${profile.contact.phone}, email ${profile.contact.email}`,
      `Policies: ${profile.bookingRules.join(" ")}`,
      services ? `Services: ${services}` : "",
      "",
      "Transcript (most recent last):",
      transcript,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return output.replies.map(cleanDraft).filter(Boolean).slice(0, 3);
}
