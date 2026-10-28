import { stepCountIs, streamText, tool, type ModelMessage, type ToolSet } from "ai";
import { and, asc, desc, eq } from "drizzle-orm";
import { fastModel } from "@/lib/ai/models";
import type { Card, Channel, SourceRef, StreamEvent, TurnAnalysis } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import { emit } from "@/lib/events";
import { runAfter } from "@/lib/background";
import { ACTION_DESCRIPTIONS, ACTION_LABELS, actionSchemas, executeAction, toolsFor, type ActionContext, type ActionName } from "./actions";
import { analyzeTurn, heuristicAnalysis } from "./analysis";
import type { BusinessBundle } from "./business";
import { escalateConversation } from "./escalation";
import { buildSystemPrompt, slotLine } from "./prompt";
import { MIN_CONFIDENCE, searchKnowledge, toSourceRef } from "@/lib/kb/search";

type Bundle = NonNullable<BusinessBundle>;

/** Pre tool narration is short; anything longer is treated as the real reply and streamed. */
const HOLD_CHARS = 240;

const LANGUAGE_HINT = {
  en: "The latest customer message is in English. Reply in English.",
  hi: "The latest customer message is in Hindi (Devanagari). Reply in natural Hindi written in Devanagari script.",
  hinglish: "The latest customer message is in Hinglish. Reply in natural Hinglish written in Roman letters.",
} as const;

export async function startConversation(bundle: Bundle, channel: Channel, isEval = false) {
  const [conversation] = await db
    .insert(schema.conversations)
    .values({ businessId: bundle.business.id, channel, isEval })
    .returning();
  await emit("conversation.started", { businessId: bundle.business.id, conversationId: conversation.id }, { channel });
  return conversation;
}

export async function getConversation(bundle: Bundle, conversationId: string) {
  return (
    (await db.query.conversations.findFirst({
      where: and(eq(schema.conversations.id, conversationId), eq(schema.conversations.businessId, bundle.business.id)),
    })) ?? null
  );
}

/** Rebuilds model history from the database, replaying compact tool memory so ids survive across turns. */
async function loadHistory(conversationId: string): Promise<{ messages: ModelMessage[]; customerTexts: string[] }> {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(30);
  rows.reverse();
  const messages: ModelMessage[] = [];
  const customerTexts: string[] = [];
  for (const m of rows) {
    if (m.role === "customer") {
      messages.push({ role: "user", content: m.content });
      customerTexts.push(m.content);
    } else if (m.role === "agent" && m.meta.trace?.length) {
      messages.push(...(m.meta.trace as ModelMessage[]));
    } else if (m.role === "agent" || m.role === "human") {
      const prefix = m.role === "human" ? "[A human coordinator sent this] " : "";
      const memory = m.meta.memory ? `\n\n(Earlier tool results: ${m.meta.memory})` : "";
      messages.push({ role: "assistant", content: `${prefix}${m.content}${memory}` });
    }
  }
  // Anthropic requires alternating roles; merge consecutive messages of the same role.
  const merged: ModelMessage[] = [];
  for (const msg of messages) {
    const last = merged.at(-1);
    if (last && last.role === msg.role && typeof last.content === "string" && typeof msg.content === "string") {
      last.content = `${last.content}\n${msg.content}`;
    } else merged.push({ ...msg } as ModelMessage);
  }
  return { messages: merged, customerTexts };
}

type Steps = Awaited<ReturnType<typeof streamText>["steps"]>;

