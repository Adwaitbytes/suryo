"use client";

import { ArrowUpRight, Globe, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { LivePanel } from "./live-panel";
import { PageFeed, ProgressTimeline } from "./progress";
import { ProfileEditor } from "./profile-editor";
import { Timer } from "./timer";
import { useOnboard } from "./use-onboard";

const EXAMPLES = ["slowbroslabs.com", "bluetokaicoffee.com", "clovedental.in"];
const ease = [0.22, 1, 0.36, 1] as const;

export function OnboardStudio() {
  const { phase, steps, pages, result, setResult, error, startedAt, finalMs, start, reset } = useOnboard();
  const [url, setUrl] = useState("");
  const running = phase === "running";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || running) return;
    void start(url.trim());
  };

  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_20%_0%,var(--accent-soft),transparent_70%)]" aria-hidden />

      <header className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <a href="/" className="text-sm text-fg-subtle transition-colors hover:text-fg">
            Suryo
          </a>
          <h1 className="font-display mt-4 text-[44px] leading-[1.02] text-fg sm:text-[64px]">Any business, live in under a minute.</h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-fg-muted">
            Paste a website. Suryo reads it, learns the services, prices and policies it publishes, and gives you a voice and chat agent that can answer and book.
          </p>
        </div>
        <div className="flex flex-col items-start lg:items-end" aria-label="Elapsed time">
          <Timer
            startedAt={startedAt}
            finalMs={finalMs}
            running={running}
            className={cn("text-[56px] leading-none transition-colors duration-300 sm:text-[72px]", phase === "idle" ? "text-fg-faint" : phase === "error" ? "text-danger" : "text-fg")}
          />
          <span className="mt-2 text-xs text-fg-subtle">
            {phase === "done" ? "Website to live agent" : phase === "error" ? "Stopped" : running ? "Elapsed" : "Target under 60 seconds"}
          </span>
        </div>
      </header>

      <form onSubmit={submit} className="mt-10">
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border bg-surface p-2 pl-5 shadow-md transition-[border-color,box-shadow] duration-200 focus-within:border-accent/60 focus-within:shadow-[0_0_0_4px_var(--accent-soft)]",
            phase === "error" ? "border-danger/50" : "border-border-strong",
          )}
        >
          <Globe className="size-5 shrink-0 text-fg-subtle" aria-hidden />
          <label htmlFor="site" className="sr-only">
            Website address
          </label>
          <input
            id="site"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            autoFocus
            placeholder="yourbusiness.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
            className="h-12 min-w-0 flex-1 bg-transparent text-lg text-fg placeholder:text-fg-faint focus:outline-none disabled:opacity-70 sm:text-xl"
          />
          <Button type="submit" variant="primary" size="lg" disabled={running || !url.trim()} className="shrink-0">
            {running ? "Onboarding" : phase === "done" ? "Onboard another" : "Onboard"}
          </Button>
        </div>
        {phase === "idle" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-1 text-[13px] text-fg-subtle">
            <span>Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setUrl(ex);
                  void start(ex);
                }}
                className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
              >
                {ex}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      <AnimatePresence>
        {phase === "error" && error ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease }}
            role="alert"
            className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3"
          >
            <div>
              <div className="text-sm font-medium text-danger">Could not onboard this site</div>
              <p className="mt-0.5 text-[13px] text-fg-muted">{error}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="size-3.5" /> Start over
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {phase !== "idle" ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className="mt-10 grid gap-6 lg:grid-cols-[1fr_380px]">
          {result ? (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-3xl text-fg">{result.profile.name}</h2>
                <a href={result.business.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-fg-subtle transition-colors hover:text-fg">
                  {new URL(result.business.website).hostname}
                  <ArrowUpRight className="size-3.5" />
                </a>
              </div>
              {result.profile.description ? <p className="max-w-2xl text-[14px] leading-relaxed text-fg-muted">{result.profile.description}</p> : null}
              <p className="text-xs text-fg-subtle">
                {result.stats.pages} pages read, {result.stats.chunks} passages embedded, {result.stats.slots} open slots over the next 14 days
                {result.business.replaced ? ". Replaced the earlier agent for this website." : "."}
              </p>
              <ProfileEditor
                key={result.business.id}
                businessId={result.business.id}
                profile={result.profile}
                persona={result.persona}
                onSaved={(profile, persona) => setResult({ ...result, profile, persona })}
              />
            </div>
          ) : (
            <Panel className="p-6">
              <div className="mb-5 text-sm font-medium text-fg">Pages read</div>
              <PageFeed pages={pages} />
              {pages.length > 0 && running ? (
                <div className="mt-6 flex flex-col gap-2.5 border-t border-border pt-6" aria-hidden>
                  <div className="skeleton h-5 w-1/3" />
                  <div className="skeleton h-3.5 w-2/3" />
                  <div className="skeleton h-3.5 w-1/2" />
                </div>
              ) : null}
            </Panel>
          )}

          <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            {result ? <LivePanel slug={result.business.slug} agentName={result.persona.agentName} totalMs={result.totalMs} /> : null}
            <Panel className="p-6">
              <ProgressTimeline steps={steps} failed={phase === "error"} />
            </Panel>
          </div>
        </motion.div>
      ) : null}
    </main>
  );
}
