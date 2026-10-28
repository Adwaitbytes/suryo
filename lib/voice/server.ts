import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  type FunctionDeclaration,
  type LiveConnectConfig,
} from "@google/genai";
import { z } from "zod";
import { ACTION_DESCRIPTIONS, ACTION_NAMES, actionSchemas, type ActionName } from "@/lib/agent/actions";
import type { BusinessBundle } from "@/lib/agent/business";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { VOICE_MODEL } from "@/lib/ai/models";
import { env } from "@/lib/env";
import { CALL_CONNECTED_CUE } from "./protocol";

type Bundle = NonNullable<BusinessBundle>;

/** Gemini's function schema accepts a JSON Schema subset; these keys are noise or unsupported there. */
const STRIPPED_KEYS = new Set(["$schema", "additionalProperties", "$id", "$defs", "definitions"]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (!STRIPPED_KEYS.has(key)) out[key] = stripUnsupported(value);
    }
    return out;
  }
  return node;
}

/** One tool layer for every channel: the same zod schemas the chat agent uses, exported as JSON Schema. */
export function voiceFunctionDeclarations(): FunctionDeclaration[] {
  return ACTION_NAMES.map((name) => ({
    name,
    description: ACTION_DESCRIPTIONS[name],
    // "input" mode keeps fields with defaults optional, matching what executeAction accepts.
    parametersJsonSchema: stripUnsupported(z.toJSONSchema(actionSchemas[name], { io: "input" })),
  }));
}

export function isActionName(name: string): name is ActionName {
  return (ACTION_NAMES as string[]).includes(name);
}

function voiceSystemInstruction(bundle: Bundle): string {
  const persona = bundle.business.persona;
  return `${buildSystemPrompt(bundle, "voice")}

CALL FLOW
- The call starts with the message "${CALL_CONNECTED_CUE}". Reply only with your greeting, in English: "${persona.greeting}"
- Tools run while the caller waits in silence, so call them straight away and speak once you have the answer.
- After check_availability, say one or two specific options out loud, for example "Thursday at 5 PM with Dr. Mehta at Vijay Nagar". Never just say that slots exist.
- Tool results contain ids. Use them in later tool calls, but never say an id out loud.`;
}

export function liveConnectConfig(bundle: Bundle): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: voiceSystemInstruction(bundle),
    tools: [{ functionDeclarations: voiceFunctionDeclarations() }],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: bundle.business.persona.voice } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 120,
        // Short enough to feel snappy, long enough not to cut off a caller pausing mid sentence.
        silenceDurationMs: 550,
      },
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    },
    // Lets calls run past the raw audio context limit by sliding older turns out.
    contextWindowCompression: { slidingWindow: {} },
  };
}

const TOKEN_TTL_MS = 30 * 60_000;
const NEW_SESSION_WINDOW_MS = 2 * 60_000;

/**
 * Mints a single use ephemeral token with the model, prompt and tools locked server side,
 * so the browser never sees the API key and cannot repurpose the session.
 */
export async function mintVoiceToken(bundle: Bundle): Promise<{ token: string; model: string }> {
  const ai = new GoogleGenAI({ apiKey: env().GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const now = Date.now();
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + TOKEN_TTL_MS).toISOString(),
      newSessionExpireTime: new Date(now + NEW_SESSION_WINDOW_MS).toISOString(),
      liveConnectConstraints: { model: VOICE_MODEL, config: liveConnectConfig(bundle) },
      httpOptions: { apiVersion: "v1alpha" },
    },
  });
  if (!token.name) throw new Error("Gemini returned an auth token without a name");
  return { token: token.name, model: VOICE_MODEL };
}

/** Compact record of tool outcomes so a chat continuation can still refer to slots and bookings. */
export function memoryFromToolCalls(calls: Array<{ name: string; ok: boolean; output: unknown }>): string | undefined {
  const lines: string[] = [];
  for (const call of calls) {
    if (!call.ok || call.name === "search_knowledge") continue;
    const text = JSON.stringify(call.output ?? null);
    lines.push(`${call.name}: ${text.length > 600 ? `${text.slice(0, 600)}...` : text}`);
  }
  return lines.join(" | ") || undefined;
}

export function stageForTools(tools: string[], current: string): string {
  if (tools.some((t) => ["book_appointment", "reschedule_appointment", "cancel_appointment", "create_ticket", "capture_lead"].includes(t))) return "execute";
  if (tools.includes("check_availability")) return "gather";
  if (tools.includes("lookup_customer") || tools.includes("upsert_customer")) return "identify";
  if (tools.includes("search_knowledge")) return "understand";
  return current === "greeting" ? "understand" : current;
}
