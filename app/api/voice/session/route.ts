import { loadBusiness } from "@/lib/agent/business";
import { getConversation, startConversation } from "@/lib/agent/run";
import { error, json } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { voiceSessionRequestSchema, type VoiceSessionResponse } from "@/lib/voice/protocol";
import { mintVoiceToken } from "@/lib/voice/server";

/** Starts a voice call: opens the conversation and hands the browser a locked, single use Gemini token. */
export async function POST(req: Request) {
  if (!rateLimit(`voice-session:${clientKey(req)}`, 8, 60_000)) {
    return error(429, "Too many calls in a minute. Please wait a moment and try again.");
  }
  const body = voiceSessionRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return error(400, "Invalid request");
  const bundle = await loadBusiness(body.data.business);
  if (!bundle) return error(404, "Unknown business");

  let token: Awaited<ReturnType<typeof mintVoiceToken>>;
  try {
    token = await mintVoiceToken(bundle, body.data.attempt);
  } catch (err) {
    console.error("[voice/session] token mint failed", err);
    return error(502, "The voice line is unavailable right now. Chat is still open.");
  }
  const existing = body.data.conversationId ? await getConversation(bundle, body.data.conversationId) : null;
  const conversation = existing && !existing.endedAt ? existing : await startConversation(bundle, "voice");
  const response: VoiceSessionResponse = {
    conversationId: conversation.id,
    token: token.token,
    model: token.model,
    agentName: bundle.business.persona.agentName,
    businessName: bundle.business.name,
    greeting: bundle.business.persona.greeting,
  };
  return json(response, { headers: { "Cache-Control": "no-store" } });
}
