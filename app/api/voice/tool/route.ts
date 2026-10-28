import { eq } from "drizzle-orm";
import { executeAction, type ActionContext } from "@/lib/agent/actions";
import { loadBusiness } from "@/lib/agent/business";
import type { Card } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import { error } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { voiceToolRequestSchema, type VoiceToolStreamLine } from "@/lib/voice/protocol";
import { isActionName } from "@/lib/voice/server";

export const maxDuration = 60;

/**
 * Runs a Gemini function call through the shared action layer. The result line is flushed
 * first so the caller is not kept waiting on email delivery; late cards follow on the same stream.
 */
export async function POST(req: Request) {
  if (!rateLimit(`voice-tool:${clientKey(req)}`, 60, 60_000)) return error(429, "Too many requests");
  const body = voiceToolRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return error(400, "Invalid request");
  const { conversationId, name, args } = body.data;
  if (!isActionName(name)) return error(400, "Unknown tool");

  const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, conversationId) });
  if (!conversation || conversation.endedAt) return error(404, "Conversation not found");
  if (conversation.channel !== "voice") return error(400, "Not a voice conversation");
  const bundle = await loadBusiness(conversation.businessId);
  if (!bundle) return error(404, "Unknown business");

  const pending: Promise<unknown>[] = [];
  const deferredCards: Promise<Card>[] = [];
  const ctx: ActionContext = { bundle, conversationId, channel: "voice", pending, deferredCards };
  const result = await executeAction(ctx, name, args);

  const encoder = new TextEncoder();
  const line = (value: VoiceToolStreamLine) => encoder.encode(`${JSON.stringify(value)}\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line({ type: "result", ok: result.ok, data: result.data, cards: result.cards ?? [] }));
      for (const settled of await Promise.allSettled(deferredCards)) {
        if (settled.status === "fulfilled") controller.enqueue(line({ type: "card", card: settled.value }));
        else console.error("[voice/tool] deferred card failed", settled.reason);
      }
      for (const settled of await Promise.allSettled(pending)) {
        if (settled.status === "rejected") console.error("[voice/tool] audit write failed", settled.reason);
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
