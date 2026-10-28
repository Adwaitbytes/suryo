"use client";

import { ArrowUpRight, CalendarCheck2, Target, Ticket } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/primitives";
import type { BookingRow, LeadRow, TicketRow } from "@/lib/console/types";
import { cn, formatInr } from "@/lib/utils";
import { errorMessage, sendJson } from "./api";
import { ErrorNote, PageHeader, SelectChip, TableSkeleton, td, th } from "./bits";
import { CustomerDrawer } from "./customers-view";
import { dayKey, formatClock, formatDate, relativeTime, titleCase } from "./format";
import { touches, useNow, useResource } from "./hooks";
import { useConsole } from "./provider";

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string; count?: number }>; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors", value === o.value ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg-muted")}
        >
          {o.label}
          {o.count !== undefined ? <span className="tabular font-mono text-2xs text-fg-faint">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function CustomerCell({ name, onOpen, sub }: { name: string | null; onOpen?: () => void; sub?: string | null }) {
  return (
    <div className="min-w-0">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="truncate font-medium text-fg underline-offset-4 hover:underline">
          {name ?? "Unnamed"}
        </button>
      ) : (
        <span className="truncate font-medium text-fg-muted">{name ?? "No customer"}</span>
      )}
      {sub ? <div className="font-mono text-[11px] text-fg-faint">{sub}</div> : null}
    </div>
  );
}