/** Rebuilds a provider neutral transcript of every step: text, tool calls and their JSON results. */
function traceFromSteps(steps: Steps): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const step of steps) {
    const content: Array<
      { type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
    > = [];
    // Planning text before tool calls is dropped so the model does not learn to narrate.
    if (step.text.trim() && step.toolCalls.length === 0) content.push({ type: "text", text: step.text });
    for (const call of step.toolCalls) content.push({ type: "tool-call", toolCallId: call.toolCallId, toolName: call.toolName, input: call.input });
    if (content.length) out.push({ role: "assistant", content });
    if (step.toolCalls.length) {
      // Every call needs a result on replay, including calls that threw, or the next turn is rejected.
      const errors = step.content.filter((p) => p.type === "tool-error");
      out.push({
        role: "tool",
        content: step.toolCalls.map((call) => {
          const result = step.toolResults.find((r) => r.toolCallId === call.toolCallId);
          const failure = errors.find((e) => e.toolCallId === call.toolCallId);
          return {
            type: "tool-result" as const,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: result
              ? { type: "json" as const, value: JSON.parse(JSON.stringify(result.output ?? null)) }
              : { type: "error-text" as const, value: failure ? String(failure.error) : "Tool did not return a result" },
          };
        }),
      });
    }
  }
  return out;
}

function memoryFor(name: ActionName, data: Record<string, unknown>, cards: Card[] | undefined): string | null {
  if (name === "check_availability" && cards?.[0]?.kind === "slots") {
    return `offered for ${cards[0].service}: ${cards[0].slots.map(slotLine).join("; ")}`;
  }
  if (name === "book_appointment" || name === "reschedule_appointment") return `appointmentId ${String(data.appointmentId)} at ${String(data.when)}`;
  if (name === "lookup_customer" && data.found) {
    const upcoming = (data.upcoming as Array<{ appointmentId: string; when: string; service: string | null }>) ?? [];
    return `customer ${String(data.name)}${upcoming.length ? `, upcoming: ${upcoming.map((u) => `${u.service} ${u.when} [appointmentId ${u.appointmentId}]`).join("; ")}` : ""}`;
  }
  if (name === "create_ticket") return `ticket ${String(data.reference)} opened`;
  if (name === "escalate_to_human") return "escalated to a human coordinator";
  return null;
}

export type TurnInput = {
  bundle: Bundle;
  conversationId: string;
  channel: Channel;
  text: string;
};

/**
 * Runs one customer turn and yields protocol events as they happen.
 * The same generator backs the chat widget, the eval harness and voice text fallback.
 */
