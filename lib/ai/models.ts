import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/lib/env";

const anthropic = () => createAnthropic({ apiKey: env().ANTHROPIC_API_KEY });
const google = () => createGoogleGenerativeAI({ apiKey: env().GEMINI_API_KEY });

/** Live customer turns: lowest latency model that still calls tools reliably. */
export const fastModel = () => anthropic()("claude-haiku-5-5");
/** Onboarding extraction, summaries and the evaluation judge. */
export const strongModel = () => anthropic()("claude-sonnet-5-5");
/**
 * Cheap per turn classification and drafting. Claude Haiku rather than a free tier
 * model, because free tier quotas ran out under eval load and silently degraded analysis.
 */
export const classifierModel = () => anthropic()("claude-haiku-5-5");
/** Provider options for classifier calls: no extended thinking, these are short structured jobs. */
export const CLASSIFIER_OPTIONS = { anthropic: { thinking: { type: "disabled" as const } } };
export const embeddingModel = () => google().embeddingModel("gemini-embedding-001");

export const VOICE_MODEL = "gemini-3.1-flash-live-preview";
