import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "danger" | "warning" | "success" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-fg-muted border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  success: "bg-success-soft text-success border-transparent",
  info: "bg-info-soft text-info border-transparent",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-2xs font-medium tracking-wide whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Dot({ tone = "neutral", live = false, className }: { tone?: Tone; live?: boolean; className?: string }) {
  const color: Record<Tone, string> = {
    neutral: "bg-fg-faint",
    accent: "bg-accent",
    danger: "bg-danger",
    warning: "bg-warning",
    success: "bg-success",
    info: "bg-info",
  };
  return <span aria-hidden className={cn("inline-block size-1.5 rounded-full", color[tone], live && "live-dot", className)} />;
}
