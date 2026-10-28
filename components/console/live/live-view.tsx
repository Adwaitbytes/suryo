"use client";

import { MousePointerClick } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/primitives";
import type { ConversationDetail, Snapshot } from "@/lib/console/types";
import { cn, formatInr } from "@/lib/utils";
import { ErrorNote, StatTile } from "../bits";
import { elapsed, formatMs } from "../format";
import { useNow, useResource } from "../hooks";
import { useConsole } from "../provider";
import { ActivityFeed } from "./activity";
import { ContextRail } from "./context-rail";
import { ConversationPane } from "./conversation-detail";
import { ConversationList, isOpen, type ListFilter } from "./conversation-list";

export function LiveView() {
  const { snapshot, snapshotError, refreshSnapshot, business } = useConsole();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow();
  /** Null follows the selection: a finished conversation opened by link shows the full list. */
  const [chosenFilter, setFilter] = useState<ListFilter | null>(null);
  const selectedId = params.get("c");
  const agentName = business?.agentName ?? "Suryo";

  const conversations = useMemo(() => snapshot?.conversations ?? [], [snapshot]);
  const selected = conversations.find((c) => c.id === selectedId);
  const filter: ListFilter = chosenFilter ?? (selected && !isOpen(selected) ? "all" : "open");
  const visible = useMemo(() => (filter === "open" ? conversations.filter(isOpen) : conversations), [conversations, filter]);

  const select = useCallback(
    (id: string) => {
      router.replace(`${pathname}?c=${id}`, { scroll: false });
    },
    [router, pathname],
  );

  // Land on the most relevant conversation so the live pane is never blank during a demo.
  useEffect(() => {
    if (selectedId || !snapshot || !business || snapshot.business.id !== business.id) return;
    const first = snapshot.conversations.find(isOpen) ?? snapshot.conversations[0];
    if (first) select(first.id);
  }, [selectedId, snapshot, business, select]);

  // J and K move through the list without leaving the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)))) return;
      if (e.key !== "j" && e.key !== "k") return;
      if (!visible.length) return;
      const index = visible.findIndex((c) => c.id === selectedId);
      const next = e.key === "j" ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1);
      select(visible[next].id);
      document.querySelector(`[data-conversation="${visible[next].id}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, select]);

  const detail = useResource<ConversationDetail>(selectedId ? `/api/console/conversations/${selectedId}` : null, {
    refreshOn: (events) => events.some((e) => e.conversationId === selectedId),
  });

  const onChanged = useCallback(async () => {
    await Promise.all([detail.refresh(), refreshSnapshot()]);
  }, [detail, refreshSnapshot]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <KpiStrip snapshot={snapshot} now={now} />
      {snapshotError && !snapshot ? <ErrorNote message={snapshotError} onRetry={() => void refreshSnapshot()} /> : null}
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_300px] xl:grid-cols-[340px_minmax(0,1fr)_320px] 2xl:grid-cols-[380px_minmax(0,1fr)_380px]">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={select}
          filter={filter}
          onFilter={setFilter}
          now={now}
          loading={!snapshot}
          agentName={agentName}
        />
        {selectedId ? (
          detail.data ? (
            <ConversationPane detail={detail.data} now={now} onChanged={onChanged} agentName={agentName} />
          ) : detail.error ? (
            <div className="flex items-center justify-center">
              <EmptyState title="Conversation unavailable" body={detail.error} />
            </div>
          ) : (
            <PaneSkeleton />
          )
        ) : (
          <div className="flex items-center justify-center">
            {snapshot ? (
              <EmptyState icon={<MousePointerClick className="size-4" />} title="Pick a conversation" body="Select one on the left to watch the transcript, tool calls and sentiment as they happen." />
            ) : (
              <PaneSkeleton />
            )}
          </div>
        )}
        {selectedId && detail.data ? (
          <ContextRail detail={detail.data} now={now} />
        ) : (
          <ActivityFeed items={snapshot?.activity ?? []} now={now} agentName={agentName} onOpen={select} />
        )}
      </div>
    </div>
  );
}

function KpiStrip({ snapshot, now }: { snapshot: Snapshot | null; now: number }) {
  if (!snapshot) {
    return (
      <div className="grid h-[104px] shrink-0 grid-cols-6 gap-6 border-b border-border px-6 py-5 2xl:px-8" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2.5">
            <div className="skeleton h-2.5 w-20" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>
    );
  }
  const a = snapshot.analytics;
  const live = snapshot.conversations.filter(isOpen);
  const open = snapshot.escalations.filter((e) => e.status === "open");
  const critical = open.some((e) => e.urgency === "critical");
  const oldest = open.reduce<string | null>((min, e) => (!min || e.createdAt < min ? e.createdAt : min), null);
  return (
    <div className="grid h-[104px] shrink-0 grid-cols-6 gap-6 border-b border-border px-6 py-5 2xl:px-8">
      <StatTile
        label="Live now"
        value={live.length}
        sub={live.length ? `${live.filter((c) => c.channel === "voice").length} voice · ${live.filter((c) => c.channel === "chat").length} chat` : "No one on the line"}
      />
      <StatTile label="Handled, 14 days" value={a.conversations.toLocaleString("en-IN")} sub={`${a.voice} calls · ${a.chat} chats`} />
      <StatTile label="Contained by AI" value={`${Math.round(a.containmentRate * 100)}%`} sub="Finished without a human" />
      <StatTile label="Booked by AI" value={a.bookings} sub={a.revenueBookedInr ? `${formatInr(a.revenueBookedInr)} in fees` : "No bookings yet"} />
      <StatTile label="Avg response" value={a.avgResponseMs ? formatMs(a.avgResponseMs) : "n/a"} sub={a.p50FirstTokenMs ? `${formatMs(a.p50FirstTokenMs)} median first token` : "Across agent replies"} />
      <Link href="/console/escalations" className={cn("-m-2 rounded-xl p-2 transition-colors", critical ? "hover:bg-danger-soft" : "hover:bg-surface")}>
        <StatTile
          label="Open escalations"
          value={open.length}
          tone={critical ? "danger" : undefined}
          sub={oldest ? `Oldest waiting ${elapsed(oldest, now)}` : "Queue is clear"}
        />
      </Link>
    </div>
  );
}

function PaneSkeleton() {
  return (
    <div className="flex h-full w-full flex-col" aria-busy="true" aria-label="Loading conversation">
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="skeleton size-9 rounded-lg" />
        <div className="space-y-2">
          <div className="skeleton h-3.5 w-40" />
          <div className="skeleton h-2.5 w-56" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[760px] flex-1 space-y-6 px-6 py-8">
        {[0.55, 0.7, 0.45, 0.65].map((w, i) => (
          <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
            <div className="skeleton h-14 rounded-2xl" style={{ width: `${w * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