export function TranscriptLink({ id }: { id: string | null }) {
  if (!id) return <span className="text-fg-faint">Front desk</span>;
  return (
    <Link href={`/console?c=${id}`} className="inline-flex items-center gap-0.5 text-fg-muted hover:text-fg">
      Transcript <ArrowUpRight aria-hidden className="size-3" />
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

const BOOKING_TONE: Record<BookingRow["status"], Tone> = { confirmed: "success", rescheduled: "info", cancelled: "neutral", completed: "neutral" };

export function BookingsView() {
  const { business } = useConsole();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [customer, setCustomer] = useState<string | null>(null);
  const res = useResource<{ upcoming: BookingRow[]; past: BookingRow[] }>(business ? `/api/console/bookings?business=${business.id}` : null, {
    refreshOn: touches(["appointment.changed"]),
  });
  const rows = useMemo(() => res.data?.[tab] ?? [], [res.data, tab]);
  const groups = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const r of rows) {
      const k = dayKey(r.startsAt);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);
  const upcomingLive = res.data?.upcoming.filter((b) => b.status === "confirmed") ?? [];
  const upcomingValue = upcomingLive.reduce((sum, b) => sum + (b.priceInr ?? 0), 0);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Bookings"
        meta={res.data ? `${upcomingLive.length} confirmed ahead${upcomingValue ? ` · ${formatInr(upcomingValue)}` : ""}` : null}
        description="Appointments across doctors and branches. Rows booked by the assistant link to their transcript."
        actions={
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "upcoming", label: "Upcoming", count: res.data?.upcoming.length },
              { value: "past", label: "Past", count: res.data?.past.length },
            ]}
          />
        }
      />
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {res.error ? <ErrorNote message={res.error} onRetry={() => void res.refresh()} /> : null}
        {res.loading ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<CalendarCheck2 className="size-4" />} title={tab === "upcoming" ? "Nothing on the calendar" : "No past appointments"} body="Bookings made by phone, chat or the front desk all show up here." />
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
              <tr>
                <th className={cn(th, "w-28")}>Time</th>
                <th className={th}>Customer</th>
                <th className={th}>Service</th>
                <th className={th}>Doctor</th>
                <th className={th}>Location</th>
                <th className={cn(th, "text-right")}>Fee</th>
                <th className={th}>Status</th>
                <th className={th}>Source</th>
              </tr>
            </thead>
            {groups.map(([day, list]) => (
              <tbody key={day} className="divide-y divide-border">
                <tr className="bg-bg-subtle">
                  <td colSpan={8} className="px-6 py-2 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle 2xl:px-8">
                    {formatDate(list[0].startsAt)} <span className="ml-2 font-mono normal-case tracking-normal text-fg-faint">{list.length} booked</span>
                  </td>
                </tr>
                {list.map((b) => (
                  <tr key={b.id} className={cn("transition-colors hover:bg-surface", b.status === "cancelled" && "text-fg-subtle")}>
                    <td className={cn(td, "tabular font-mono text-xs text-fg-muted")}>{formatClock(b.startsAt)}</td>
                    <td className={td}>
                      <CustomerCell name={b.customerName} sub={b.customerPhone} onOpen={() => setCustomer(b.customerId)} />
                    </td>
                    <td className={cn(td, b.status === "cancelled" ? "line-through decoration-fg-faint" : "text-fg")}>{b.service ?? "Appointment"}</td>
                    <td className={cn(td, "text-fg-muted")}>{b.staff ?? ""}</td>
                    <td className={cn(td, "text-fg-muted")}>{b.location ?? ""}</td>
                    <td className={cn(td, "tabular text-right font-mono text-xs text-fg-muted")}>{formatInr(b.priceInr)}</td>
                    <td className={td}>
                      <Badge tone={BOOKING_TONE[b.status]}>{titleCase(b.status)}</Badge>
                    </td>
                    <td className={cn(td, "text-xs")}>
                      {b.conversationId ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-mono text-[10.5px] text-accent">AI {b.channel === "voice" ? "voice" : "chat"}</span>
                          <TranscriptLink id={b.conversationId} />
                        </span>
                      ) : (
                        <TranscriptLink id={null} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}
      </div>
      <CustomerDrawer customerId={customer} onClose={() => setCustomer(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tickets                                                             */
/* ------------------------------------------------------------------ */

const TICKET_STATUSES = ["open", "pending", "resolved"] as const;
const PRIORITY_TONE: Record<TicketRow["priority"], Tone> = { urgent: "warning", high: "warning", medium: "neutral", low: "neutral" };
const TICKET_STATUS_TONE: Record<TicketRow["status"], Tone> = { open: "accent", pending: "warning", resolved: "neutral" };

export function TicketsView() {
  const { business, toast } = useConsole();
  const now = useNow(30_000);
  const [customer, setCustomer] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "resolved" | "all">("active");
  const res = useResource<{ items: TicketRow[] }>(business ? `/api/console/tickets?business=${business.id}` : null, { refreshOn: touches(["ticket.created"]) });
  const all = res.data?.items ?? [];
  const rows = all.filter((t) => (filter === "all" ? true : filter === "resolved" ? t.status === "resolved" : t.status !== "resolved"));

  const update = async (ticket: TicketRow, status: TicketRow["status"]) => {
    res.setData((d) => (d ? { items: d.items.map((t) => (t.id === ticket.id ? { ...t, status } : t)) } : d));
    try {
      await sendJson(`/api/console/tickets/${ticket.id}`, { status }, "PATCH");
      toast({ title: `${ticket.reference} moved to ${status}`, tone: "success" });
    } catch (err) {
      toast({ title: "Could not update the ticket", body: errorMessage(err), tone: "danger" });
      await res.refresh();
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Tickets"
        meta={res.data ? `${all.filter((t) => t.status !== "resolved").length} need attention` : null}
        description="Billing, complaints and records requests the assistant could not close on its own."
        actions={
          <Tabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: "active", label: "Open and pending", count: all.filter((t) => t.status !== "resolved").length },
              { value: "resolved", label: "Resolved", count: all.filter((t) => t.status === "resolved").length },
              { value: "all", label: "All", count: all.length },
            ]}
          />
        }
      />
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {res.error ? <ErrorNote message={res.error} onRetry={() => void res.refresh()} /> : null}
        {res.loading ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Ticket className="size-4" />} title={filter === "active" ? "Inbox zero" : "No tickets here"} body="When a customer needs staff action, the assistant opens a ticket with a summary a person can act on." />
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
              <tr>
                <th className={cn(th, "w-28")}>Ref</th>
                <th className={th}>Priority</th>
                <th className={th}>Summary</th>
                <th className={th}>Customer</th>
                <th className={th}>Opened</th>
                <th className={th}>Status</th>
                <th className={th}>Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-surface">
                  <td className={cn(td, "font-mono text-xs text-fg-subtle")}>{t.reference}</td>
                  <td className={td}>
                    <Badge tone={PRIORITY_TONE[t.priority]}>{titleCase(t.priority)}</Badge>
                  </td>
                  <td className={cn(td, "max-w-[520px]")}>
                    <div className="text-2xs uppercase tracking-[0.06em] text-fg-subtle">{titleCase(t.category)}</div>
                    <div className="mt-0.5 line-clamp-2 leading-relaxed text-fg">{t.summary}</div>
                  </td>
                  <td className={td}>
                    <CustomerCell name={t.customerName} onOpen={t.customerId ? () => setCustomer(t.customerId) : undefined} />
                  </td>
                  <td className={cn(td, "tabular whitespace-nowrap text-xs text-fg-subtle")}>{relativeTime(t.createdAt, now)}</td>
                  <td className={td}>
                    <SelectChip label={`Status for ${t.reference}`} value={t.status} options={TICKET_STATUSES} tone={TICKET_STATUS_TONE[t.status]} onChange={(s) => void update(t, s)} />
                  </td>
                  <td className={cn(td, "text-xs")}>
                    <TranscriptLink id={t.conversationId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <CustomerDrawer customerId={customer} onClose={() => setCustomer(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
const LEAD_STATUS_TONE: Record<LeadRow["status"], Tone> = { new: "accent", contacted: "info", qualified: "info", won: "success", lost: "neutral" };

export function LeadsView() {
  const { business, toast } = useConsole();
  const now = useNow(30_000);
  const [customer, setCustomer] = useState<string | null>(null);
  const res = useResource<{ items: LeadRow[] }>(business ? `/api/console/leads?business=${business.id}` : null, { refreshOn: touches(["lead.created"]) });
  const rows = res.data?.items ?? [];

  const update = async (lead: LeadRow, status: LeadRow["status"]) => {
    res.setData((d) => (d ? { items: d.items.map((l) => (l.id === lead.id ? { ...l, status } : l)) } : d));
    try {
      await sendJson(`/api/console/leads/${lead.id}`, { status }, "PATCH");
    } catch (err) {
      toast({ title: "Could not update the lead", body: errorMessage(err), tone: "danger" });
      await res.refresh();
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Leads"
        meta={res.data ? `${rows.filter((l) => l.status === "new").length} new · ${rows.filter((l) => l.score >= 70).length} hot` : null}
        description="People interested but not ready to book, scored on contact details, budget and timeline."
      />
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {res.error ? <ErrorNote message={res.error} onRetry={() => void res.refresh()} /> : null}
        {res.loading ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Target className="size-4" />} title="No leads yet" body="When someone asks about a treatment but is not ready to book, the assistant records what they want, their budget and timeline." />
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
              <tr>
                <th className={cn(th, "w-40")}>Score</th>
                <th className={th}>Interest</th>
                <th className={th}>Budget</th>
                <th className={th}>Timeline</th>
                <th className={th}>Customer</th>
                <th className={th}>Captured</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((l) => (
                <tr key={l.id} className="transition-colors hover:bg-surface">
                  <td className={td}>
                    <div className="flex items-center gap-2.5">
                      <span className="tabular w-6 font-mono text-xs text-fg">{l.score}</span>
                      <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={l.score} aria-label="Lead score">
                        <span className={cn("absolute inset-y-0 left-0 rounded-full", l.score >= 70 ? "bg-accent" : l.score >= 40 ? "bg-fg-muted" : "bg-fg-faint")} style={{ width: `${l.score}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className={cn(td, "max-w-[360px]")}>
                    <div className="line-clamp-2 text-fg">{l.interest}</div>
                    {l.notes ? <div className="mt-0.5 line-clamp-1 text-xs text-fg-subtle">{l.notes}</div> : null}
                  </td>
                  <td className={cn(td, "text-fg-muted")}>{l.budget ?? <span className="text-fg-faint">Not shared</span>}</td>
                  <td className={cn(td, "text-fg-muted")}>{l.timeline ?? <span className="text-fg-faint">Not shared</span>}</td>
                  <td className={td}>
                    <CustomerCell name={l.customerName} sub={l.customerPhone} onOpen={l.customerId ? () => setCustomer(l.customerId) : undefined} />
                  </td>
                  <td className={cn(td, "tabular whitespace-nowrap text-xs text-fg-subtle")}>{relativeTime(l.createdAt, now)}</td>
                  <td className={td}>
                    <SelectChip label="Lead status" value={l.status} options={LEAD_STATUSES} tone={LEAD_STATUS_TONE[l.status]} onChange={(s) => void update(l, s)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <CustomerDrawer customerId={customer} onClose={() => setCustomer(null)} />
    </div>
  );
}
