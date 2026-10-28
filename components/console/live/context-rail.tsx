"use client";

import { CircleAlert, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SectionLabel } from "@/components/ui/primitives";
import type { ConversationStage } from "@/lib/contracts";
import type { ConversationDetail, ToolCallRow } from "@/lib/console/types";
import { cn } from "@/lib/utils";
import { UrgencyChip } from "../bits";
import { LANGUAGE_NAMES, STAGES, STAGE_LABELS, TOOL_LABELS, TRIGGER_LABELS, elapsed, formatClock, formatMs, sentimentLabel, titleCase } from "../format";

export function ContextRail({ detail, now }: { detail: ConversationDetail; now: number }) {
  const { conversation, escalation, toolCalls, messages } = detail;
  const sentiments = messages.filter((m) => m.role === "customer" && typeof m.meta.sentiment === "number").map((m) => ({ value: m.meta.sentiment as number, at: m.createdAt }));
  const openEscalation = escalation && escalation.status !== "resolved" ? escalation : null;

  return (
    <aside aria-label="Conversation context" className="scroll-quiet flex min-h-0 flex-col overflow-y-auto border-l border-border bg-bg-subtle">
      {openEscalation ? (
        <section className="border-b border-danger/30 bg-danger-soft px-5 py-4">
          <div className="flex items-center gap-2">
            <CircleAlert aria-hidden className="size-4 text-danger" />
            <span className="text-[13px] font-medium text-danger">{openEscalation.status === "claimed" ? `Claimed by ${openEscalation.claimedBy?.split(" (")[0] ?? "staff"}` : "Escalated, unclaimed"}</span>
            <UrgencyChip urgency={openEscalation.urgency} solid />
            <span className="tabular ml-auto whitespace-nowrap font-mono text-2xs text-danger">{elapsed(openEscalation.createdAt, now)}</span>
          </div>
          <div className="mt-2 text-[13px] text-fg">{openEscalation.reason}</div>
          <div className="mt-1 font-mono text-2xs text-fg-subtle">
            trigger {TRIGGER_LABELS[openEscalation.trigger]?.toLowerCase() ?? openEscalation.trigger}

          </div>
        </section>
      ) : null}

      <section className="border-b border-border px-5 py-4">
        <SectionLabel className="flex items-center gap-1.5">
          <Sparkles aria-hidden className="size-3" /> AI summary
        </SectionLabel>
        {conversation.summary ? (
          <div className="mt-2.5">
            <div className="text-[14px] font-medium leading-snug text-fg">{conversation.summary.headline}</div>
            <ul className="mt-2 space-y-1.5">
              {conversation.summary.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-fg-muted">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-faint" />
                  {b}
                </li>
              ))}
            </ul>
            {conversation.summary.nextStep && conversation.summary.nextStep !== "None" ? (
              <div className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-fg-muted">
                <span className="text-fg-subtle">Next step </span>
                {conversation.summary.nextStep}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] leading-relaxed text-fg-subtle">Written automatically when the conversation is escalated or ends.</p>
        )}
      </section>

      <section className="border-b border-border px-5 py-4">
        <SectionLabel>Stage</SectionLabel>
        <StageStepper stage={conversation.stage} closed={conversation.status === "resolved" || conversation.status === "abandoned"} />
      </section>

      <section className="grid grid-cols-2 gap-4 border-b border-border px-5 py-4">
        <div className="col-span-2">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Sentiment</SectionLabel>
            <span className="text-xs text-fg-muted">
              {sentimentLabel(conversation.sentiment)} <span className="tabular font-mono text-fg-subtle">{conversation.sentiment > 0 ? "+" : ""}{conversation.sentiment.toFixed(2)}</span>
            </span>
          </div>
          <Sparkline points={sentiments} />
        </div>
        <div>
          <SectionLabel>Language</SectionLabel>
          <div className="mt-1.5 text-[13px] text-fg">{LANGUAGE_NAMES[conversation.language] ?? conversation.language}</div>
        </div>
        <div>
          <SectionLabel>Intent</SectionLabel>
          <div className="mt-1.5 truncate text-[13px] text-fg">{conversation.intent ? titleCase(conversation.intent) : "Not yet known"}</div>
        </div>
      </section>

      <section className="px-5 py-4">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Tool calls</SectionLabel>
          <span className="tabular font-mono text-2xs text-fg-faint">{toolCalls.length}</span>
        </div>
        <ToolRail calls={toolCalls} />
      </section>
    </aside>
  );
}

