import { GoogleGenAI, Modality, type LiveServerMessage, type FunctionResponse } from "@google/genai";
import { loadBusiness } from "@/lib/agent/business";
import { executeAction } from "@/lib/agent/actions";
import { startConversation } from "@/lib/agent/run";
import { CALL_CONNECTED_CUE } from "@/lib/voice/protocol";
import { isActionName, mintVoiceToken } from "@/lib/voice/server";

/**
 * End to end check of the voice brain without a browser: mints an ephemeral token,
 * connects with it, greets, asks for a slot in Hinglish and runs the tool through executeAction.
 * Usage: tsx --env-file=.env.local scripts/voice-smoke.ts [slug]
 */
const slug = process.argv[2] ?? "kesar";
const bundle = await loadBusiness(slug);
if (!bundle) throw new Error(`No business ${slug}`);
const conversation = await startConversation(bundle, "voice", true);

const t0 = Date.now();
const { token, model } = await mintVoiceToken(bundle, Number(process.env.VOICE_ATTEMPT ?? 0));
console.log(`token minted in ${Date.now() - t0} ms (${token.slice(0, 12)}...)`);

const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
const run: { phase: "greeting" | "question" | "done" } = { phase: "greeting" };
let audioBytes = 0;
let firstAudioAt: number | null = null;
let askedAt = 0;
let transcript = "";
const toolsCalled: string[] = [];
let resolveDone: () => void = () => {};
const done = new Promise<void>((r) => (resolveDone = r));

const session = await ai.live.connect({
  model,
  config: { responseModalities: [Modality.AUDIO] },
  callbacks: {
    onmessage: (msg: LiveServerMessage) => void onMessage(msg),
    onerror: (e) => console.error("socket error", e.message),
    onclose: (e) => {
      console.log(`closed code=${e.code} reason=${e.reason}`);
      resolveDone();
    },
  },
});

async function onMessage(msg: LiveServerMessage) {
  const content = msg.serverContent;
  for (const part of content?.modelTurn?.parts ?? []) {
    if (part.inlineData?.data) {
      if (firstAudioAt === null) firstAudioAt = Date.now();
      audioBytes += Buffer.from(part.inlineData.data, "base64").length;
    }
  }
  if (content?.outputTranscription?.text) transcript += content.outputTranscription.text;
  if (msg.toolCall?.functionCalls?.length) {
    const responses: FunctionResponse[] = [];
    for (const call of msg.toolCall.functionCalls) {
      const name = call.name ?? "";
      toolsCalled.push(name);
      console.log(`  toolCall ${name} ${JSON.stringify(call.args)}`);
      if (!isActionName(name)) {
        responses.push({ id: call.id, name, response: { error: "unknown_tool" } });
        continue;
      }
      const started = Date.now();
      const result = await executeAction({ bundle: bundle!, conversationId: conversation.id, channel: "voice" }, name, call.args ?? {});
      console.log(`  -> ok=${result.ok} in ${Date.now() - started} ms, cards=${(result.cards ?? []).map((c) => c.kind).join(",") || "none"}`);
      responses.push({ id: call.id, name, response: result.data });
    }
    session.sendToolResponse({ functionResponses: responses });
  }
  if (content?.turnComplete) {
    console.log(`[${run.phase}] agent said: ${transcript.trim()}`);
    console.log(`[${run.phase}] audio ${audioBytes} bytes, first audio after ${firstAudioAt ? firstAudioAt - askedAt : "n/a"} ms`);
    if (run.phase === "greeting") {
      run.phase = "question";
      transcript = "";
      audioBytes = 0;
      firstAudioAt = null;
      askedAt = Date.now();
      session.sendClientContent({ turns: "Kal shaam teeth cleaning ka slot hai kya?", turnComplete: true });
    } else if (run.phase === "question" && toolsCalled.length > 0) {
      run.phase = "done";
      session.close();
    }
  }
}

askedAt = Date.now();
session.sendClientContent({ turns: CALL_CONNECTED_CUE, turnComplete: true });
const timeout = setTimeout(() => {
  console.error("timed out after 60 s");
  session.close();
}, 60_000);
await done;
clearTimeout(timeout);
console.log(`tools called: ${toolsCalled.join(", ") || "none"}`);
const ok = toolsCalled.includes("check_availability") && run.phase === "done";
console.log(ok ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(ok ? 0 : 1);
