"use client";

import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/primitives";
import type { ResultRow } from "@/lib/evals/store";
import { SCENARIOS } from "@/lib/evals/scenarios";
import { cn } from "@/lib/utils";

export function ScenarioDetail({ result, onClose }: { result: ResultRow; onClose: () => void }) {
  const scenario = SCENARIOS.find((s) => s.id === result.scenarioId);
  const judge = result.checks.find((c) => c.name.startsWith("judge"));
  const checks = result.checks.filter((c) => c !== judge);
  return (
    <Panel className="flex max-h-[calc(100dvh-3rem)] flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={result.passed ? "success" : "danger"}>{result.passed ? "Pass" : "Fail"}</Badge>
            <span className="font-mono text-xs text-fg-subtle">{result.scenarioId}</span>
          </div>
          <h3 className="mt-2 text-[15px] font-medium text-fg">{result.title}</h3>
          {scenario ? <p className="mt-1 text-[13px] leading-relaxed text-fg-subtle">{scenario.goal}</p> : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="grid size-8 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg">
          <X className="size-4" />
        </button>
      </div>

      <div className="scroll-quiet flex-1 overflow-y-auto">
        {judge ? (
          <section className="border-b border-border px-5 py-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
              Judge
              <span className={cn("text-xs font-normal", judge.passed ? "text-success" : "text-danger")}>{judge.passed ? "passed" : "failed"}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{judge.detail}</p>
          </section>
        ) : null}

        <section className="border-b border-border px-5 py-4">
          <div className="text-[13px] font-medium text-fg">Checks</div>
          <ul className="mt-2.5 flex flex-col gap-2">
            {checks.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex gap-2.5 text-[13px]">
                <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full", c.passed ? "text-success" : "bg-danger-soft text-danger")}>
                  {c.passed ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className={c.passed ? "text-fg-muted" : "text-fg"}>{c.name}</span>
                  <span className="block break-words text-xs text-fg-subtle">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="px-5 py-4">
          <div className="text-[13px] font-medium text-fg">Transcript</div>
          <ol className="mt-3 flex flex-col gap-3">
            {result.transcript.map((t, i) => (
              <li key={i} className={cn("flex flex-col gap-1", t.role === "customer" ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                    t.role === "customer" ? "rounded-br-md bg-surface-3 text-fg" : "rounded-bl-md border border-border bg-bg-subtle text-fg-muted",
                  )}
                >
                  {t.content || <span className="text-fg-faint">(no reply)</span>}
                </div>
                {t.role === "agent" && (t.tools?.length || t.latencyMs !== undefined) ? (
                  <div className="flex max-w-[88%] flex-wrap items-center gap-1.5 px-1">
                    {t.tools?.map((tool, j) => (
                      <span key={j} className={cn("font-mono text-2xs", tool.includes("failed") ? "text-danger" : "text-fg-subtle")}>
                        {tool}
                      </span>
                    ))}
                    {t.latencyMs !== undefined ? <span className="font-mono text-2xs tabular text-fg-faint">{(t.latencyMs / 1000).toFixed(1)}s</span> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Panel>
  );
}
