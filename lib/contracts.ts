import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Business                                                            */
/* ------------------------------------------------------------------ */

export const businessHoursSchema = z.object({
  day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  open: z.string().describe("24h HH:mm, empty when closed"),
  close: z.string().describe("24h HH:mm, empty when closed"),
});

export const businessProfileSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  industry: z.string(),
  services: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      price: z.string().describe("Price exactly as published, or empty if not published"),
    }),
  ),
  hours: z.array(businessHoursSchema),
  locations: z.array(z.object({ name: z.string(), address: z.string() })),
  contact: z.object({ phone: z.string(), email: z.string(), whatsapp: z.string() }),
  bookingRules: z.array(z.string()),
  bookableOffering: z
    .string()
    .describe("What the agent can book, for example 'Consultation' or 'Strategy call'"),
  toneOfVoice: z.string(),
  languages: z.array(z.string()),
});

export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const personaSchema = z.object({
  agentName: z.string(),
  greeting: z.string().describe("Spoken greeting, one or two short sentences"),
  style: z.string(),
  voice: z.string().describe("Gemini Live prebuilt voice name"),
});

export type Persona = z.infer<typeof personaSchema>;

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */

export const CONVERSATION_STAGES = [
  "greeting",
  "identify",
  "understand",
  "gather",
  "confirm",
  "execute",
  "close",
] as const;
export type ConversationStage = (typeof CONVERSATION_STAGES)[number];

export type Channel = "voice" | "chat";
export type ConversationStatus = "active" | "escalated" | "human" | "resolved" | "abandoned";
export type Language = "en" | "hi" | "hinglish";

export type SourceRef = { id: string; title: string; url: string | null; score: number };

/** Rich cards the agent can attach to a message; rendered by chat and the call screen. */
export type Card =
  | {
      kind: "slots";
      service: string;
      slots: Array<{ slotId: string; startsAt: string; staff: string; location: string | null }>;
    }
  | {
      kind: "booking";
      appointmentId: string;
      service: string;
      staff: string;
      startsAt: string;
      location: string | null;
      priceInr: number | null;
      status: "confirmed" | "cancelled" | "rescheduled";
    }
  | { kind: "ticket"; ticketId: string; category: string; priority: string; summary: string }
  | { kind: "lead"; leadId: string; interest: string; score: number }
  | { kind: "escalation"; urgency: string; reason: string }
  | { kind: "email"; to: string; subject: string; status: "sent" | "failed" | "skipped" }
  | { kind: "followup"; dueAt: string; kind_: string };

export type MessageMeta = {
  sources?: SourceRef[];
  cards?: Card[];
  latencyMs?: number;
  firstTokenMs?: number;
  language?: Language;
  sentiment?: number;
  intent?: string;
  suggested?: boolean;
  operator?: string;
  /** Compact record of tool outcomes (offered slot ids, appointment ids) replayed into later turns. */
  memory?: string;
  tools?: string[];
};

export type ConversationSummary = {
  headline: string;
  bullets: string[];
  outcome: "booked" | "ticket" | "lead" | "answered" | "escalated" | "unresolved";
  nextStep: string;
};

export type TurnAnalysis = {
  language: Language;
  sentiment: number;
  intent: string;
  emergency: boolean;
  wantsHuman: boolean;
};

/* ------------------------------------------------------------------ */
/* Streaming protocol shared by chat widget, call screen and evals     */
/* ------------------------------------------------------------------ */

export type StreamEvent =
  | { type: "conversation"; conversationId: string; status: ConversationStatus }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; status: "start" | "done" | "error"; label: string }
  | { type: "card"; card: Card }
  | { type: "sources"; sources: SourceRef[] }
  | { type: "analysis"; analysis: TurnAnalysis }
  | { type: "handoff"; reason: string }
  | { type: "done"; messageId: string | null; latencyMs: number; firstTokenMs: number | null }
  | { type: "error"; message: string };

export const chatRequestSchema = z.object({
  business: z.string().min(1).max(80),
  conversationId: z.string().uuid().optional(),
  channel: z.enum(["voice", "chat"]).default("chat"),
  message: z.string().min(1).max(2000),
  isEval: z.boolean().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/* ------------------------------------------------------------------ */
/* Console realtime events                                             */
/* ------------------------------------------------------------------ */

export type ConsoleEventType =
  | "conversation.started"
  | "conversation.updated"
  | "message.created"
  | "tool.called"
  | "appointment.changed"
  | "ticket.created"
  | "lead.created"
  | "escalation.created"
  | "escalation.updated"
  | "followup.changed"
  | "notification.sent";

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export type EvalCategory =
  | "faq"
  | "booking"
  | "reschedule"
  | "cancel"
  | "ambiguity"
  | "out_of_scope"
  | "escalation"
  | "safety"
  | "injection"
  | "language"
  | "lead"
  | "ticket";

export type ExpectedDbState =
  | { kind: "appointment"; status: "confirmed" | "cancelled" | "rescheduled" }
  | { kind: "no_appointment" }
  | { kind: "ticket" }
  | { kind: "lead" }
  | { kind: "escalation" }
  | { kind: "no_escalation" };

export type EvalScenario = {
  id: string;
  category: EvalCategory;
  title: string;
  persona: string;
  goal: string;
  language: Language;
  maxTurns: number;
  /** Optional deterministic seed applied before the run, for example a booking to cancel. */
  setup?: "existing_booking" | "returning_customer" | "fully_booked_day";
  expect: {
    tools?: string[];
    forbiddenTools?: string[];
    db?: ExpectedDbState[];
    mustMention?: string[];
    mustNotMention?: string[];
  };
  rubric: string;
};

export type EvalCheck = { name: string; passed: boolean; detail: string };
export type EvalTurn = {
  role: "customer" | "agent";
  content: string;
  tools?: string[];
  latencyMs?: number;
};
