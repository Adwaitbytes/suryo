import { cn } from "@/lib/utils";

/** Suryo mark: a rising sun over a horizon line, drawn in code so it stays crisp at any size. */
export function SuryoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-6", className)}>
      <path d="M6 20a10 10 0 0 1 20 0Z" fill="var(--accent)" />
      <path d="M3 23.5h26" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 27h16" stroke="var(--accent)" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <SuryoMark />
      <span className="font-display text-[24px] leading-none tracking-[-0.01em] text-fg">Suryo</span>
    </span>
  );
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return "No data yet";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
