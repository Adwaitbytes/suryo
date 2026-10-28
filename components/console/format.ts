import type { ConversationStage, ConversationStatus } from "@/lib/contracts";
import type { Tone } from "@/components/ui/badge";
import type { Urgency } from "@/lib/console/types";

const TZ = "Asia/Kolkata";

export const STAGES = ["greeting", "identify", "understand", "gather", "confirm", "execute", "close"] as const satisfies readonly ConversationStage[];

export const STAGE_LABELS: Record<ConversationStage, string> = {
  greeting: "Greeting",
  identify: "Identify",
  understand: "Understand",
  gather: "Gather",
  confirm: "Confirm",
  execute: "Execute",
  close: "Close",
};

export const LANGUAGE_LABELS: Record<string, string> = { en: "EN", hi: "HI", hinglish: "Hinglish" };
export const LANGUAGE_NAMES: Record<string, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish" };

export const STATUS_META: Record<ConversationStatus, { label: string; tone: Tone; live?: boolean }> = {
  active: { label: "AI handling", tone: "success", live: true },
  escalated: { label: "Escalated", tone: "danger", live: true },
  human: { label: "Human", tone: "info", live: true },
  resolved: { label: "Resolved", tone: "neutral" },
  abandoned: { label: "Abandoned", tone: "neutral" },
};

export const URGENCY_META: Record<Urgency, { label: string; tone: Tone }> = {
  critical: { label: "Critical", tone: "danger" },
  high: { label: "High", tone: "danger" },
  medium: { label: "Medium", tone: "warning" },
  low: { label: "Low", tone: "neutral" },
};

export const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Knowledge search",
  check_availability: "Availability",
  lookup_customer: "Customer lookup",
  upsert_customer: "Save customer",
  book_appointment: "Book",
  reschedule_appointment: "Reschedule",
  cancel_appointment: "Cancel",
  create_ticket: "Ticket",
  capture_lead: "Lead",
  send_confirmation: "Confirmation email",
  escalate_to_human: "Escalate",
  schedule_follow_up: "Follow up",
  lookup_order: "Order lookup",
  track_order: "Track order",
  cancel_order: "Cancel order",
  request_return: "Return or exchange",
  refund_status: "Refund status",
};

export const TRIGGER_LABELS: Record<string, string> = {
  customer_request: "Asked for a person",
  emergency: "Emergency",
  medical_advice: "Medical advice",
  billing_dispute: "Billing dispute",
  frustration: "Frustration",
  low_confidence: "Low confidence",
  repeated_misunderstanding: "Misunderstanding",
  other: "Other",
};

export const FOLLOWUP_KIND_LABELS: Record<string, string> = {
  reminder: "Reminder",
  recovery: "Recovery",
  callback: "Callback",
  post_visit: "Post visit",
  lead_nurture: "Lead nurture",
};

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function relativeTime(iso: string, now: number): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  const future = diff < 0;
  const s = Math.abs(diff);
  let out: string;
  if (s < 45) return future ? "in a moment" : "just now";
  if (s < 3600) out = `${Math.round(s / 60)}m`;
  else if (s < 86_400) out = `${Math.round(s / 3600)}h`;
  else if (s < 86_400 * 30) out = `${Math.round(s / 86_400)}d`;
  else return formatDate(iso);
  return future ? `in ${out}` : `${out} ago`;
}

/** Live ticking duration, for example "4m 08s" or "1h 12m". */
export function elapsed(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`;
}

const clock = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const date = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const formatClock = (iso: string) => clock.format(new Date(iso)).replace(" ", " ").toLowerCase();
export const formatDate = (iso: string) => date.format(new Date(iso));
export const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatClock(iso)}`;
export const dayKey = (iso: string | Date) => dayKeyFmt.format(typeof iso === "string" ? new Date(iso) : iso);

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "n/a";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

export function sentimentTone(value: number): Tone {
  if (value >= 0.25) return "success";
  if (value <= -0.25) return "warning";
  return "neutral";
}

export function sentimentLabel(value: number): string {
  if (value >= 0.5) return "Positive";
  if (value >= 0.15) return "Warm";
  if (value > -0.15) return "Neutral";
  if (value > -0.5) return "Uneasy";
  return "Upset";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export const isSevere = (urgency: Urgency) => urgency === "critical" || urgency === "high";

/** Red is reserved for a severe escalation nobody has picked up within five minutes. */
export function isOverdue(e: { urgency: Urgency; status: string; createdAt: string }, now: number): boolean {
  return isSevere(e.urgency) && e.status === "open" && now - new Date(e.createdAt).getTime() > 5 * 60_000;
}