function StageStepper({ stage, closed }: { stage: string; closed: boolean }) {
  const current = closed ? STAGES.length - 1 : Math.max(0, STAGES.indexOf(stage as ConversationStage));
  return (
    <ol className="mt-3 flex items-center gap-1" aria-label={`Stage ${current + 1} of ${STAGES.length}: ${STAGE_LABELS[STAGES[current]]}`}>
      {STAGES.map((s, i) => (
        <li key={s} className="flex-1" title={STAGE_LABELS[s]}>
          <motion.span
            className={cn("block h-1.5 rounded-full", i < current || (closed && i === current) ? "bg-fg-muted" : i === current ? "bg-accent" : "bg-surface-3")}
            layout
          />
        </li>
      ))}
      <li className="sr-only">Current stage {STAGE_LABELS[STAGES[current]]}</li>
    </ol>
  );
}

/** Per message sentiment from -1 to 1 with the neutral line drawn, so the trend reads at a glance. */
function Sparkline({ points }: { points: Array<{ value: number; at: string }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 280;
  const H = 56;
  const pad = 6;
  if (points.length === 0) return <div className="mt-2 flex h-14 items-center text-[12.5px] text-fg-subtle">Appears after the first customer message.</div>;
  const x = (i: number) => (points.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (points.length - 1));
  const y = (v: number) => pad + ((1 - v) / 2) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const active = hover ?? points.length - 1;
  return (
    <div className="relative mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full overflow-visible" role="img" aria-label={`Sentiment across ${points.length} customer messages, latest ${points[points.length - 1].value.toFixed(2)}`}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeDasharray="2 3" />
        <text x={W} y={y(1) + 4} textAnchor="end" className="fill-fg-faint font-mono text-[9px]">+1</text>
        <text x={W} y={y(-1)} textAnchor="end" className="fill-fg-faint font-mono text-[9px]">-1</text>
        {points.length > 1 ? <path d={d} fill="none" stroke="var(--fg-muted)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {points.map((p, i) => (
          <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <rect x={x(i) - 10} y={0} width={20} height={H} fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={i === active ? 4 : 2.5}
              fill={p.value <= -0.25 ? "var(--warning)" : p.value >= 0.25 ? "var(--success)" : "var(--fg-muted)"}
              stroke="var(--bg-subtle)"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-faint">
        <span>{hover !== null ? `message ${hover + 1}` : "first"}</span>
        <span className="tabular">
          {points[active].value > 0 ? "+" : ""}
          {points[active].value.toFixed(2)} at {formatClock(points[active].at)}
        </span>
      </div>
    </div>
  );
}

function ToolRail({ calls }: { calls: ToolCallRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (calls.length === 0) return <p className="mt-2 text-[12.5px] leading-relaxed text-fg-subtle">Every lookup, booking and ticket the agent runs is logged here with its timing.</p>;
  return (
    <ol className="relative mt-3 space-y-0.5 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-border">
      <AnimatePresence initial={false}>
        {calls.map((call) => (
          <motion.li key={call.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="relative pl-6">
            <span
              aria-hidden
              className={cn("absolute top-[9px] left-[3px] grid size-[9px] place-items-center rounded-full ring-4 ring-bg-subtle", call.ok ? "bg-success" : "bg-warning")}
            />
            <button
              type="button"
              onClick={() => setOpenId((id) => (id === call.id ? null : call.id))}
              aria-expanded={openId === call.id}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface"
            >
              <span className="truncate font-mono text-[11.5px] text-fg">{call.name}</span>
              {!call.ok ? <span className="font-mono text-[10px] text-warning">failed</span> : null}
              <span className="tabular ml-auto shrink-0 font-mono text-[10.5px] text-fg-subtle">{formatMs(call.durationMs)}</span>
            </button>
            <div className="px-1.5 text-2xs text-fg-faint">
              {TOOL_LABELS[call.name] ?? call.name} · {formatClock(call.createdAt)}
            </div>
            {openId === call.id ? (
              <pre className="scroll-quiet mt-1.5 mb-2 max-h-40 overflow-auto rounded-lg border border-border bg-surface p-2 font-mono text-[10.5px] leading-relaxed text-fg-muted">
                {JSON.stringify(call.input, null, 2)}
              </pre>
            ) : null}
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
