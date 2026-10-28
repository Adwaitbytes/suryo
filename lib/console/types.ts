import type { Analytics } from "@/lib/analytics";
import type {
  Channel,
  ConsoleEventType,
  ConversationStatus,
  ConversationSummary,
  MessageMeta,
} from "@/lib/contracts";

/*
 * Wire types for the operator console. Every date is an ISO string so the
 * shapes are identical on the server and after JSON parsing in the browser.
 */

export type Urgency = "low" | "medium" | "high" | "critical";
export type EscalationStatus = "open" | "claimed" | "resolved";

export type BusinessOption = { id: string; slug: string; name: string; kind: "clinic" | "generic" | "store"; isDemo: boolean; agentName: string };

export type LiveConversation = {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  stage: string;
  language: string;
  intent: string | null;
  sentiment: number;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  headline: string | null;
  messageCount: number;
  lastMessage: { role: string; content: string } | null;
  escalation: { id: string; urgency: Urgency; status: EscalationStatus } | null;
  startedAt: string;
  lastActivityAt: string;
  endedAt: string | null;
};

export type QueueEscalation = {
  id: string;
  conversationId: string;
  reason: string;
  trigger: string;
  urgency: Urgency;
  summary: string;
  status: EscalationStatus;
  claimedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  channel: Channel;
  conversationStatus: ConversationStatus;
  customerName: string | null;
  customerPhone: string | null;
};

export type ConsoleEvent = {
  id: number;
  type: ConsoleEventType;
  conversationId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ActivityItem = ConsoleEvent & { customerName: string | null; channel: Channel | null };

export type Snapshot = {
  business: BusinessOption;
  conversations: LiveConversation[];
  escalations: QueueEscalation[];
  activity: ActivityItem[];
  analytics: Analytics;
  lastEventId: number;
  serverTime: string;
};

export type TranscriptMessage = {
  id: string;
  role: "customer" | "agent" | "human" | "system";
  content: string;
  meta: Omit<MessageMeta, "trace" | "memory">;
  createdAt: string;
};

export type ToolCallRow = {
  id: string;
  name: string;
  ok: boolean;
  durationMs: number;
  input: unknown;
  createdAt: string;
};

export type ConversationDetail = {
  conversation: LiveConversation & { summary: ConversationSummary | null; resolvedByAi: boolean | null };
  customer: { id: string; name: string | null; phone: string | null; email: string | null; language: string | null } | null;
  messages: TranscriptMessage[];
  toolCalls: ToolCallRow[];
  escalation: QueueEscalation | null;
};

export type EscalationQueue = { open: QueueEscalation[]; resolved: QueueEscalation[] };

export type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  conversations: number;
  appointments: number;
  openTickets: number;
  lastContactAt: string | null;
  createdAt: string;
};

export type TimelineItem =
  | {
      kind: "conversation";
      id: string;
      at: string;
      channel: Channel;
      status: ConversationStatus;
      intent: string | null;
      summary: ConversationSummary | null;
    }
  | {
      kind: "appointment";
      id: string;
      at: string;
      startsAt: string;
      status: BookingRow["status"];
      service: string | null;
      staff: string | null;
      priceInr: number | null;
    }
  | { kind: "ticket"; id: string; at: string; category: string; priority: TicketRow["priority"]; status: TicketRow["status"]; summary: string }
  | { kind: "lead"; id: string; at: string; interest: string; score: number; status: LeadRow["status"] }
  | { kind: "followup"; id: string; at: string; dueAt: string; followUpKind: string; channel: string; status: FollowUpRow["status"]; subject: string };

export type CustomerDetail = {
  customer: { id: string; name: string | null; phone: string | null; email: string | null; language: string | null; notes: string | null; createdAt: string };
  timeline: TimelineItem[];
};

export type BookingRow = {
  id: string;
  status: "confirmed" | "cancelled" | "rescheduled" | "completed";
  startsAt: string;
  createdAt: string;
  priceInr: number | null;
  service: string | null;
  staff: string | null;
  location: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  conversationId: string | null;
  channel: Channel | null;
};

export type TicketRow = {
  id: string;
  reference: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "pending" | "resolved";
  summary: string;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  conversationId: string | null;
};

export type LeadRow = {
  id: string;
  interest: string;
  budget: string | null;
  timeline: string | null;
  score: number;
  status: "new" | "contacted" | "qualified" | "won" | "lost";
  notes: string | null;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  conversationId: string | null;
};

export type FollowUpRow = {
  id: string;
  kind: "reminder" | "recovery" | "callback" | "post_visit" | "lead_nurture";
  channel: "email" | "whatsapp" | "call";
  status: "pending" | "sent" | "failed" | "cancelled";
  dueAt: string;
  sentAt: string | null;
  subject: string;
  body: string;
  error: string | null;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  customerContact: string | null;
  conversationId: string | null;
};

export type { Analytics };
