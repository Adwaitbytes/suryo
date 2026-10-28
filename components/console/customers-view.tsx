"use client";

import { ArrowUpRight, BellRing, CalendarCheck2, Headphones, MessageSquareText, Search, Target, Ticket, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Kbd, SectionLabel } from "@/components/ui/primitives";
import type { CustomerDetail, CustomerRow, TimelineItem } from "@/lib/console/types";
import { cn, formatInr } from "@/lib/utils";
import { ErrorNote, LanguageChip, PageHeader, StatusChip, TableSkeleton, td, th } from "./bits";
import { FOLLOWUP_KIND_LABELS, formatDateTime, initials, relativeTime, titleCase } from "./format";
import { touches, useDebounced, useNow, useResource } from "./hooks";
import { useConsole } from "./provider";

export function CustomersView() {
  const { business } = useConsole();
  const now = useNow(30_000);
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 220);
  const [openId, setOpenId] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useResource<{ items: CustomerRow[] }>(business ? `/api/console/customers?business=${business.id}${q ? `&q=${encodeURIComponent(q)}` : ""}` : null, {
    refreshOn: touches(["conversation.started", "appointment.changed", "ticket.created", "lead.created"]),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = list.data?.items ?? [];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Customers"
        meta={list.data ? `${items.length}${q ? " matching" : ""}` : null}
        description="Everyone who has called, chatted or booked, across every channel."
        actions={
          <label className="relative flex items-center">
            <span className="sr-only">Search customers</span>
            <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-fg-faint" />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, email or phone digits"
              className="h-8 w-72 rounded-lg border border-border bg-surface pr-8 pl-8 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent/60"
              style={{ outline: "none" }}
            />
            <Kbd className="absolute right-2">/</Kbd>
          </label>
        }
      />
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {list.error ? <ErrorNote message={list.error} onRetry={() => void list.refresh()} /> : null}
        {list.loading ? (
          <TableSkeleton cols={6} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Users className="size-4" />}
            title={q ? `No one matches “${q}”` : "No customers yet"}
            body={q ? "Try part of a name, an email, or at least three digits of a phone number." : "Customers are created the moment the assistant learns a name and a phone number or email."}
          />
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
              <tr>
                <th className={th}>Customer</th>
                <th className={th}>Contact</th>
                <th className={th}>Language</th>
                <th className={cn(th, "text-right")}>Conversations</th>
                <th className={cn(th, "text-right")}>Bookings</th>
                <th className={cn(th, "text-right")}>Open tickets</th>
                <th className={cn(th, "text-right")}>Last contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((c) => (
                <tr
                  key={c.id}
                  tabIndex={0}
                  onClick={() => setOpenId(c.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpenId(c.id))}
                  className={cn("cursor-pointer transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-offset-[-2px]", openId === c.id && "bg-surface-2")}
                >
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-2xs font-medium text-fg-muted">{initials(c.name)}</span>
                      <span className="font-medium text-fg">{c.name ?? "Unnamed"}</span>
                    </div>
                  </td>
                  <td className={cn(td, "font-mono text-xs text-fg-subtle")}>
                    <div>{c.phone ?? ""}</div>
                    <div className="text-fg-faint">{c.email ?? ""}</div>
                  </td>
                  <td className={td}>{c.language ? <LanguageChip language={c.language} /> : <span className="text-fg-faint">n/a</span>}</td>
                  <td className={cn(td, "tabular text-right text-fg-muted")}>{c.conversations}</td>
                  <td className={cn(td, "tabular text-right text-fg-muted")}>{c.appointments}</td>
                  <td className={cn(td, "tabular text-right")}>{c.openTickets ? <Badge tone="warning">{c.openTickets}</Badge> : <span className="text-fg-faint">0</span>}</td>
                  <td className={cn(td, "tabular text-right text-fg-subtle")}>{c.lastContactAt ? relativeTime(c.lastContactAt, now) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <CustomerDrawer customerId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

export function CustomerDrawer({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const { business } = useConsole();
  const detail = useResource<CustomerDetail>(customerId && business ? `/api/console/customers/${customerId}?business=${business.id}` : null, {
    refreshOn: (events) => events.some((e) => ["appointment.changed", "ticket.created", "lead.created", "followup.changed", "conversation.updated"].includes(e.type)),
  });
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!customerId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [customerId, onClose]);

  return (
    <AnimatePresence>
      {customerId ? (
        <>
          <motion.div className="absolute inset-0 z-20 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Customer details"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0, transition: { duration: 0.14 } }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            className="absolute inset-y-0 right-0 z-30 flex w-[min(520px,92%)] flex-col border-l border-border-strong bg-bg-subtle shadow-lg outline-none"
          >
            {detail.data ? <DrawerBody detail={detail.data} onClose={onClose} /> : detail.error ? <ErrorNote message={detail.error} /> : <DrawerSkeleton />}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function DrawerBody({ detail, onClose }: { detail: CustomerDetail; onClose: () => void }) {
  const { customer, timeline } = detail;
  const counts = {
    conversations: timeline.filter((t) => t.kind === "conversation").length,
    bookings: timeline.filter((t) => t.kind === "appointment").length,
    tickets: timeline.filter((t) => t.kind === "ticket").length,
    leads: timeline.filter((t) => t.kind === "lead").length,
  };
  return (
    <>
      <div className="flex items-start gap-4 border-b border-border px-6 py-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-semibold tracking-[-0.01em] text-accent">{initials(customer.name)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.015em] text-fg">{customer.name ?? "Unnamed customer"}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-fg-subtle">
            {customer.phone ? <a href={`tel:${customer.phone}`} className="hover:text-fg">{customer.phone}</a> : null}
            {customer.email ? <a href={`mailto:${customer.email}`} className="hover:text-fg">{customer.email}</a> : null}
            {customer.language ? <LanguageChip language={customer.language} /> : null}
          </div>
          <div className="mt-1 text-2xs text-fg-faint">Customer since {formatDateTime(customer.createdAt)}</div>
        </div>
        <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="px-4 py-3">
            <div className="tabular text-[22px] font-medium leading-none tracking-[-0.03em] text-fg">{v}</div>
            <div className="mt-1 text-2xs text-fg-subtle capitalize">{k}</div>
          </div>
        ))}
      </div>
      {customer.notes ? (
        <div className="border-b border-border px-6 py-3 text-[12.5px] leading-relaxed text-fg-muted">
          <span className="text-fg-subtle">Notes </span>
          {customer.notes}
        </div>
      ) : null}
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <SectionLabel>Timeline</SectionLabel>
        {timeline.length === 0 ? (
          <p className="mt-3 text-[13px] text-fg-subtle">Nothing recorded for this customer yet.</p>
        ) : (
          <ol className="relative mt-4 space-y-4 before:absolute before:top-1 before:bottom-1 before:left-[13px] before:w-px before:bg-border">
            {timeline.map((item) => (
              <TimelineEntry key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const icon = {
    conversation: item.kind === "conversation" && item.channel === "voice" ? Headphones : MessageSquareText,
    appointment: CalendarCheck2,
    ticket: Ticket,
    lead: Target,
    followup: BellRing,
  }[item.kind];
  const Icon = icon;
  return (
    <li className="relative flex gap-3.5 pl-0">
      <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-fg-subtle">
        <Icon aria-hidden className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-fg">{entryTitle(item)}</span>
          <span className="tabular ml-auto shrink-0 font-mono text-[10.5px] text-fg-faint">{formatDateTime(item.at)}</span>
        </div>
        <EntryBody item={item} />
      </div>
    </li>
  );
}

function entryTitle(item: TimelineItem): string {
  switch (item.kind) {
    case "conversation":
      return item.summary?.headline ?? `${item.channel === "voice" ? "Call" : "Chat"}${item.intent ? `, ${titleCase(item.intent).toLowerCase()}` : ""}`;
    case "appointment":
      return item.service ?? "Appointment";
    case "ticket":
      return `${titleCase(item.category)} ticket`;
    case "lead":
      return item.interest;
    case "followup":
      return `${FOLLOWUP_KIND_LABELS[item.followUpKind] ?? titleCase(item.followUpKind)} by ${item.channel}`;
  }
}

function EntryBody({ item }: { item: TimelineItem }) {
  const line = "mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle";
  switch (item.kind) {
    case "conversation":
      return (
        <div>
          <div className={line}>
            <StatusChip status={item.status} />
            <span>{item.channel === "voice" ? "Voice" : "Chat"}</span>
            <Link href={`/console?c=${item.id}`} className="ml-auto inline-flex items-center gap-0.5 text-fg-muted hover:text-fg">
              Transcript <ArrowUpRight aria-hidden className="size-3" />
            </Link>
          </div>
          {item.summary?.bullets.length ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">{item.summary.bullets.join(" ")}</p> : null}
        </div>
      );
    case "appointment":
      return (
        <div className={line}>
          <Badge tone={item.status === "cancelled" ? "neutral" : item.status === "completed" ? "info" : "success"}>{titleCase(item.status)}</Badge>
          <span>{item.staff ?? ""}</span>
          <span>· {formatDateTime(item.startsAt)}</span>
          {item.priceInr ? <span className="font-mono">· {formatInr(item.priceInr)}</span> : null}
        </div>
      );
    case "ticket":
      return (
        <div>
          <div className={line}>
            <Badge tone={item.status === "resolved" ? "neutral" : "warning"}>{titleCase(item.status)}</Badge>
            <span>{titleCase(item.priority)} priority</span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">{item.summary}</p>
        </div>
      );
    case "lead":
      return (
        <div className={line}>
          <Badge tone="accent">Score {item.score}</Badge>
          <span>{titleCase(item.status)}</span>
        </div>
      );
    case "followup":
      return (
        <div className={line}>
          <Badge tone={item.status === "sent" ? "success" : item.status === "failed" ? "warning" : "neutral"}>{titleCase(item.status)}</Badge>
          <span className="truncate">{item.subject}</span>
        </div>
      );
  }
}

function DrawerSkeleton() {
  return (
    <div className="space-y-6 p-6" aria-busy="true">
      <div className="flex gap-4">
        <div className="skeleton size-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-6 w-48" />
          <div className="skeleton h-3 w-64" />
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="skeleton size-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-56" />
            <div className="skeleton h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
