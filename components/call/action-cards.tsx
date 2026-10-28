"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarCheck, CalendarClock, CalendarX, Check, Clock, Headset, Loader2, Mail, Sparkles, Ticket, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Card } from "@/lib/contracts";
import type { CallAction } from "@/lib/voice/call";
import { cn } from "@/lib/utils";

const TZ = "Asia/Kolkata";
const dayDate = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const timeOnly = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

/** Shows the most recent tool activity as cards that rise in as the agent works. */
export function ActionCards({ actions, reducedMotion }: { actions: CallAction[]; reducedMotion: boolean }) {
  const visible = actions.slice(-2);
  return (
    <div className="flex flex-col items-start gap-2" aria-live="polite" aria-relevant="additions text">
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((action) => (
          <motion.div
            key={action.id}
            layout={!reducedMotion}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
            className={isCompact(action) ? "max-w-full" : "w-full"}
          >
            <ActionCard action={action} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ActionCard({ action }: { action: CallAction }) {
  if (action.status === "running") {
    return (
      <Shell icon={<Loader2 className="size-4 animate-spin motion-reduce:animate-none" />} tone="muted">
        <span className="text-fg-muted">{action.label}</span>
      </Shell>
    );
  }
  if (action.status === "error") {
    return (
      <Shell icon={<TriangleAlert className="size-4" />} tone="warning">
        <span className="text-fg-muted">{action.label} did not go through. Your call carries on.</span>
      </Shell>
    );
  }
  if (isCompact(action)) {
    return <DoneChip label={action.cards.length ? cardLabel(action.cards[0]) : doneLabel(action.name, action.label)} />;
  }
  return (
    <div className="flex flex-col gap-2">
      {action.cards.map((card, i) => (
        <CardView key={`${action.id}_${i}`} card={card} />
      ))}
    </div>
  );
}

function CardView({ card }: { card: Card }) {
  switch (card.kind) {
    case "slots": {
      const slots = card.slots.slice(0, 3);
      const staff = new Set(slots.map((slot) => slot.staff));
      const sameStaff = staff.size === 1 ? slots[0]?.staff : null;
      return (
        <Shell icon={<Clock className="size-4" />} tone="accent" title={slots.length ? card.service : `No open times for ${card.service}`}>
          {sameStaff ? <p className="text-[13px] text-fg-subtle">with {sameStaff}</p> : null}
          {slots.length > 0 && (
            <ul className="mt-2 grid grid-cols-3 gap-1.5">
              {slots.map((slot) => (
                <li key={slot.slotId} className="min-w-0 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-center text-[13px] leading-tight">
                  <span className="tabular text-fg">{timeOnly.format(new Date(slot.startsAt)).toUpperCase()}</span>
                  <span className="block truncate text-2xs text-fg-subtle">{sameStaff ? dayDate.format(new Date(slot.startsAt)) : slot.staff}</span>
                </li>
              ))}
            </ul>
          )}
        </Shell>
      );
    }
    case "booking": {
      const icon = card.status === "cancelled" ? <CalendarX className="size-4" /> : card.status === "rescheduled" ? <CalendarClock className="size-4" /> : <CalendarCheck className="size-4" />;
      const title = card.status === "cancelled" ? "Appointment cancelled" : card.status === "rescheduled" ? "Appointment moved" : "Booking confirmed";
      const date = new Date(card.startsAt);
      return (
        <Shell icon={icon} tone={card.status === "cancelled" ? "muted" : "success"} title={title}>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            {card.staff}, {dayDate.format(date)} at <span className="tabular">{timeOnly.format(date).toUpperCase()}</span>
            {card.location ? `, ${card.location}` : ""}
          </p>
        </Shell>
      );
    }
    case "email":
      return (
        <Shell icon={<Mail className="size-4" />} tone={card.status === "sent" ? "success" : "muted"} title={card.status === "sent" ? "Email sent" : card.status === "failed" ? "Email could not send" : "Email skipped"}>
          <p className="mt-0.5 truncate text-[13px] text-fg-muted">{card.subject}</p>
        </Shell>
      );
    case "ticket":
      return (
        <Shell icon={<Ticket className="size-4" />} tone="accent" title={`Ticket T-${card.ticketId.slice(0, 6).toUpperCase()}`}>
          <p className="mt-0.5 text-[13px] text-fg-muted">The front desk will follow up on your {card.category.replace(/_/g, " ")} request.</p>
        </Shell>
      );
    case "escalation":
      return (
        <Shell icon={<Headset className="size-4" />} tone={card.urgency === "critical" ? "danger" : "accent"} title="Connecting a human">
          <p className="mt-0.5 text-[13px] text-fg-muted">{card.reason}</p>
        </Shell>
      );
    case "lead":
      return (
        <Shell icon={<Sparkles className="size-4" />} tone="accent" title="Interest noted">
          <p className="mt-0.5 truncate text-[13px] text-fg-muted">{card.interest}</p>
        </Shell>
      );
    case "followup":
      return (
        <Shell icon={<CalendarClock className="size-4" />} tone="muted" title="Follow up scheduled">
          <p className="mt-0.5 text-[13px] text-fg-muted tabular">{dayDate.format(new Date(card.dueAt))}, {timeOnly.format(new Date(card.dueAt)).toUpperCase()}</p>
        </Shell>
      );
  }
}

const toneClass = {
  muted: "bg-surface-3 text-fg-subtle",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

function Shell({ icon, tone, title, children }: { icon: ReactNode; tone: keyof typeof toneClass; title?: string; children?: ReactNode }) {
  return (
    <div className={cn("flex gap-3 rounded-2xl border border-border bg-surface/90 px-3.5 py-3 shadow-md", title ? "items-start" : "items-center")}>
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", title && "mt-0.5", toneClass[tone])}>{icon}</span>
      <div className="min-w-0 flex-1 text-sm leading-snug">
        {title ? <p className="font-medium text-fg">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** Rich cards are kept for outcomes the caller acts on; everything else settles into a quiet chip. */
const RICH_CARDS = new Set<Card["kind"]>(["booking", "slots", "ticket"]);

function isCompact(action: CallAction): boolean {
  return action.status === "done" && action.cards.every((card) => !RICH_CARDS.has(card.kind));
}

function cardLabel(card: Card): string {
  switch (card.kind) {
    case "email":
      return card.status === "sent" ? "Email sent" : card.status === "failed" ? "Email could not send" : "Email skipped";
    case "lead":
      return "Interest noted";
    case "followup":
      return "Follow up scheduled";
    case "escalation":
      return "Connecting a human";
    default:
      return "Done";
  }
}

function DoneChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3 text-[13px] text-fg-muted">
      <Check aria-hidden className="size-3.5 shrink-0 text-success" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function doneLabel(name: string, fallback: string): string {
  const done: Record<string, string> = {
    search_knowledge: "Checked clinic info",
    check_availability: "Checked availability",
    lookup_customer: "Found your details",
    upsert_customer: "Saved your details",
    send_confirmation: "Confirmation on its way",
    schedule_follow_up: "Follow up scheduled",
  };
  return done[name] ?? fallback;
}
