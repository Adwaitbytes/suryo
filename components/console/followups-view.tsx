"use client";

import { BellRing, Mail, MessageCircle, Phone, Send, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import type { FollowUpRow } from "@/lib/console/types";
import { cn } from "@/lib/utils";
import { useRunFollowUps } from "./actions";
import { errorMessage, sendJson } from "./api";
import { ErrorNote, PageHeader, TableSkeleton, td, th } from "./bits";
import { FOLLOWUP_KIND_LABELS, formatDateTime, relativeTime, titleCase } from "./format";
import { touches, useNow, useResource } from "./hooks";
import { useConsole } from "./provider";

type Bucket = "due" | "scheduled" | "sent" | "failed";

const CHANNEL_ICON: Record<FollowUpRow["channel"], LucideIcon> = { email: Mail, call: Phone, whatsapp: MessageCircle };

function bucketOf(f: FollowUpRow, now: number): Bucket | null {
  if (f.status === "sent") return "sent";
  if (f.status === "failed") return "failed";
  if (f.status === "pending") return new Date(f.dueAt).getTime() <= now ? "due" : "scheduled";
  return null;
}

export function FollowUpsView() {
  const { business, toast } = useConsole();
  const now = useNow(15_000);
  /** Null until the operator picks a tab: open on the first bucket that has something in it. */
  const [chosen, setBucket] = useState<Bucket | null>(null);
  const { run, pending: running } = useRunFollowUps();
  const res = useResource<{ items: FollowUpRow[] }>(business ? `/api/console/followups?business=${business.id}` : null, {
    refreshOn: touches(["followup.changed", "notification.sent", "conversation.updated"]),
  });
  const all = res.data?.items ?? [];
  const counts: Record<Bucket, number> = { due: 0, scheduled: 0, sent: 0, failed: 0 };
  for (const f of all) {
    const b = bucketOf(f, now);
    if (b) counts[b] += 1;
  }
  const bucket: Bucket = chosen ?? (["due", "scheduled", "sent", "failed"] as const).find((b) => counts[b] > 0) ?? "due";
  const rows = all
    .filter((f) => bucketOf(f, now) === bucket)
    .sort((a, b) => (bucket === "scheduled" || bucket === "due" ? a.dueAt.localeCompare(b.dueAt) : b.dueAt.localeCompare(a.dueAt)));

  const mark = async (f: FollowUpRow, status: "sent" | "cancelled") => {
    try {
      await sendJson(`/api/console/followups/${f.id}`, { status }, "PATCH");
      toast({ title: status === "sent" ? "Marked done" : "Follow up cancelled", tone: "success" });
      await res.refresh();
    } catch (err) {
      toast({ title: "Could not update the follow up", body: errorMessage(err), tone: "danger" });
    }
  };

  const tabs: Array<{ value: Bucket; label: string }> = [
    { value: "due", label: "Due now" },
    { value: "scheduled", label: "Scheduled" },
    { value: "sent", label: "Sent" },
    { value: "failed", label: "Failed" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Follow ups"
        meta={res.data ? `${counts.due} due · ${counts.scheduled} scheduled` : null}
        description="Reminders, callbacks and recovery messages for conversations that ended unresolved. Emails send automatically; calls are tasks for staff."
        actions={
          <Button size="sm" variant="secondary" onClick={() => void run()} disabled={running}>
            <Send aria-hidden className="size-3.5" />
            {running ? "Running" : "Run delivery now"}
          </Button>
        }
      />
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-5 2xl:px-7">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={bucket === t.value}
            onClick={() => setBucket(t.value)}
            className={cn(
              "relative flex h-11 items-center gap-2 px-2.5 text-[13px] transition-colors",
              bucket === t.value ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
            )}
          >
            {t.label}
            <span className={cn("tabular rounded px-1.5 font-mono text-2xs leading-5", t.value === "due" && counts.due ? "bg-warning-soft text-warning" : "bg-surface-2 text-fg-faint")}>{counts[t.value]}</span>
            {bucket === t.value ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" /> : null}
          </button>
        ))}
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {res.error ? <ErrorNote message={res.error} onRetry={() => void res.refresh()} /> : null}
        {res.loading ? (
          <TableSkeleton cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BellRing className="size-4" />}
            title={{ due: "Nothing is overdue", scheduled: "Nothing scheduled", sent: "Nothing sent yet", failed: "No failed deliveries" }[bucket]}
            body={
              {
                due: "Call tasks and emails that reach their due time land here until they are done.",
                scheduled: "The assistant schedules reminders and callbacks as it works, and a recovery message when a known customer drops off.",
                sent: "Delivered emails and completed call tasks are kept here for the record.",
                failed: "If an email cannot be delivered the error is shown here so someone can follow up by hand.",
              }[bucket]
            }
          />
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
              <tr>
                <th className={th}>Kind</th>
                <th className={th}>Message</th>
                <th className={th}>Customer</th>
                <th className={th}>{bucket === "sent" ? "Sent" : "Due"}</th>
                <th className={cn(th, "text-right")}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((f) => {
                const Icon = CHANNEL_ICON[f.channel];
                const overdue = bucket === "due";
                return (
                  <tr key={f.id} className="transition-colors hover:bg-surface">
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-7 place-items-center rounded-md border border-border bg-surface-2 text-fg-muted" title={titleCase(f.channel)}>
                          <Icon aria-hidden className="size-3.5" />
                        </span>
                        <div>
                          <div className="text-fg">{FOLLOWUP_KIND_LABELS[f.kind]}</div>
                          <div className="text-2xs text-fg-subtle">{f.channel === "call" ? "Staff call" : titleCase(f.channel)}</div>
                        </div>
                        {f.kind === "recovery" ? <Badge tone="accent">Recovery</Badge> : null}
                      </div>
                    </td>
                    <td className={cn(td, "max-w-[520px]")}>
                      <div className="truncate text-fg">{f.subject}</div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-fg-subtle">{f.body}</div>
                      {f.error ? <div className="mt-1 font-mono text-[11px] text-warning">{f.error}</div> : null}
                    </td>
                    <td className={td}>
                      <div className="text-fg-muted">{f.customerName ?? "Unknown"}</div>
                      <div className="font-mono text-[11px] text-fg-faint">{f.customerContact ?? ""}</div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <div className={cn("tabular text-xs", overdue ? "font-medium text-warning" : "text-fg-muted")}>
                        {overdue ? `Overdue ${relativeTime(f.dueAt, now).replace(" ago", "")}` : relativeTime(f.sentAt ?? f.dueAt, now)}
                      </div>
                      <div className="font-mono text-[10.5px] text-fg-faint">{formatDateTime(f.sentAt ?? f.dueAt)}</div>
                    </td>
                    <td className={cn(td, "text-right")}>
                      {f.status === "pending" ? (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => void mark(f, "cancelled")}>
                            Cancel
                          </Button>
                          {f.channel === "call" ? (
                            <Button size="sm" variant="secondary" onClick={() => void mark(f, "sent")}>
                              <Phone aria-hidden className="size-3.5" /> Mark called
                            </Button>
                          ) : null}
                        </div>
                      ) : f.status === "failed" && f.channel === "email" ? (
                        <span className="text-2xs text-fg-subtle">Reach out by hand</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