export async function* runTurn(input: TurnInput): AsyncGenerator<StreamEvent> {
  const started = Date.now();
  const { bundle, conversationId, channel, text } = input;
  const businessId = bundle.business.id;
  const conversation = await getConversation(bundle, conversationId);
  if (!conversation) {
    yield { type: "error", message: "Conversation not found" };
    return;
  }

  const quick = heuristicAnalysis(text);
  const [customerMessage] = await db
    .insert(schema.messages)
    .values({ conversationId, role: "customer", content: text, meta: { language: quick.language } })
    .returning();
  const pending: Promise<unknown>[] = [
    emit("message.created", { businessId, conversationId }, { role: "customer", messageId: customerMessage.id }),
  ];

  // Retrieval runs in parallel with history loading so most questions need a single model call.
  const prefetchPromise = conversation.status === "human" ? null : searchKnowledge(businessId, text).catch(() => null);
  const { messages: history, customerTexts } = await loadHistory(conversationId);
  const analysisPromise = analyzeTurn(text, customerTexts.slice(0, -1));

  if (conversation.status === "human") {
    // A human owns this conversation: the AI stays silent and only drafts suggestions.
    await db.update(schema.conversations).set({ lastActivityAt: new Date() }).where(eq(schema.conversations.id, conversationId));
    yield { type: "handoff", reason: "human_active" };
    const analysis = await analysisPromise;
    await persistAnalysis(conversationId, businessId, customerMessage.id, analysis, conversation.sentiment);
    yield { type: "done", messageId: null, latencyMs: Date.now() - started, firstTokenMs: null };
    return;
  }

  const deferredCards: Promise<Card>[] = [];
  const ctx: ActionContext = { bundle, conversationId, channel, pending, deferredCards };
  const queue: StreamEvent[] = [];
  const cards: Card[] = [];
  const sources: SourceRef[] = [];
  const memories: string[] = [];
  const toolsUsed: string[] = [];

  const tools: ToolSet = Object.fromEntries(
    toolsFor(bundle.business.kind).map((name) => [
      name,
      tool({
        description: ACTION_DESCRIPTIONS[name],
        inputSchema: actionSchemas[name],
        execute: async (args: unknown) => {
          queue.push({ type: "tool", name, status: "start", label: ACTION_LABELS[name] });
          const result = await executeAction(ctx, name, args);
          toolsUsed.push(name);
          queue.push({ type: "tool", name, status: result.ok ? "done" : "error", label: ACTION_LABELS[name] });
          for (const card of result.cards ?? []) {
            cards.push(card);
            queue.push({ type: "card", card });
          }
          if (result.sources?.length) {
            for (const s of result.sources) if (!sources.some((x) => x.id === s.id)) sources.push(s);
            queue.push({ type: "sources", sources: result.sources });
          }
          const memory = memoryFor(name, result.data, result.cards);
          if (memory) memories.push(memory);
          return result.data;
        },
      }),
    ]),
  );

  const returning = conversation.customerId
    ? await db.query.customers.findFirst({ where: eq(schema.customers.id, conversation.customerId) })
    : null;

  const prefetched = await prefetchPromise;
  // A confident prefetch is recorded as a real search_knowledge call, so it is replayed on later turns too.
  const prelude: ModelMessage[] = [];
  if (prefetched && prefetched.confidence >= MIN_CONFIDENCE) {
    const top = prefetched.hits.filter((h) => h.score >= MIN_CONFIDENCE - 0.05).slice(0, 3);
    const toolCallId = `prefetch_${customerMessage.id.slice(0, 8)}`;
    prelude.push(
      { role: "assistant", content: [{ type: "tool-call", toolCallId, toolName: "search_knowledge", input: { query: text } }] },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId,
            toolName: "search_knowledge",
            output: { type: "json", value: { covered: true, guidance: "Answer only from these passages.", passages: top.map((h) => ({ title: h.title, text: h.content })) } },
          },
        ],
      },
    );
    const refs = top.map(toSourceRef);
    sources.push(...refs);
    yield { type: "sources", sources: refs };
  }

  const result = streamText({
    model: fastModel(),
    system: `${buildSystemPrompt(bundle, channel, returning ? { name: returning.name, lastContact: null } : undefined)}\n${LANGUAGE_HINT[quick.language]}`,
    messages: [...history, ...prelude],
    tools,
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1200,
    // Live turns trade deliberation for latency; the stage machine and tools keep it on rails.
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" }, thinking: { type: "disabled" } } },
  });

  let reply = "";
  let firstTokenMs: number | null = null;
  let failed = false;
  // Text that precedes a tool call is the model planning out loud ("let me check"), not an
  // answer. Each step's opening text is held back until it is long enough to clearly be a
  // reply, or the step ends without a tool call; if a tool call starts first it is dropped.
  let held = "";
  let streaming = false;
  const release = function* (): Generator<StreamEvent> {
    if (!held) return;
    if (firstTokenMs === null) firstTokenMs = Date.now() - started;
    const delta = reply && !/\s$/.test(reply) ? ` ${held}` : held;
    reply += delta;
    held = "";
    streaming = true;
    yield { type: "text", delta };
  };
  try {
    for await (const part of result.fullStream) {
      while (queue.length) yield queue.shift() as StreamEvent;
      if (part.type === "text-delta") {
        const delta = part.text.replace(/\u2014/g, ", ");
        if (streaming) {
          reply += delta;
          yield { type: "text", delta };
        } else {
          held += delta;
          if (held.length > HOLD_CHARS) yield* release();
        }
      } else if (part.type === "tool-input-start" || part.type === "tool-call") {
        held = "";
      } else if (part.type === "finish-step") {
        yield* release();
        streaming = false;
      } else if (part.type === "error") {
        failed = true;
        console.error("[runTurn] stream error", part.error);
      }
    }
  } catch (err) {
    failed = true;
    console.error("[runTurn]", err);
  }
  yield* release();
  while (queue.length) yield queue.shift() as StreamEvent;

  let trace: ModelMessage[] | undefined;
  try {
    trace = failed ? undefined : [...prelude, ...traceFromSteps(await result.steps)];
  } catch {
    trace = undefined;
  }

  reply = reply.trim();
  if (!reply) {
    trace = undefined;
    reply = failed
      ? "Sorry, I hit a problem on my side. I have flagged this for a coordinator who will follow up with you shortly."
      : "Done. Is there anything else I can help with?";
    yield { type: "text", delta: reply };
    if (failed) {
      await escalateConversation(ctx, { reason: "Agent error during turn", urgency: "medium", trigger: "other" });
    }
  }

  const latencyMs = Date.now() - started;
  const analysis = await analysisPromise;
  yield { type: "analysis", analysis };

  const [agentMessage] = await db
    .insert(schema.messages)
    .values({
      conversationId,
      role: "agent",
      content: reply,
      meta: {
        cards,
        sources,
        latencyMs,
        firstTokenMs: firstTokenMs ?? undefined,
        language: analysis.language,
        memory: memories.join(" | ") || undefined,
        tools: toolsUsed,
        trace,
      },
    })
    .returning();
  pending.push(emit("message.created", { businessId, conversationId }, { role: "agent", messageId: agentMessage.id }));

  const escalated = toolsUsed.includes("escalate_to_human");
  const guard = await persistAnalysis(conversationId, businessId, customerMessage.id, analysis, conversation.sentiment, {
    stage: stageFor(toolsUsed, conversation.stage),
    alreadyEscalated: escalated || conversation.status === "escalated",
    bundle,
  });
  if (guard) yield { type: "handoff", reason: guard };

  for (const settled of await Promise.allSettled(deferredCards)) {
    if (settled.status === "fulfilled") {
      cards.push(settled.value);
      yield { type: "card", card: settled.value };
    }
  }
  if (deferredCards.length) {
    await db.update(schema.messages).set({ meta: { ...agentMessage.meta, cards } }).where(eq(schema.messages.id, agentMessage.id));
  }
  await Promise.all(pending);
  const status = (await getConversation(bundle, conversationId))?.status ?? "active";
  yield { type: "conversation", conversationId, status };
  yield { type: "done", messageId: agentMessage.id, latencyMs, firstTokenMs };
}

