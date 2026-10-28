"use client";

import { AnimatePresence, motion } from "motion/react";
import { Headphones, MessageSquareText, Radio } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import type { LiveConversation } from "@/lib/console/types";
import { cn } from "@/lib/utils";
import { UrgencyChip } from "../bits";
import { LANGUAGE_LABELS, STAGE_LABELS, STATUS_META, isSevere, relativeTime, titleCase } from "../format";
import type { ConversationStage } from "@/lib/contracts";

export type ListFilter = "open" | "all";

export const isOpen = (c: LiveConversation) => c.status === "active" || c.status === "escalated" || c.status === "human";

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  filter,
  onFilter,
  now,
  loading,
  agentName,
}: {
  conversations: LiveConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
  now: number;
  loading: boolean;
  agentName: string;
}) {
  const openCount = conversations.filter(isOpen).length;
  const visible = filter === "open" ? conversations.filter(isOpen) : conversations;

  return (
    <section aria-label="Conversations" className="flex min-h-0 flex-col border-r border-border">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
        {(["open", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors",
              filter === f ? "bg-surface-2 text-fg shadow-sm" : "text-fg-subtle hover:text-fg-muted",
            )}
          >
            {f === "open" ? "Open" : "Last 24 hours"}
            <span className="tabular font-mono text-2xs text-fg-faint">{f === "open" ? openCount : conversations.length}</span>
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-fg-faint">J K to move</span>
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Conversation list">
        {loading ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Radio className="size-4" />}
            title={filter === "open" ? "No one is on the line right now" : "No conversations in the last day"}
            body={filter === "open" ? "New calls and chats appear here the moment they start. Open the customer chat from the command menu to try one." : "Once customers call or chat, their conversations collect here."}
          />
        ) : (
          <ul className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {visible.map((c) => (
                <motion.li
                  key={c.id}
                  layout="position"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                >
                  <Row conversation={c} selected={c.id === selectedId} onSelect={onSelect} now={now} agentName={agentName} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}

const DOT_CLASS = { success: "bg-success", info: "bg-info", danger: "bg-danger", warning: "bg-warning", neutral: "bg-fg-faint" } as const;

function statusDot(c: LiveConversation): keyof typeof DOT_CLASS {
  if (c.status === "escalated") return c.escalation && !isSevere(c.escalation.urgency) ? "warning" : "danger";
  if (c.status === "resolved" || c.status === "abandoned") return "neutral";
  if (c.sentiment < -0.3) return "warning";
  return c.status === "human" ? "info" : "success";
}

function Row({
  conversation: c,
  selected,
  onSelect,
  now,
  agentName,
}: {
  conversation: LiveConversation;
  selected: boolean;
  onSelect: (id: string) => void;
  now: number;
  agentName: string;
}) {
  const knownIntent = c.intent && c.intent !== "other" ? c.intent : null;
  const stage = STAGE_LABELS[c.stage as ConversationStage] ?? titleCase(c.stage);
  const author = c.lastMessage?.role === "human" ? "Staff: " : c.lastMessage?.role === "agent" ? `${agentName}: ` : "";
  const preview = c.lastMessage ? `${author}${c.lastMessage.content}` : "Waiting for the first message";
  const dot = statusDot(c);
  const ChannelGlyph = c.channel === "voice" ? Headphones : MessageSquareText;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-conversation={c.id}
      onClick={() => onSelect(c.id)}
      className={cn(
        "relative block w-full px-4 py-2.5 text-left transition-colors focus-visible:outline-offset-[-2px]",
        selected ? "bg-surface-2" : "hover:bg-surface",
      )}
    >
      {selected ? <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-accent" /> : null}
      <span className="flex h-5 items-center gap-2">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[dot], STATUS_META[c.status].live && "live-dot")} />
        <span className="sr-only">{STATUS_META[c.status].label}.</span>
        <span className={cn("min-w-0 truncate text-[13.5px] font-medium", c.customerName ? "text-fg" : "text-fg-muted")}>
          {c.customerName ?? (c.channel === "voice" ? "Unknown caller" : "Website visitor")}
        </span>
        {c.escalation && c.escalation.status !== "resolved" ? <UrgencyChip urgency={c.escalation.urgency} solid /> : null}
        <span className="tabular ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] text-fg-faint">
          <ChannelGlyph aria-label={c.channel === "voice" ? "Voice call" : "Chat"} className="size-3" strokeWidth={1.75} />
          {LANGUAGE_LABELS[c.language] ?? c.language.toUpperCase()} · {relativeTime(c.lastActivityAt, now)}
        </span>
      </span>
      <span className="mt-0.5 block truncate pl-3.5 text-[12.5px] leading-snug text-fg-muted">{c.headline ?? preview}</span>
      {knownIntent ? (
        <span className="mt-0.5 block truncate pl-3.5 text-2xs text-fg-subtle">
          {titleCase(knownIntent)} · {stage}
        </span>
      ) : null}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="space-y-2 px-4 py-3" style={{ opacity: 1 - i * 0.12 }}>
          <div className="skeleton h-3.5 w-32" />
          <div className="skeleton h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
