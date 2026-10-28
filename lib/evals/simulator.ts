import { generateText, Output } from "ai";
import { z } from "zod";
import { CLASSIFIER_OPTIONS, classifierModel } from "@/lib/ai/models";
import type { EvalTurn } from "@/lib/contracts";
import type { ScenarioDef } from "./scenarios";
import type { SetupState } from "./setup";

const nextTurnSchema = z.object({
  done: z.boolean().describe("True when your goal is achieved, clearly impossible, or you were handed to a human and have nothing to add"),
  message: z.string().describe("Your next message to the agent. Empty when done is true"),
});

const LANGUAGE_RULES: Record<ScenarioDef["language"], string> = {
  en: "Write in plain English.",
  hinglish: "Write in Hinglish: Hindi words in Roman letters mixed with English, like a typical Indore WhatsApp message. Never use Devanagari.",
  hi: "Write only in Hindi using Devanagari script. Digits for phone numbers are fine.",
};

/** The simulated customer: the cheap classifier model with thinking off, one short structured turn. */
export async function nextCustomerTurn(scenario: ScenarioDef, state: SetupState, transcript: EvalTurn[]): Promise<{ done: boolean; message: string }> {
  const { identity } = state;
  const system = `You are role playing a customer chatting with the front desk assistant of Kesar Dental & Skin, a clinic in Indore. Stay in character. You are testing the assistant, but never say so.
Persona: ${scenario.persona}
Goal: ${scenario.goal}
Your details, share only when asked: name ${identity.name}, phone ${identity.phone}.
${state.facts.join("\n")}
Rules:
- ${LANGUAGE_RULES[scenario.language]}
- One short message per turn, like a real chat user (under 30 words). No stage directions.
- Answer the assistant's questions. When it reads back details that match your goal and asks to confirm, say yes clearly.
- If it offers a slot that fits your goal, accept it. Do not invent new requirements.
- Set done to true once the assistant has confirmed your goal is completed (booked, cancelled, rescheduled, ticket or callback recorded, question answered), or a human handover has been arranged, or the assistant has clearly refused and repeating will not help.`;
  const history = transcript.map((t) => `${t.role === "customer" ? "You" : "Assistant"}: ${t.content}`).join("\n");
  const generate = () =>
    generateText({
    model: classifierModel(),
    providerOptions: CLASSIFIER_OPTIONS,
    output: Output.object({ schema: nextTurnSchema }),
    system,
    prompt: `Conversation so far:\n${history}\n\nWrite your next message, or set done.`,
    maxOutputTokens: 500,
    abortSignal: AbortSignal.timeout(30_000),
  });
  // One retry: a dropped structured response would otherwise end a scenario that the agent did nothing wrong in.
  const { output } = await generate().catch(() => generate());
  return { done: output.done || !output.message.trim(), message: output.message.trim() };
}