function stageFor(tools: string[], current: string): string {
  if (tools.some((t) => ["book_appointment", "reschedule_appointment", "cancel_appointment", "create_ticket", "capture_lead"].includes(t))) return "execute";
  if (tools.includes("check_availability")) return "gather";
  if (tools.includes("lookup_customer") || tools.includes("upsert_customer")) return "identify";
  if (tools.includes("search_knowledge")) return "understand";
  return current === "greeting" ? "understand" : current;
}

/**
 * Stores per turn analysis and applies deterministic escalation rules, so safety
 * does not depend on the model remembering to call a tool. Returns a handoff reason if it escalated.
 */
export async function persistAnalysis(
  conversationId: string,
  businessId: string,
  customerMessageId: string,
  analysis: TurnAnalysis,
  previousSentiment: number,
  opts?: { stage: string; alreadyEscalated: boolean; bundle: Bundle },
): Promise<string | null> {
  // Exponential smoothing gives a sentiment trend rather than a single noisy reading.
  const sentiment = Number((previousSentiment * 0.4 + analysis.sentiment * 0.6).toFixed(2));
  await db
    .update(schema.messages)
    .set({ meta: { language: analysis.language, sentiment: analysis.sentiment, intent: analysis.intent } })
    .where(eq(schema.messages.id, customerMessageId));
  await db
    .update(schema.conversations)
    .set({
      sentiment,
      language: analysis.language,
      intent: analysis.intent,
      lastActivityAt: new Date(),
      ...(opts ? { stage: opts.stage } : {}),
    })
    .where(eq(schema.conversations.id, conversationId));
  await emit("conversation.updated", { businessId, conversationId }, { sentiment, language: analysis.language, intent: analysis.intent });

  if (!opts || opts.alreadyEscalated) return null;
  const ctx = { bundle: opts.bundle, conversationId };
  if (analysis.emergency) {
    await escalateConversation(ctx, { reason: "Possible emergency described by the customer", urgency: "critical", trigger: "emergency" });
    return "emergency";
  }
  if (analysis.wantsHuman) {
    await escalateConversation(ctx, { reason: "Customer asked for a person", urgency: "medium", trigger: "customer_request" });
    return "customer_request";
  }
  if (sentiment <= -0.55) {
    await escalateConversation(ctx, { reason: "Customer frustration trending negative", urgency: "high", trigger: "frustration" });
    return "frustration";
  }
  const lowConfidence = await repeatedLowConfidence(conversationId);
  if (lowConfidence) {
    await escalateConversation(ctx, { reason: "Knowledge base could not answer twice in a row", urgency: "low", trigger: "low_confidence" });
    return "low_confidence";
  }
  return null;
}

