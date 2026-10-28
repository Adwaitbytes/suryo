import { generateText, Output } from "ai";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { strongModel } from "@/lib/ai/models";
import type { ConversationSummary } from "@/lib/contracts";
import { db, schema } from "@/lib/db";

const summarySchema = z.object({
  headline: z.string().describe("Under 12 words, what this customer needed"),
  bullets: z.array(z.string()).min(1).max(3).describe("Up to 3 short lines: who, what happened, what is pending"),
  outcome: z.enum(["booked", "ticket", "lead", "answered", "escalated", "unresolved"]),
  nextStep: z.string().describe("The single next action a human should take, or 'None'"),
});

export async function transcriptText(conversationId: string, limit = 40): Promise<string> {
  const rows = await db
    .select({ role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt));
  return rows
    .slice(-limit)
    .map((m) => `${m.role === "customer" ? "Customer" : m.role === "human" ? "Staff" : m.role === "agent" ? "Agent" : "System"}: ${m.content}`)
    .join("\n");
}

export async function summarizeConversation(conversationId: string): Promise<ConversationSummary | null> {
  const transcript = await transcriptText(conversationId);
  if (!transcript.trim()) return null;
  const tools = await db
    .select({ name: schema.toolCalls.name, ok: schema.toolCalls.ok })
    .from(schema.toolCalls)
    .where(eq(schema.toolCalls.conversationId, conversationId));
  const { output } = await generateText({
    model: strongModel(),
    output: Output.object({ schema: summarySchema }),
    system:
      "You write handoff notes for a clinic front desk. Plain, specific, no filler, no em dashes. Never invent details that are not in the transcript.",
    prompt: `Actions executed: ${tools.map((t) => `${t.name}${t.ok ? "" : " (failed)"}`).join(", ") || "none"}\n\nTranscript:\n${transcript}`,
  });
  const summary = output satisfies ConversationSummary;
  await db.update(schema.conversations).set({ summary }).where(eq(schema.conversations.id, conversationId));
  return summary;
}
