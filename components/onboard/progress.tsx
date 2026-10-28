"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { DocumentRead, StepState } from "./use-onboard";
import type { OnboardStep } from "@/lib/onboard/pipeline";

const seconds = (ms?: number) => (ms === undefined ? "" : `${(ms / 1000).toFixed(1)}s`);

export function ProgressTimeline({ steps, order, failed }: { steps: Record<OnboardStep, StepState>; order: OnboardStep[]; failed: boolean }) {
  return (
    <ol className="relative flex flex-col">
      {order.map((key, i) => {
        const step = steps[key];
        const last = i === order.length - 1;
        const stalled = failed && step.status === "active";
        return (
          <li key={key} className="relative flex gap-4 pb-5 last:pb-0">
            {!last ? (
              <span aria-hidden className={cn("absolute left-[9px] top-6 bottom-0 w-px transition-colors duration-500", step.status === "done" ? "bg-accent/50" : "bg-border")} />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full border transition-[background-color,border-color] duration-300",
                step.status === "done" && "border-accent bg-accent text-accent-fg",
                step.status === "active" && !stalled && "border-accent bg-accent-soft",
                stalled && "border-danger bg-danger-soft",
                step.status === "pending" && "border-border-strong bg-surface",
              )}
            >
              {step.status === "done" ? <Check className="size-3" strokeWidth={3} /> : null}
              {step.status === "active" && !stalled ? <span className="live-dot size-1.5 rounded-full bg-accent" /> : null}
            </span>
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-4">
              <div className="min-w-0">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={step.label}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className={cn("truncate text-sm", step.status === "pending" ? "text-fg-subtle" : "text-fg", stalled && "text-danger")}
                  >
                    {step.label}
                  </motion.div>
                </AnimatePresence>
                {step.detail ? <div className="mt-0.5 truncate text-xs text-fg-subtle">{step.detail}</div> : null}
              </div>
              <span className="shrink-0 font-mono text-xs tabular text-fg-subtle">{step.status === "done" ? seconds(step.at) : ""}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function PageFeed({ pages }: { pages: Array<{ url: string; title: string; at: number }> }) {
  if (pages.length === 0) {
    return (
      <div className="flex flex-col gap-2.5" aria-hidden>
        {[72, 54, 64].map((w) => (
          <div key={w} className="skeleton h-3.5" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {pages.map((p) => {
          const path = new URL(p.url).pathname;
          return (
            <motion.li
              key={p.url}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-baseline justify-between gap-3 text-[13px]"
            >
              <span className="min-w-0 truncate text-fg-muted">
                <span className="font-mono text-fg">{path === "/" ? "/" : path}</span>
                <span className="ml-2 text-fg-subtle">{p.title.split(/\s[|·-]\s/)[0]}</span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular text-fg-faint">{seconds(p.at)}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

export function DocumentFeed({ documents, expected }: { documents: DocumentRead[]; expected: number }) {
  const pending = Math.max(0, expected - documents.length);
  return (
    <ul className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {documents.map((d) => (
          <motion.li
            key={d.name}
            layout
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-baseline justify-between gap-3 text-[13px]"
          >
            <span className="min-w-0 truncate text-fg-muted">
              <span className="font-mono text-fg">{d.name}</span>
              <span className="ml-2 text-fg-subtle">
                {d.kind === "pdf" ? `${d.pages} page${d.pages === 1 ? "" : "s"}` : d.kind.toUpperCase()}, {d.chars.toLocaleString("en-IN")} characters
              </span>
            </span>
            <span className="shrink-0 font-mono text-xs tabular text-fg-faint">{seconds(d.at)}</span>
          </motion.li>
        ))}
      </AnimatePresence>
      {Array.from({ length: pending }, (_, i) => (
        <li key={`pending-${i}`} aria-hidden>
          <div className="skeleton h-3.5" style={{ width: `${[64, 48, 56][i % 3]}%` }} />
        </li>
      ))}
    </ul>
  );
}
