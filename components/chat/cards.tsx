"use client";

import {
  AlertTriangle,
  BellRing,
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  Check,
  Clock3,
  LifeBuoy,
  Mail,
  MapPin,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import type { Card } from "@/lib/contracts";
import { cn, formatInr } from "@/lib/utils";
import { dayKey, formatClock, formatDay, ticketReference } from "./protocol";

type SlotsCard = Extract<Card, { kind: "slots" }>;

export function slotRequest(slot: SlotsCard["slots"][number]): string {
  return `The ${formatClock(slot.startsAt)} slot with ${slot.staff} on ${formatDay(slot.startsAt)} please`;
}

function Shell({ tone = "neutral", children, className }: { tone?: "neutral" | "danger"; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border bg-surface shadow-sm",
        tone === "danger" ? "border-danger/35 bg-danger-soft" : "border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Header({ icon, eyebrow, title, meta, badge }: { icon: ReactNode; eyebrow: string; title: string; meta?: string; badge?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3.5 pt-3.5">
      <div aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-fg-muted">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">{eyebrow}</div>
        <div className="mt-0.5 text-[14px] font-medium leading-snug text-fg">{title}</div>
        {meta ? <div className="mt-0.5 truncate text-[12px] text-fg-subtle">{meta}</div> : null}
      </div>
      {badge}
    </div>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-[13px]">
      <span aria-hidden className="text-fg-subtle">
        {icon}
      </span>
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-fg-muted">{children}</dd>
    </div>
  );
}

type Slot = SlotsCard["slots"][number];

const providerLabel = (slot: Slot) => (slot.location ? `${slot.staff} · ${slot.location}` : slot.staff);

function groupBy<T>(items: T[], key: (item: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups.entries()];
}

export function SlotPicker({ card, onPick, disabled }: { card: SlotsCard; onPick: (slot: Slot) => void; disabled: boolean }) {
  const first = card.slots[0];
  // When one doctor at one branch covers every slot, say it once in the header and keep the grid to times.
  const shared = first && card.slots.every((s) => providerLabel(s) === providerLabel(first)) ? providerLabel(first) : undefined;
  const days = groupBy(card.slots, (slot) => dayKey(slot.startsAt));
  return (
    <Shell>
      <Header icon={<CalendarClock className="size-4" />} eyebrow="Open slots" title={card.service} meta={shared} />
      <div className="space-y-3.5 px-3.5 pb-3.5 pt-3">
        {days.map(([key, daySlots]) => (
          <fieldset key={key} className="min-w-0">
            <legend className="mb-2 text-[12px] font-medium text-fg-subtle">{formatDay(daySlots[0].startsAt)}</legend>
            <div className="space-y-2.5">
              {groupBy(daySlots, providerLabel).map(([provider, slots]) => (
                <div key={provider}>
                  {shared ? null : <p className="mb-1.5 truncate text-2xs text-fg-subtle">{provider}</p>}
                  <ul className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => (
                      <li key={slot.slotId}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onPick(slot)}
                          aria-label={slotRequest(slot)}
                          className="tabular h-10 w-full rounded-lg border border-border bg-surface-2 text-[14px] font-medium text-fg transition-[border-color,background-color,color,transform] duration-150 hover:border-accent/60 hover:bg-accent-soft hover:text-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border disabled:hover:bg-surface-2 disabled:hover:text-fg"
                        >
                          {formatClock(slot.startsAt)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="font-mono text-[10px] text-fg-faint">Times in IST</p>
      </div>
    </Shell>
  );
}

const bookingStatus: Record<Extract<Card, { kind: "booking" }>["status"], { tone: Tone; label: string; icon: ReactNode; eyebrow: string }> = {
  confirmed: { tone: "success", label: "Confirmed", icon: <CalendarCheck2 className="size-4 text-success" />, eyebrow: "Appointment booked" },
  rescheduled: { tone: "warning", label: "Rescheduled", icon: <CalendarClock className="size-4 text-warning" />, eyebrow: "Appointment moved" },
  cancelled: { tone: "neutral", label: "Cancelled", icon: <CalendarX2 className="size-4" />, eyebrow: "Appointment cancelled" },
};

function BookingCard({ card }: { card: Extract<Card, { kind: "booking" }> }) {
  const meta = bookingStatus[card.status];
  return (
    <Shell>
      <Header icon={meta.icon} eyebrow={meta.eyebrow} title={card.service} badge={<Badge tone={meta.tone}>{meta.label}</Badge>} />
      <dl className={cn("mx-3.5 mb-3 mt-2.5 border-t border-border pt-1.5", card.status === "cancelled" && "opacity-60")}>
        <Row icon={<Clock3 className="size-3.5" />} label="When">
          <span className="text-fg">{formatDay(card.startsAt)}</span>, <span className="tabular">{formatClock(card.startsAt)}</span> IST
        </Row>
        <Row icon={<Stethoscope className="size-3.5" />} label="With">
          {card.staff}
        </Row>
        {card.location ? (
          <Row icon={<MapPin className="size-3.5" />} label="Where">
            {card.location}
          </Row>
        ) : null}
      </dl>
      <div className="flex items-center justify-between border-t border-border bg-surface-2/60 px-3.5 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-subtle">Ref {card.appointmentId.slice(0, 8)}</span>
        {card.priceInr != null ? <span className="tabular text-[13px] font-medium text-fg">{formatInr(card.priceInr)}</span> : null}
      </div>
    </Shell>
  );
}

const priorityTone: Record<string, Tone> = { urgent: "danger", high: "warning", medium: "info", low: "neutral" };

function TicketCard({ card }: { card: Extract<Card, { kind: "ticket" }> }) {
  return (
    <Shell>
      <Header
        icon={<LifeBuoy className="size-4" />}
        eyebrow={`Ticket ${ticketReference(card.ticketId)}`}
        title={card.category.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
        badge={<Badge tone={priorityTone[card.priority] ?? "neutral"}>{card.priority}</Badge>}
      />
      <p className="px-3.5 pb-3.5 pt-2 text-[13px] leading-relaxed text-fg-muted">{card.summary}</p>
    </Shell>
  );
}

function LeadCard({ card }: { card: Extract<Card, { kind: "lead" }> }) {
  const score = Math.max(0, Math.min(100, Math.round(card.score)));
  return (
    <Shell>
      <Header icon={<Sparkles className="size-4" />} eyebrow="Saved for the team" title={card.interest} />
      <div className="flex items-center gap-3 px-3.5 pb-3.5 pt-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="Lead score">
          <div className="h-full rounded-full bg-accent" style={{ width: `${score}%` }} />
        </div>
        <span className="tabular font-mono text-2xs text-fg-subtle">{score}/100</span>
      </div>
    </Shell>
  );
}

function EscalationCard({ card }: { card: Extract<Card, { kind: "escalation" }> }) {
  return (
    <Shell tone="danger">
      <div className="flex items-start gap-3 p-3.5">
        <div aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-danger/15 text-danger">
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-danger">Handed to a person</span>
            <Badge tone="danger">{card.urgency}</Badge>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-fg">{card.reason}</p>
          <p className="mt-1 text-2xs text-fg-muted">A coordinator has the full conversation, so you will not need to repeat yourself.</p>
        </div>
      </div>
    </Shell>
  );
}

const emailLabel: Record<Extract<Card, { kind: "email" }>["status"], { tone: Tone; label: string }> = {
  sent: { tone: "success", label: "Sent" },
  failed: { tone: "danger", label: "Not sent" },
  skipped: { tone: "neutral", label: "Skipped" },
};

function EmailCard({ card }: { card: Extract<Card, { kind: "email" }> }) {
  const meta = emailLabel[card.status];
  return (
    <Shell>
      <div className="flex items-center gap-3 p-3">
        <div aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-fg-muted">
          <Mail className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-fg">{card.subject}</div>
          <div className="truncate font-mono text-2xs text-fg-subtle">to {card.to}</div>
        </div>
        <Badge tone={meta.tone}>
          {card.status === "sent" ? <Check aria-hidden className="size-3" /> : null}
          {meta.label}
        </Badge>
      </div>
    </Shell>
  );
}

const followUpLabel: Record<string, string> = {
  callback: "Callback scheduled",
  reminder: "Reminder scheduled",
  lead_nurture: "Follow up scheduled",
  post_visit: "Aftercare check in",
};

function FollowUpCard({ card }: { card: Extract<Card, { kind: "followup" }> }) {
  return (
    <Shell>
      <div className="flex items-center gap-3 p-3">
        <div aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-fg-muted">
          <BellRing className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-fg">{followUpLabel[card.kind_] ?? "Follow up scheduled"}</div>
          <div className="tabular font-mono text-2xs text-fg-subtle">
            {formatDay(card.dueAt)}, {formatClock(card.dueAt)} IST
          </div>
        </div>
      </div>
    </Shell>
  );
}

export function CardView({
  card,
  onPickSlot,
  slotsDisabled,
}: {
  card: Card;
  onPickSlot: (slot: SlotsCard["slots"][number]) => void;
  slotsDisabled: boolean;
}) {
  switch (card.kind) {
    case "slots":
      return <SlotPicker card={card} onPick={onPickSlot} disabled={slotsDisabled} />;
    case "booking":
      return <BookingCard card={card} />;
    case "ticket":
      return <TicketCard card={card} />;
    case "lead":
      return <LeadCard card={card} />;
    case "escalation":
      return <EscalationCard card={card} />;
    case "email":
      return <EmailCard card={card} />;
    case "followup":
      return <FollowUpCard card={card} />;
  }
}
