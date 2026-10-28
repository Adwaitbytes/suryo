"use client";

import { BookOpen, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { TranscriptMessage } from "@/lib/console/types";
import { cn } from "@/lib/utils";
import { TOOL_LABELS, formatClock, formatMs, sentimentLabel } from "../format";
import { MessageCard } from "./cards";

export function Transcript({ messages, customerLabel, agentName }: { messages: TranscriptMessage[]; customerLabel: string; agentName: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const count = messages.length;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Follow new messages only while the operator is reading the latest ones.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTo({ top: el.scrollHeight, behavior: count > 0 ? "smooth" : "auto" });
  }, [count]);

  return (
    <div ref={scroller} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 py-6 2xl:px-10" aria-live="polite" aria-label="Transcript">
      <ol className="mx-auto flex max-w-[760px] flex-col gap-5">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 480, damping: 38 }}
            >
              <Bubble message={m} customerLabel={customerLabel} agentName={agentName} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}

function Bubble({ message: m, customerLabel, agentName }: { message: TranscriptMessage; customerLabel: string; agentName: string }) {
  if (m.role === "system") {
    return (
      <div className="flex items-center gap-3 font-mono text-[11px] text-fg-subtle">
        <span className="h-px flex-1 bg-border" />
        <span>
          {m.content} · {formatClock(m.createdAt)}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  const customer = m.role === "customer";
  const human = m.role === "human";
  const tools = m.meta.tools ?? [];
  const sources = m.meta.sources ?? [];
  const cards = m.meta.cards ?? [];
  const author = customer ? customerLabel : human ? (m.meta.operator ?? "Front desk") : agentName;

  return (
    <div className={cn("flex flex-col gap-1.5", customer ? "items-start" : "items-end")}>
      <div className="flex items-center gap-2 px-1 text-2xs text-fg-subtle">
        <span className={cn("font-medium", human ? "text-info" : customer ? "text-fg-muted" : "text-fg-muted")}>{author}</span>
        {!customer && !human ? <span className="rounded border border-border px-1 font-mono text-[9.5px] uppercase tracking-wider text-fg-faint">AI</span> : null}
        {human && m.meta.suggested ? <span className="font-mono text-[9.5px] text-fg-faint">edited draft</span> : null}
        <span className="tabular font-mono text-fg-faint">{formatClock(m.createdAt)}</span>
        {customer && typeof m.meta.sentiment === "number" ? (
          <span className={cn("font-mono", m.meta.sentiment <= -0.25 ? "text-warning" : m.meta.sentiment >= 0.25 ? "text-success" : "text-fg-faint")}>
            {sentimentLabel(m.meta.sentiment).toLowerCase()} {m.meta.sentiment > 0 ? "+" : ""}
            {m.meta.sentiment.toFixed(2)}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "max-w-[min(560px,88%)] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
          customer && "rounded-tl-md bg-surface-2 text-fg",
          human && "rounded-tr-md border border-info/30 bg-info-soft text-fg",
          m.role === "agent" && "rounded-tr-md border border-border bg-surface text-fg",
        )}
      >
        {m.content}
      </div>
      {cards.length ? (
        <div className="flex w-full flex-col items-end gap-2">
          {cards.map((card, i) => (
            <MessageCard key={i} card={card} />
          ))}
        </div>
      ) : null}
      {m.role === "agent" && (tools.length || sources.length || m.meta.latencyMs) ? (
        <div className="flex max-w-[88%] flex-wrap items-center justify-end gap-1.5 px-1 font-mono text-[10.5px] text-fg-subtle">
          {tools.map((t, i) => (
            <span key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-px">
              <Wrench aria-hidden className="size-2.5" />
              {TOOL_LABELS[t] ?? t}
            </span>
          ))}
          {sources.slice(0, 3).map((s) => (
            <span key={s.id} className="inline-flex max-w-[220px] items-center gap-1 truncate rounded border border-border px-1.5 py-px" title={`${s.title} (score ${s.score.toFixed(2)})`}>
              <BookOpen aria-hidden className="size-2.5 shrink-0" />
              <span className="truncate">{s.title}</span>
            </span>
          ))}
          {m.meta.latencyMs ? (
            <span className="tabular text-fg-faint">
              {m.meta.firstTokenMs ? `${formatMs(m.meta.firstTokenMs)} first token · ` : ""}
              {formatMs(m.meta.latencyMs)} total
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
