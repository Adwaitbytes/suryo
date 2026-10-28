import type { Card, ConversationStatus, SourceRef, StreamEvent } from "@/lib/contracts";

export type Role = "customer" | "agent" | "human" | "system";

export type ToolStep = { id: string; name: string; label: string; status: "start" | "done" | "error" };

export type ChatMessage = {
  /** Server id when known; local ids are prefixed with "local:". */
  id: string;
  /** Stable React key; survives the local id being swapped for the server id. */
  key: string;
  role: Role;
  content: string;
  cards: Card[];
  sources: SourceRef[];
  tools: ToolStep[];
  state: "streaming" | "done" | "error";
  createdAt: string;
  /** The customer text that produced this agent message, kept so a failed turn can be retried. */
  retryText?: string;
};

export type HistoryResponse = {
  status: ConversationStatus;
  messages: Array<{ id: string; role: Role; content: string; cards: Card[]; sources: SourceRef[]; createdAt: string }>;
};

const STREAM_EVENT_TYPES = new Set<StreamEvent["type"]>([
  "conversation",
  "text",
  "tool",
  "card",
  "sources",
  "analysis",
  "handoff",
  "done",
  "error",
]);

function isStreamEvent(value: unknown): value is StreamEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    STREAM_EVENT_TYPES.has((value as { type: StreamEvent["type"] }).type)
  );
}

export class ChatHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Reads an NDJSON body and yields protocol events, tolerating chunk boundaries mid line. */
export async function* readEvents(res: Response): AsyncGenerator<StreamEvent> {
  if (!res.ok || !res.body) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "The front desk could not be reached.";
    throw new ChatHttpError(message, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        const parsed: unknown = JSON.parse(line);
        if (isStreamEvent(parsed)) yield parsed;
      }
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
  const tail = buffer.trim();
  if (tail) {
    const parsed: unknown = JSON.parse(tail);
    if (isStreamEvent(parsed)) yield parsed;
  }
}

const IST = "Asia/Kolkata";

const dayFormat = new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });

/** "Thu 29 Oct" in clinic time, regardless of the visitor's own time zone. */
export function formatDay(iso: string): string {
  const parts = dayFormat.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** "5:00 PM" in clinic time. */
export function formatClock(iso: string): string {
  return timeFormat.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
}

export function dayKey(iso: string): string {
  return dayKeyFormat.format(new Date(iso));
}

export function ticketReference(ticketId: string): string {
  return `T-${ticketId.slice(0, 6).toUpperCase()}`;
}
