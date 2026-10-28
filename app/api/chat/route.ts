import { loadBusiness } from "@/lib/agent/business";
import { getConversation, runTurn, startConversation } from "@/lib/agent/run";
import { chatRequestSchema, type StreamEvent } from "@/lib/contracts";
import { error, ndjson } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!rateLimit(`chat:${clientKey(req)}`, 40, 60_000)) return error(429, "Too many messages, slow down a little.");
  const body = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return error(400, "Invalid request");
  const bundle = await loadBusiness(body.data.business);
  if (!bundle) return error(404, "Unknown business");

  let conversationId = body.data.conversationId;
  if (conversationId && !(await getConversation(bundle, conversationId))) conversationId = undefined;

  async function* events(): AsyncGenerator<StreamEvent> {
    if (!conversationId) {
      const conversation = await startConversation(bundle!, body.data!.channel, body.data!.isEval ?? false);
      conversationId = conversation.id;
      yield { type: "conversation", conversationId, status: "active" };
    }
    yield* runTurn({ bundle: bundle!, conversationId, channel: body.data!.channel, text: body.data!.message.trim() });
  }
  return ndjson(events());
}
