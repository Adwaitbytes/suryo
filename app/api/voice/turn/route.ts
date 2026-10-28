import { and, asc, desc, eq, gt } from "drizzle-orm";
import { analyzeTurn, heuristicAnalysis } from "@/lib/agent/analysis";
import { loadBusiness } from "@/lib/agent/business";
import { persistAnalysis } from "@/lib/agent/run";
import { db, schema } from "@/lib/db";
import { emit } from "@/lib/events";
import { error, json } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { voiceTurnRequestSchema, type VoiceTurnResponse } from "@/lib/voice/protocol";
import { memoryFromToolCalls, stageForTools } from "@/lib/voice/server";

export const maxDuration = 30;

/**
 * Persists one spoken exchange (from Gemini's live transcriptions) and runs the same
 * analysis and deterministic escalation rules as chat, so the console sees voice and chat alike.
 */
export async function POST(req: Request) {
  if (!rateLimit(`voice-turn:${clientKey(req)}`, 60, 60_000)) return error(429, "Too many requests");
  const body = voiceTurnRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return error(400, "Invalid request");
  const { conversationId, latencyMs, interrupted } = body.data;
  const customerText = body.data.customerText.trim();
  const agentText = body.data.agentText.trim();

  const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, conversationId) });
  if (!conversation || conversation.channel !== "voice") return error(404, "Conversation not found");
  const bundle = await loadBusiness(conversation.businessId);
  if (!bundle) return error(404, "Unknown business");
  const businessId = bundle.business.id;
  if (!customerText && !agentText) return json({ status: conversation.status, handoff: null } satisfies VoiceTurnResponse);

  // Tool calls are audited by the tool route; everything since the last agent line belongs to this turn.
  const [lastAgent] = await db
    .select({ createdAt: schema.messages.createdAt })
    .from(schema.messages)
    .where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.role, "agent")))
    .orderBy(desc(schema.messages.createdAt))
    .limit(1);
  const since = lastAgent?.createdAt ?? conversation.startedAt;
  const calls = await db
    .select({ name: schema.toolCalls.name, ok: schema.toolCalls.ok, output: schema.toolCalls.output })
    .from(schema.toolCalls)
    .where(and(eq(schema.toolCalls.conversationId, conversationId), gt(schema.toolCalls.createdAt, since)))
    .orderBy(asc(schema.toolCalls.createdAt));
  const tools = calls.map((c) => c.name);

  const previous = await db
    .select({ content: schema.messages.content })
    .from(schema.messages)
    .where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.role, "customer")))
    .orderBy(desc(schema.messages.createdAt))
    .limit(3);

  let customerMessageId: string | null = null;
  const quick = customerText ? heuristicAnalysis(customerText) : null;
  if (customerText) {
    const [row] = await db
      .insert(schema.messages)
      .values({ conversationId, role: "customer", content: customerText, meta: { language: quick?.language } })
      .returning({ id: schema.messages.id });
    customerMessageId = row.id;
  }
  const analysisPromise = customerText ? analyzeTurn(customerText, previous.map((p) => p.content).reverse()) : null;

  const writes: Promise<unknown>[] = [];
  if (customerMessageId) {
    writes.push(emit("message.created", { businessId, conversationId }, { role: "customer", messageId: customerMessageId, channel: "voice" }));
  }
  if (agentText) {
    const [agent] = await db
      .insert(schema.messages)
      .values({
        conversationId,
        role: "agent",
        content: agentText.replace(/—/g, ", "),
        meta: {
          latencyMs: latencyMs ?? undefined,
          language: quick?.language,
          tools,
          memory: memoryFromToolCalls(calls),
        },
      })
      .returning({ id: schema.messages.id });
    writes.push(emit("message.created", { businessId, conversationId }, { role: "agent", messageId: agent.id, channel: "voice", interrupted }));
  }

  let handoff: string | null = null;
  if (analysisPromise && customerMessageId) {
    const analysis = await analysisPromise;
    handoff = await persistAnalysis(conversationId, businessId, customerMessageId, analysis, conversation.sentiment, {
      stage: stageForTools(tools, conversation.stage),
      alreadyEscalated: tools.includes("escalate_to_human") || conversation.status !== "active",
      bundle,
    });
  }
  for (const settled of await Promise.allSettled(writes)) {
    if (settled.status === "rejected") console.error("[voice/turn] event write failed", settled.reason);
  }

  const latest = await db.query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId),
    columns: { status: true },
  });
  const status = latest?.status ?? conversation.status;
  if (!handoff && tools.includes("escalate_to_human")) handoff = "agent_escalated";
  return json({ status, handoff } satisfies VoiceTurnResponse);
}
