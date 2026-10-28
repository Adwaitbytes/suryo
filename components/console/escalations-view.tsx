"use client";

import { ArrowUpRight, CheckCheck, Hand, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionLabel } from "@/components/ui/primitives";
import type { EscalationQueue, QueueEscalation } from "@/lib/console/types";
import { cn } from "@/lib/utils";
import { errorMessage, sendJson } from "./api";
import { ChannelIcon, ErrorNote, PageHeader, UrgencyChip } from "./bits";
import { TRIGGER_LABELS, elapsed, formatDateTime, isOverdue, isSevere, relativeTime } from "./format";
import { touches, useNow, useResource } from "./hooks";
import { useConsole } from "./provider";

const URGENCY_RAIL: Record<QueueEscalation["urgency"], string> = {
  critical: "bg-danger",
  high: "bg-danger/70",
  medium: "bg-warning",
  low: "bg-border-strong",
};

export function EscalationsView() {
  const { business } = useConsole();
  const now = useNow();
  const queue = useResource<EscalationQueue>(business ? `/api/escalations?business=${business.id}` : null, {
    refreshOn: touches(["escalation.created", "escalation.updated", "conversation.updated"]),
  });
  const open = queue.data?.open ?? [];
  const unclaimed = open.filter((e) => e.status === "open").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Escalations"
        meta={queue.data ? `${unclaimed} waiting · ${open.length - unclaimed} claimed` : null}
        description="Sorted by urgency, then by how long the customer has been waiting."
      />
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {queue.error ? <ErrorNote message={queue.error} onRetry={() => void queue.refresh()} /> : null}
        <div className="mx-auto max-w-[1180px] px-6 py-6 2xl:px-8">
          {queue.loading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-[132px] rounded-xl" style={{ opacity: 1 - i * 0.2 }} />
              ))}
            </div>
          ) : open.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface">
              <EmptyState
                icon={<ShieldCheck className="size-4" />}
                title="Nobody is waiting on a human"
                body="When the assistant hands off an emergency, a billing dispute or a frustrated customer, it lands here with a summary."
              />
            </div>
          ) : (
            <ol className="space-y-3">
              <AnimatePresence initial={false}>
                {open.map((e) => (
                  <motion.li key={e.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ type: "spring", stiffness: 480, damping: 38 }}>
                    <EscalationCard escalation={e} now={now} onChanged={queue.refresh} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}

          {queue.data?.resolved.length ? (
            <section className="mt-10">
              <SectionLabel>Resolved this week</SectionLabel>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
                {queue.data.resolved.map((e) => (
                  <li key={e.id} className="flex items-center gap-4 px-4 py-3 text-[13px]">
                    <UrgencyChip urgency={e.urgency} />
                    <span className="min-w-0 flex-1 truncate text-fg-muted">
                      <span className="text-fg">{e.customerName ?? "Unknown customer"}</span> · {e.reason}
                    </span>
                    <span className="font-mono text-2xs text-fg-faint">{e.claimedBy ?? "Resolved"}</span>
                    <span className="tabular w-24 text-right text-2xs text-fg-subtle">{e.resolvedAt ? relativeTime(e.resolvedAt, now) : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EscalationCard({ escalation: e, now, onChanged }: { escalation: QueueEscalation; now: number; onChanged: () => Promise<void> }) {
  const router = useRouter();
  const { toast, operator } = useConsole();
  const [busy, setBusy] = useState<"claim" | "resolve" | null>(null);
  const lines = e.summary.split("\n").filter(Boolean).slice(0, 3);
  const claimed = e.status === "claimed";
  const overdue = isOverdue(e, now);

  const run = async (action: "claim" | "resolve") => {
    setBusy(action);
    try {
      await sendJson(`/api/escalations/${e.id}`, { action, operator }, "PATCH");
      if (action === "claim") router.push(`/console?c=${e.conversationId}`);
      else {
        toast({ title: "Escalation resolved", tone: "success" });
        await onChanged();
      }
    } catch (err) {
      toast({ title: "That did not go through", body: errorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={cn("group relative overflow-hidden rounded-xl border bg-surface shadow-sm transition-colors", !claimed && isSevere(e.urgency) ? "border-danger/30" : "border-border")}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", URGENCY_RAIL[e.urgency])} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 py-4 pr-5 pl-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <UrgencyChip urgency={e.urgency} solid />
            <h2 className="truncate text-[14.5px] font-medium text-fg">{e.reason}</h2>
          </div>
          <ul className="mt-2.5 space-y-1">
            {lines.map((l, i) => (
              <li key={i} className={cn("text-[13px] leading-relaxed", i === 0 ? "text-fg" : "text-fg-muted")}>
                {l}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3 text-xs text-fg-subtle">
            <ChannelIcon channel={e.channel} className="size-6 rounded-md" />
            <span className="text-fg-muted">{e.customerName ?? (e.channel === "voice" ? "Unknown caller" : "Website visitor")}</span>
            {e.customerPhone ? <span className="font-mono text-2xs">{e.customerPhone}</span> : null}
            <span aria-hidden className="text-fg-faint">·</span>
            <span className="font-mono text-2xs">trigger {TRIGGER_LABELS[e.trigger]?.toLowerCase() ?? e.trigger}</span>
            <span aria-hidden className="text-fg-faint">·</span>
            <span>{formatDateTime(e.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end justify-between gap-3">
          <div className="text-right">
            <div className={cn("tabular font-mono text-[20px] font-medium leading-none tracking-[-0.02em]", claimed ? "text-fg-muted" : overdue ? "text-danger" : "text-fg")}>{elapsed(e.createdAt, now)}</div>
            <div className="mt-1 text-2xs text-fg-subtle">{claimed ? `claimed by ${e.claimedBy}` : "waiting"}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => run("resolve")} disabled={busy !== null}>
              <CheckCheck aria-hidden className="size-3.5" />
              {busy === "resolve" ? "Resolving" : "Resolve"}
            </Button>
            {claimed ? (
              <Button size="sm" variant="secondary" onClick={() => router.push(`/console?c=${e.conversationId}`)}>
                Open
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => run("claim")} disabled={busy !== null}>
                <Hand aria-hidden className="size-3.5" />
                {busy === "claim" ? "Taking over" : "Take over"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
