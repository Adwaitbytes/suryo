"use client";

import { Headphones, MessageSquareText, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Dot, type Tone } from "@/components/ui/badge";
import type { Channel, ConversationStatus } from "@/lib/contracts";
import type { Urgency } from "@/lib/console/types";
import { cn } from "@/lib/utils";
import { LANGUAGE_LABELS, STATUS_META, URGENCY_META, sentimentLabel } from "./format";

export function PageHeader({ title, description, actions, meta }: { title: string; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-4 border-b border-border px-6 2xl:px-8">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h1>
          {meta ? <div className="text-xs text-fg-subtle">{meta}</div> : null}
        </div>
        {description ? <p className="mt-0.5 truncate text-[13px] text-fg-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  const Icon: LucideIcon = channel === "voice" ? Headphones : MessageSquareText;
  return (
    <span
      className={cn("grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-fg-muted", className)}
      title={channel === "voice" ? "Voice call" : "Chat"}
    >
      <Icon aria-hidden className="size-[15px]" strokeWidth={1.75} />
      <span className="sr-only">{channel === "voice" ? "Voice call" : "Chat"}</span>
    </span>
  );
}

export function StatusChip({ status }: { status: ConversationStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone}>
      <Dot tone={meta.tone} live={meta.live} />
      {meta.label}
    </Badge>
  );
}

export function LanguageChip({ language }: { language: string }) {
  return <span className="inline-flex h-5 items-center rounded-md border border-border px-1.5 font-mono text-[10.5px] text-fg-muted">{LANGUAGE_LABELS[language] ?? language.toUpperCase()}</span>;
}

export function UrgencyChip({ urgency, solid = false }: { urgency: Urgency; solid?: boolean }) {
  const meta = URGENCY_META[urgency];
  if (solid && urgency === "critical") return <Badge className="border-transparent bg-danger text-white">{meta.label}</Badge>;
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** A centred bar: fills left in amber when negative and right in green when positive. */
export function SentimentMeter({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(-1, Math.min(1, value));
  const width = Math.abs(clamped) * 50;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`Sentiment ${clamped.toFixed(2)}, ${sentimentLabel(clamped)}`}>
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className="absolute top-0 left-1/2 h-full w-px bg-border-strong" />
        <span
          className={cn("absolute top-0 h-full rounded-full transition-[width,left] duration-500 ease-out", clamped >= 0 ? "bg-success" : "bg-warning")}
          style={clamped >= 0 ? { left: "50%", width: `${width}%` } : { left: `${50 - width}%`, width: `${width}%` }}
        />
      </span>
      <span className="sr-only">Sentiment {sentimentLabel(clamped)}</span>
    </span>
  );
}

export function StatTile({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">{label}</div>
      <div className={cn("tabular mt-1.5 text-[28px] font-medium leading-none tracking-[-0.03em]", tone === "danger" ? "text-danger" : "text-fg")}>{value}</div>
      {sub ? <div className="mt-1.5 truncate text-xs text-fg-subtle">{sub}</div> : null}
    </div>
  );
}

export function SelectChip<T extends string>({
  value,
  options,
  onChange,
  label,
  tone,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  label: string;
  tone?: Tone;
}) {
  const toneClass: Record<Tone, string> = {
    neutral: "bg-surface-3 text-fg-muted",
    accent: "bg-accent-soft text-accent",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
  };
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "h-6 cursor-pointer appearance-none rounded-md border border-transparent py-0 pr-5 pl-2 text-2xs font-medium capitalize outline-none hover:border-border-strong focus-visible:border-accent",
        "bg-[length:10px] bg-[right_6px_center] bg-no-repeat",
        "bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' fill='none' stroke='%2371717a' stroke-width='1.4'/></svg>\")]",
        toneClass[tone ?? "neutral"],
      )}
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-surface-2 text-fg">
          {o.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-6 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="skeleton h-3.5" style={{ width: c === 0 ? 160 : c === 1 ? 220 : 90, opacity: 1 - r * 0.08 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-6 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-[13px] text-fg-muted">
      <span className="size-1.5 rounded-full bg-warning" aria-hidden />
      <span className="flex-1">Could not load this view. {message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="text-fg underline-offset-4 hover:underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export const th = "h-9 px-3 text-left text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle first:pl-6 last:pr-6 2xl:first:pl-8 2xl:last:pr-8";
export const td = "px-3 py-3 align-middle first:pl-6 last:pr-6 2xl:first:pl-8 2xl:last:pr-8";
