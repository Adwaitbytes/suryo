"use client";

import { BellRing, CalendarCheck2, CalendarClock, ChevronDown, Mail, Target, Ticket } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Card } from "@/lib/contracts";
import { cn, formatInr } from "@/lib/utils";
import { FOLLOWUP_KIND_LABELS, formatClock, formatDate, formatDateTime, titleCase } from "../format";

function Shell({ icon, title, aside, children }: { icon: ReactNode; title: string; aside?: ReactNode; children?: ReactNode }) {
  return (
    <div className="w-full max-w-[420px] rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-surface-3 text-fg-muted">{icon}</span>
        <span className="text-[12.5px] font-medium text-fg">{title}</span>
        {aside ? <span className="ml-auto">{aside}</span> : null}
      </div>
      {children ? <div className="mt-2 pl-8 text-xs leading-relaxed text-fg-muted">{children}</div> : null}
    </div>
  );
}

export function MessageCard({ card }: { card: Card }) {
  switch (card.kind) {
    case "booking":
      return (
        <Shell
          icon={<CalendarCheck2 className="size-3.5" />}
          title={card.status === "cancelled" ? "Appointment cancelled" : card.status === "rescheduled" ? "Appointment moved" : "Appointment booked"}
          aside={<Badge tone={card.status === "cancelled" ? "neutral" : "success"}>{titleCase(card.status)}</Badge>}
        >
          <div className="text-fg">{card.service}</div>
          <div>
            {card.staff} · {formatDateTime(card.startsAt)}
            {card.location ? ` · ${card.location}` : ""}
          </div>
          <div className="mt-1 flex items-center gap-3 font-mono text-[10.5px] text-fg-subtle">
            <span>A-{card.appointmentId.slice(0, 6).toUpperCase()}</span>
            {card.priceInr ? <span className="text-fg-muted">{formatInr(card.priceInr)}</span> : null}
          </div>
        </Shell>
      );
    case "slots":
      return (
        <Shell icon={<CalendarClock className="size-3.5" />} title={`Offered ${card.slots.length} slots`} aside={<span className="text-2xs text-fg-subtle">{card.service}</span>}>
          <div className="flex flex-wrap gap-1.5">
            {card.slots.map((s) => (
              <span key={s.slotId} className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-fg-muted" title={`${s.staff}${s.location ? `, ${s.location}` : ""}`}>
                {formatDate(s.startsAt)} {formatClock(s.startsAt)}
              </span>
            ))}
          </div>
        </Shell>
      );
    case "ticket":
      return <TicketRow ticketId={card.ticketId} category={card.category} priority={card.priority} summary={card.summary} />;
    case "lead":
      return (
        <Shell icon={<Target className="size-3.5" />} title="Lead captured" aside={<span className="tabular font-mono text-2xs text-fg-muted">score {card.score}</span>}>
          {card.interest}
        </Shell>
      );
    case "escalation":
      return null;
    case "email":
      return (
        <Shell
          icon={<Mail className="size-3.5" />}
          title={card.status === "sent" ? "Email sent" : card.status === "failed" ? "Email failed" : "Email skipped"}
          aside={<Badge tone={card.status === "sent" ? "success" : "warning"}>{titleCase(card.status)}</Badge>}
        >
          <div className="text-fg">{card.subject}</div>
          <div className="font-mono text-[10.5px] text-fg-subtle">to {card.to}</div>
        </Shell>
      );
    case "followup":
      return (
        <Shell icon={<BellRing className="size-3.5" />} title={`${FOLLOWUP_KIND_LABELS[card.kind_] ?? titleCase(card.kind_)} scheduled`}>
          Due {formatDateTime(card.dueAt)}
        </Shell>
      );
  }
}

/** One line by default: the summary repeats what the transcript and rail already say. */
function TicketRow({ ticketId, category, priority, summary }: { ticketId: string; category: string; priority: string; summary: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const urgent = priority === "urgent" || priority === "high";
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-offset-[-2px]"
      >
        <Ticket aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
        <span className="tabular font-mono text-[11px] text-fg">T-{ticketId.slice(0, 6).toUpperCase()}</span>
        <span className="text-fg-faint">·</span>
        <span className="text-fg-muted">{titleCase(category)}</span>
        <span className="text-fg-faint">·</span>
        <span className={urgent ? "text-warning" : "text-fg-muted"}>{titleCase(priority)}</span>
        <ChevronDown aria-hidden className={cn("ml-auto size-3.5 text-fg-subtle transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open ? (
        <p id={panelId} className="border-t border-border px-3 py-2.5 text-xs leading-relaxed text-fg-muted">
          {summary}
        </p>
      ) : null}
    </div>
  );
}

/** Escalations render as a timeline marker; the context rail carries the detail. */
export function EscalationDivider({ urgency, reason, at }: { urgency: string; reason: string; at: string }) {
  return (
    <div className="flex w-full items-center gap-3 font-mono text-2xs text-fg-subtle">
      <span className="h-px flex-1 bg-border" />
      <span className="flex min-w-0 max-w-[80%] items-center gap-2" title={reason}>
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-danger" />
        <span className="truncate">
          Escalated · {titleCase(urgency)} · {reason} · {formatClock(at)}
        </span>
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
