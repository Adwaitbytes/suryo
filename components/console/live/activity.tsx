"use client";

import { BellRing, CalendarCheck2, LifeBuoy, Mail, MessageSquare, PhoneIncoming, Target, Ticket, Wrench, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SectionLabel } from "@/components/ui/primitives";
import type { ActivityItem } from "@/lib/console/types";
import { cn } from "@/lib/utils";
import { relativeTime, titleCase } from "../format";

type Line = { icon: LucideIcon; text: string; detail?: string; danger?: boolean };

function describe(a: ActivityItem, agentName: string): Line | null {
  const who = a.customerName ?? (a.channel === "voice" ? "A caller" : "A visitor");
  const p = a.payload;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : undefined);
  switch (a.type) {
    case "conversation.started":
      return { icon: PhoneIncoming, text: `New ${str("channel") === "voice" ? "call" : "chat"} started` };
    case "message.created": {
      const role = str("role");
      if (role === "system") return null;
      if (role === "customer") return { icon: MessageSquare, text: `${who} sent a message` };
      if (role === "human") return { icon: MessageSquare, text: `${str("operator") ?? "Staff"} replied to ${who}` };
      return { icon: MessageSquare, text: `${agentName} replied to ${who}` };
    }
    case "tool.called":
      return { icon: Wrench, text: str("label") ?? titleCase(str("name") ?? "Tool"), detail: num("durationMs") !== undefined ? `${num("durationMs")}ms${p.ok === false ? " failed" : ""}` : undefined };
    case "appointment.changed":
      return { icon: CalendarCheck2, text: `Appointment ${str("status") ?? "updated"} for ${who}` };
    case "ticket.created":
      return { icon: Ticket, text: p.updated ? `Ticket moved to ${str("status") ?? "a new status"}` : `${titleCase(str("priority") ?? "New")} priority ticket opened` };
    case "lead.created":
      return { icon: Target, text: p.updated ? `Lead marked ${str("status") ?? "updated"}` : `Lead captured from ${who}`, detail: num("score") !== undefined ? `score ${num("score")}` : undefined };
    case "escalation.created":
      return { icon: LifeBuoy, text: `Escalation: ${str("reason") ?? "needs a person"}`, detail: str("urgency"), danger: true };
    case "escalation.updated":
      return str("status") === "claimed"
        ? { icon: LifeBuoy, text: `${str("claimedBy") ?? "Staff"} claimed an escalation` }
        : str("status") === "resolved"
          ? { icon: LifeBuoy, text: "Escalation resolved" }
          : { icon: LifeBuoy, text: "Escalation summary written" };
    case "followup.changed":
      return { icon: BellRing, text: str("status") ? `Follow up ${str("status")}` : `${titleCase(str("kind") ?? "Follow up")} scheduled` };
    case "notification.sent":
      return { icon: Mail, text: `Email ${str("status") ?? "sent"}`, detail: str("subject") };
    default:
      return null;
  }
}

export function ActivityFeed({ items, now, agentName, onOpen }: { items: ActivityItem[]; now: number; agentName: string; onOpen: (conversationId: string) => void }) {
  const lines = items.map((a) => ({ a, line: describe(a, agentName) })).filter((x): x is { a: ActivityItem; line: Line } => x.line !== null);
  return (
    <aside aria-label="Recent activity" className="scroll-quiet flex min-h-0 flex-col overflow-y-auto border-l border-border bg-bg-subtle px-5 py-4">
      <SectionLabel>Activity</SectionLabel>
      {lines.length === 0 ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-fg-subtle">Bookings, tickets, escalations and every tool call stream in here as they happen.</p>
      ) : (
        <ol className="mt-3 space-y-0.5">
          <AnimatePresence initial={false}>
            {lines.map(({ a, line }) => {
              const Icon = line.icon;
              return (
                <motion.li key={a.id} layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                  <button
                    type="button"
                    disabled={!a.conversationId}
                    onClick={() => a.conversationId && onOpen(a.conversationId)}
                    className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface disabled:hover:bg-transparent"
                  >
                    <Icon aria-hidden className={cn("mt-0.5 size-3.5 shrink-0", line.danger ? "text-danger" : "text-fg-subtle")} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[12.5px]", line.danger ? "text-danger" : "text-fg-muted")}>{line.text}</span>
                      {line.detail ? <span className="block truncate font-mono text-[10.5px] text-fg-faint">{line.detail}</span> : null}
                    </span>
                    <span className="tabular shrink-0 text-[10.5px] text-fg-faint">{relativeTime(a.createdAt, now)}</span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </aside>
  );
}
