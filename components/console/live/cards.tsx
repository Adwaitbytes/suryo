"use client";

import { BellRing, CalendarCheck2, CalendarClock, LifeBuoy, Mail, Target, Ticket } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Card } from "@/lib/contracts";
import { cn, formatInr } from "@/lib/utils";
import { FOLLOWUP_KIND_LABELS, formatClock, formatDate, formatDateTime, titleCase } from "../format";

function Shell({ icon, title, aside, children, danger }: { icon: ReactNode; title: string; aside?: ReactNode; children?: ReactNode; danger?: boolean }) {
  return (
    <div className={cn("w-full max-w-[420px] rounded-xl border bg-surface p-3", danger ? "border-danger/40 bg-danger-soft" : "border-border")}>
      <div className="flex items-center gap-2">
        <span className={cn("grid size-6 place-items-center rounded-md", danger ? "bg-danger/15 text-danger" : "bg-surface-3 text-fg-muted")}>{icon}</span>
        <span className={cn("text-[12.5px] font-medium", danger ? "text-danger" : "text-fg")}>{title}</span>
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
      return (
        <Shell icon={<Ticket className="size-3.5" />} title={`Ticket T-${card.ticketId.slice(0, 6).toUpperCase()}`} aside={<Badge tone={card.priority === "urgent" || card.priority === "high" ? "warning" : "neutral"}>{titleCase(card.priority)}</Badge>}>
          <div className="text-fg-subtle">{titleCase(card.category)}</div>
          <div>{card.summary}</div>
        </Shell>
      );
    case "lead":
      return (
        <Shell icon={<Target className="size-3.5" />} title="Lead captured" aside={<span className="tabular font-mono text-2xs text-fg-muted">score {card.score}</span>}>
          {card.interest}
        </Shell>
      );
    case "escalation":
      return (
        <Shell danger icon={<LifeBuoy className="size-3.5" />} title="Escalated to the front desk" aside={<Badge tone="danger">{titleCase(card.urgency)}</Badge>}>
          <span className="text-fg-muted">{card.reason}</span>
        </Shell>
      );
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
