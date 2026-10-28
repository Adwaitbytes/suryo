import { generateText, Output } from "ai";
import { z } from "zod";
import { CLASSIFIER_OPTIONS, classifierModel } from "@/lib/ai/models";
import type { Language, TurnAnalysis } from "@/lib/contracts";

const analysisSchema = z.object({
  language: z.enum(["en", "hi", "hinglish"]),
  sentiment: z.number().min(-1).max(1).describe("-1 furious, 0 neutral, 1 delighted"),
  intent: z.enum(["faq", "book", "reschedule", "cancel", "billing", "complaint", "lead", "emergency", "medical_advice", "human_request", "smalltalk", "other"]),
  emergency: z.boolean(),
  wantsHuman: z.boolean(),
});

const HINGLISH = /\b(hai|hain|kya|kal|parso|aaj|mujhe|mera|meri|nahi|nahin|haan|ji|kitna|kitne|kab|chahiye|karna|karo|kijiye|baje|shaam|subah|bhai|yaar|accha|theek|wala|wali|ko|se|ka|ki)\b/gi;
const EMERGENCY = /(bleeding|blood won'?t stop|can'?t breathe|cannot breathe|difficulty breathing|swelling.*(throat|breath|eye)|unconscious|faint|chest pain|accident|knocked out|khoon|saans|behosh|bahut dard|severe pain)/i;
const HUMAN = /(human|real person|manager|supervisor|insaan|kisi se baat|staff se baat|talk to (a )?person|agent se nahi)/i;
const NEGATIVE = /(worst|terrible|useless|pathetic|angry|furious|ridiculous|fraud|scam|cheat|bakwas|bekaar|ghatiya|refund now|disgusting|never again|wtf|nonsense)/i;

export function detectLanguage(text: string): Language {
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  const hits = text.match(HINGLISH)?.length ?? 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  return hits >= 2 || (words > 0 && hits / words > 0.25) ? "hinglish" : "en";
}

/** Fast deterministic analysis used immediately and as a fallback if the classifier fails. */
export function heuristicAnalysis(text: string): TurnAnalysis {
  const negative = NEGATIVE.test(text) || /!{2,}/.test(text) || (text.length > 12 && text === text.toUpperCase() && /[A-Z]/.test(text));
  return {
    language: detectLanguage(text),
    sentiment: negative ? -0.7 : 0,
    intent: EMERGENCY.test(text) ? "emergency" : HUMAN.test(text) ? "human_request" : "other",
    emergency: EMERGENCY.test(text),
    wantsHuman: HUMAN.test(text),
  };
}

export async function analyzeTurn(text: string, previous: string[]): Promise<TurnAnalysis> {
  const fallback = heuristicAnalysis(text);
  try {
    const { output } = await generateText({
      model: classifierModel(),
      output: Output.object({ schema: analysisSchema }),
      providerOptions: CLASSIFIER_OPTIONS,
      abortSignal: AbortSignal.timeout(4000),
      system:
        "Classify the latest customer message to a clinic front desk. language: en, hi (Devanagari) or hinglish (Hindi in Roman letters). emergency only for urgent physical danger. wantsHuman only if they ask for a person.",
      prompt: `Earlier customer messages:\n${previous.slice(-3).join("\n") || "(none)"}\n\nLatest: ${text}`,
    });
    return {
      ...output,
      // The deterministic script check is more reliable than the model for Devanagari.
      language: fallback.language === "hi" ? "hi" : output.language,
      emergency: output.emergency || fallback.emergency,
      wantsHuman: output.wantsHuman || fallback.wantsHuman,
      sentiment: Math.min(output.sentiment, fallback.sentiment),
    };
  } catch {
    return fallback;
  }
}