async function repeatedLowConfidence(conversationId: string): Promise<boolean> {
  const recent = await db
    .select({ output: schema.toolCalls.output })
    .from(schema.toolCalls)
    .where(and(eq(schema.toolCalls.conversationId, conversationId), eq(schema.toolCalls.name, "search_knowledge")))
    .orderBy(desc(schema.toolCalls.createdAt))
    .limit(2);
  return recent.length === 2 && recent.every((r) => (r.output as { covered?: boolean } | null)?.covered === false);
}

/** Marks a conversation finished, writes the summary and schedules recovery if it ended unresolved. */
export async function endConversation(bundle: Bundle, conversationId: string, reason: "completed" | "abandoned") {
  const conversation = await getConversation(bundle, conversationId);
  if (!conversation || conversation.endedAt) return;
  const actions = await db
    .select({ name: schema.toolCalls.name })
    .from(schema.toolCalls)
    .where(and(eq(schema.toolCalls.conversationId, conversationId), eq(schema.toolCalls.ok, true)));
  const resolvedActions = ["book_appointment", "reschedule_appointment", "cancel_appointment", "create_ticket", "capture_lead", "search_knowledge"];
  const didSomething = actions.some((a) => resolvedActions.includes(a.name));
  const escalated = conversation.status === "escalated" || conversation.status === "human";
  const status = escalated ? conversation.status : reason === "abandoned" && !didSomething ? "abandoned" : "resolved";
  await db
    .update(schema.conversations)
    .set({ status, endedAt: new Date(), resolvedByAi: escalated ? false : didSomething })
    .where(eq(schema.conversations.id, conversationId));
  await emit("conversation.updated", { businessId: bundle.business.id, conversationId }, { status });
  await runAfter(async () => {
    const { summarizeConversation } = await import("./summary");
    const summary = await summarizeConversation(conversationId);
    if (status === "abandoned" && conversation.customerId) {
      const customer = await db.query.customers.findFirst({ where: eq(schema.customers.id, conversation.customerId) });
      const { createFollowUp } = await import("./actions");
      await createFollowUp(
        { bundle, conversationId, channel: conversation.channel },
        {
          customerId: conversation.customerId,
          kind: "recovery",
          channel: customer?.email ? "email" : "call",
          dueAt: new Date(Date.now() + 15 * 60_000),
          subject: `Still need help with ${summary?.headline.toLowerCase() ?? "your request"}?`,
          body: `Hi ${customer?.name ?? "there"}, it looks like we got cut off. Reply here or tap the link to pick up where we left off. ${summary?.nextStep ?? ""}`.trim(),
        },
      );
    }
  });
}

export async function listMessages(conversationId: string) {
  return db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(asc(schema.messages.createdAt));
}
