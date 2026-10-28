import { z } from "zod";
import type { Card, ConversationStatus } from "@/lib/contracts";

/** Wire contracts for /api/voice/*, shared by the route handlers and the browser client. */

export const voiceSessionRequestSchema = z.object({
  business: z.string().min(1).max(80),
  /** Present when reconnecting a dropped call, so it continues the same conversation. */
  conversationId: z.string().uuid().optional(),
  attempt: z.number().int().min(0).max(8).default(0),
});

export type VoiceSessionResponse = {
  conversationId: string;
  token: string;
  model: string;
  agentName: string;
  businessName: string;
  greeting: string;
};

export const voiceToolRequestSchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(64),
  args: z.record(z.string(), z.unknown()).default({}),
});

/**
 * The tool route streams NDJSON: one `result` line as soon as the action finishes
 * (so Gemini is unblocked immediately), then `card` lines for slow side effects like email.
 */
export type VoiceToolStreamLine =
  | { type: "result"; ok: boolean; data: Record<string, unknown>; cards: Card[] }
  | { type: "card"; card: Card };

export const voiceTurnRequestSchema = z.object({
  conversationId: z.string().uuid(),
  customerText: z.string().max(4000).default(""),
  agentText: z.string().max(4000).default(""),
  latencyMs: z.number().int().min(0).max(120_000).nullable().default(null),
  interrupted: z.boolean().default(false),
});
export type VoiceTurnRequest = z.input<typeof voiceTurnRequestSchema>;

export type VoiceTurnResponse = {
  status: ConversationStatus;
  handoff: string | null;
};

/** Text sent as the first client turn so the agent opens the call with its greeting. */
export const CALL_CONNECTED_CUE = "(call connected)";
export const CALL_RESUMED_CUE = "(call reconnected)";
