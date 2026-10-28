"use client";

import { Check, FlaskConical, Loader2, Play, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Panel } from "@/components/ui/primitives";
import type { RunDetail, RunSummary } from "@/lib/evals/store";
import { SCENARIOS } from "@/lib/evals/scenarios";
import { cn } from "@/lib/utils";
import { ScenarioDetail } from "./scenario-detail";

type Latest = { active: RunSummary | null; latest: RunDetail | null; history: RunSummary[] };

const ease = [0.22, 1, 0.36, 1] as const;
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const seconds = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)}s`);

export function EvalDashboard({ initial }: { initial: Latest }) {
  const [state, setState] = useState<Latest>(initial);
  const [viewing, setViewing] = useState<RunDetail | null>(initial.latest);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const running = Boolean(state.active);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/evals/latest", { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load results (HTTP ${res.status}).`);
    const next = (await res.json()) as Latest;
    setState(next);
    setViewing((current) => (!current || current.run.id === next.latest?.run.id || current.run.status === "running" ? next.latest : current));
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not refresh."));
    }, 2500);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const startRun = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/evals/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok && res.status !== 409) throw new Error(body?.error ?? `Could not start a run (HTTP ${res.status}).`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a run.");
    } finally {
      setStarting(false);
    }
  };

  const openRun = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/evals/runs/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not load that run (HTTP ${res.status}).`);
      setViewing((await res.json()) as RunDetail);
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that run.");
    }
  };

  const run = viewing?.run ?? null;
  const results = useMemo(() => viewing?.results ?? [], [viewing]);
  const failing = results.filter((r) => !r.passed);
  const ordered = useMemo(() => [...results.filter((r) => !r.passed), ...results.filter((r) => r.passed)], [results]);
  const selected = results.find((r) => r.id === selectedId) ?? null;
  const live = run?.status === "running";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
      <header className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/" className="text-sm text-fg-subtle transition-colors hover:text-fg">
            Suryo
          </Link>
          {run && run.total < SCENARIOS.length && !live ? (
            <p className="mt-4 text-[13px] text-warning">Targeted rerun of {run.total} scenario{run.total === 1 ? "" : "s"}, not the full suite.</p>
          ) : null}
          {run && run.completed > 0 ? (
            <h1 className="font-display mt-4 text-[52px] leading-[1.02] text-fg sm:text-[76px]">
              <span className="tabular">{run.passed}</span> of <span className="tabular">{live ? run.completed : results.length}</span> passing
              {live ? <span className="text-fg-subtle"> so far</span> : null}
            </h1>
          ) : (
            <h1 className="font-display mt-4 text-[52px] leading-[1.02] text-fg sm:text-[76px]">{live ? "Running the suite" : "No runs yet"}</h1>
          )}
          {run ? (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-fg-subtle">
              {run.completed > 0 ? <span><span className="text-fg tabular">{Math.round((run.passed / Math.max(1, run.completed)) * 100)}%</span> pass rate{live ? " so far" : ""}</span> : null}
              <span><span className="text-fg tabular">{seconds(run.avgLatencyMs ?? avgLatency(results))}</span> average reply</span>
              <span>{live ? `Started ${fmtDate(run.startedAt)}` : `Run ${fmtDate(run.startedAt)}`}</span>
              {run.status === "failed" ? <span className="text-danger">Run stopped before finishing</span> : null}
            </div>
          ) : null}
          <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-fg-muted">
            A simulated customer plays scripted scenarios against the live agent. Checks are computed from the transcript and the database, then an independent judge grades each conversation against its rubric.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          {running || starting ? (
            <Button variant="secondary" size="lg" aria-disabled className="pointer-events-none">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              {starting ? "Starting" : "Running"}
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={startRun}>
              <Play className="size-4" /> Run evals
            </Button>
          )}
          {state.active ? <RunProgress run={state.active} /> : <span className="text-xs text-fg-subtle">Runs against the live agent, about five minutes</span>}
        </div>
      </header>

      {error ? (
        <div role="alert" className="mt-6 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      ) : null}

      {!run ? (
        <Panel className="mt-10">
          <EmptyState
            icon={<FlaskConical className="size-4" />}
            title="Run the suite to get a scorecard"
            body="A simulated customer plays each scenario against the real agent. Bookings and tickets it creates are cleaned up afterwards."
          />
        </Panel>
      ) : (
        <>
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_300px]">
            <Panel className="p-6">
              <h2 className="text-sm font-medium text-fg">By category</h2>
              {viewing && viewing.categories.length ? (
                <ul className="mt-5 grid gap-x-8 gap-y-3.5 sm:grid-cols-3">
                  {viewing.categories.map((c) => {
                    const pct = c.total ? c.passed / c.total : 0;
                    return (
                      <li key={c.category} className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between text-[13px]">
                          <span className="text-fg-muted">{c.label}</span>
                          <span className={cn("font-mono tabular", pct === 1 ? "text-fg-subtle" : pct === 0 ? "text-danger" : "text-fg")}>
                            {c.passed}/{c.total}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${c.label}: ${c.passed} of ${c.total} passing`}>
                          <div
                            className={cn("h-full rounded-full transition-[width] duration-500 ease-out-quint", pct === 1 ? "bg-success" : pct === 0 ? "bg-danger" : "bg-fg-muted/60")}
                            style={{ width: `${pct * 100}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-hidden>
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="skeleton h-6" />
                  ))}
                </div>
              )}
            </Panel>

            <Panel className="p-6">
              <h2 className="text-sm font-medium text-fg">History</h2>
              <ul className="scroll-quiet mt-4 flex max-h-[220px] flex-col overflow-y-auto">
                {state.history.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => openRun(h.id)}
                      className={cn(
                        "-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2",
                        viewing?.run.id === h.id && "bg-surface-2",
                      )}
                    >
                      <span className="text-fg-muted">{fmtDate(h.startedAt)}</span>
                      <span className="flex items-center gap-2">
                        {h.status === "running" ? <Badge tone="accent">Running</Badge> : h.status === "failed" ? <Badge tone="danger">Stopped</Badge> : h.total < SCENARIOS.length ? <Badge>Rerun</Badge> : null}
                        <span className="font-mono tabular text-fg">
                          {h.passed}/{h.status === "done" ? h.total : h.completed}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(0,480px)]">
            <Panel className="overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-border px-5 py-4">
                <h2 className="text-sm font-medium text-fg">Scenarios</h2>
                <span className="text-xs text-fg-subtle">{failing.length ? `${failing.length} failing, shown first` : results.length ? "All passing" : ""}</span>
              </div>
              {results.length === 0 ? (
                <div className="flex flex-col gap-3 p-5" aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="skeleton h-9" />
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {ordered.map((r) => {
                      const failed = r.checks.filter((c) => !c.passed);
                      return (
                        <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease }}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                            aria-pressed={r.id === selectedId}
                            className={cn("flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2", r.id === selectedId && "bg-surface-2")}
                          >
                            <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", r.passed ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                              {r.passed ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] text-fg">{r.title}</span>
                              <span className="block truncate text-xs text-fg-subtle">
                                {failed.length ? `${failed[0].name}: ${failed[0].detail.replace(/^Hallucination flagged\. /, "")}` : `${r.checks.length} checks passed`}
                              </span>
                            </span>
                            {failed.length > 1 ? <Badge tone="danger">{failed.length} checks</Badge> : null}
                            <span className="shrink-0 font-mono text-xs tabular text-fg-subtle">{seconds(r.avgLatencyMs)}</span>
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </Panel>
            <div className="lg:sticky lg:top-6 lg:self-start">
              {selected ? (
                <ScenarioDetail result={selected} onClose={() => setSelectedId(null)} />
              ) : (
                <Panel>
                  <EmptyState icon={<FlaskConical className="size-4" />} title="Pick a scenario" body="See the full transcript, every check with its evidence, and the judge's notes." />
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function avgLatency(results: RunDetail["results"]): number | null {
  const values = results.map((r) => r.avgLatencyMs).filter((v): v is number => v !== null);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

function RunProgress({ run }: { run: RunSummary }) {
  const pct = run.total ? run.completed / run.total : 0;
  return (
    <div className="w-56" role="status" aria-live="polite">
      <div className="flex justify-between text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <span className="live-dot size-1.5 rounded-full bg-accent" aria-hidden />
          {run.completed} of {run.total} done
        </span>
        <span className="font-mono tabular">{run.passed} passing</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out-quint" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
