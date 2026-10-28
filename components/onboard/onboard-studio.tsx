"use client";

import { ArrowUpRight, Files, Globe, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { Dropzone } from "./dropzone";
import { KnowledgeSources } from "./knowledge-sources";
import { LivePanel } from "./live-panel";
import { DocumentFeed, PageFeed, ProgressTimeline } from "./progress";
import { ProfileEditor } from "./profile-editor";
import { Timer } from "./timer";
import { stepsFor, useOnboard } from "./use-onboard";

const EXAMPLES = ["slowbroslabs.com", "bluetokaicoffee.com", "clovedental.in"];
const ease = [0.22, 1, 0.36, 1] as const;

type Source = "website" | "documents";
const SOURCES: Array<{ key: Source; label: string; icon: typeof Globe }> = [
  { key: "website", label: "From your website", icon: Globe },
  { key: "documents", label: "From your documents", icon: Files },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function SourceSwitch({ value, onChange, disabled }: { value: Source; onChange: (s: Source) => void; disabled: boolean }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const current = SOURCES.findIndex((s) => s.key === value);
    const next = e.key === "Home" ? 0 : e.key === "End" ? SOURCES.length - 1 : (current + (e.key === "ArrowRight" ? 1 : -1) + SOURCES.length) % SOURCES.length;
    onChange(SOURCES[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Onboard from" onKeyDown={onKeyDown} className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-sm">
      {SOURCES.map((s, i) => {
        const active = s.key === value;
        const Icon = s.icon;
        return (
          <button
            key={s.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`source-tab-${s.key}`}
            aria-selected={active}
            aria-controls={`source-panel-${s.key}`}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(s.key)}
            className={cn(
              "relative inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium sm:px-3.5 sm:text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
              active ? "text-fg" : "text-fg-subtle hover:text-fg",
            )}
          >
            {active ? (
              <motion.span layoutId="source-pill" transition={{ duration: 0.28, ease }} className="absolute inset-0 rounded-lg border border-border-strong bg-surface-3 shadow-sm" aria-hidden />
            ) : null}
            <Icon className="relative size-4" aria-hidden />
            <span className="relative">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function OnboardStudio() {
  const { phase, mode, steps, pages, documents, result, setResult, error, startedAt, finalMs, start, reset } = useOnboard();
  const [source, setSource] = useState<Source>("website");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [revision, setRevision] = useState(0);
  // Only the first paint focuses the website field; after a tab switch focus stays on the tab.
  const [switched, setSwitched] = useState(false);
  const running = phase === "running";
  const fromDocuments = mode !== "website";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (running) return;
    if (source === "website") {
      if (url.trim()) void start({ url: url.trim() });
    } else if (files.length) {
      void start({ url: url.trim(), files });
    }
  };

  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_20%_0%,var(--accent-soft),transparent_70%)]" aria-hidden />

      <header className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Link href="/" className="text-sm text-fg-subtle transition-colors hover:text-fg">
            Suryo
          </Link>
          <h1 className="font-display mt-4 text-balance text-[44px] leading-[1.02] text-fg sm:text-[64px]">Any business, live in under a minute.</h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-fg-muted">
            Paste a website or upload the brochures, price lists and policies you already have. Suryo learns the services, prices and rules in them and gives you a voice and chat agent that can answer and book.
          </p>
        </div>
        <div className="flex flex-col items-start lg:items-end" aria-label="Elapsed time">
          <Timer
            startedAt={startedAt}
            finalMs={finalMs}
            running={running}
            className={cn("text-[56px] leading-none tracking-[-0.04em] transition-colors duration-300 sm:text-[72px]", phase === "idle" ? "text-fg-faint" : phase === "error" ? "text-danger" : "text-fg")}
          />
          <span className="mt-2 text-xs text-fg-subtle">
            {phase === "done" ? (fromDocuments ? "Documents to live agent" : "Website to live agent") : phase === "error" ? "Stopped" : running ? "Elapsed" : "Target under 60 seconds"}
          </span>
        </div>
      </header>

      <div className="mt-10">
        <SourceSwitch
          value={source}
          onChange={(next) => {
            setSource(next);
            setSwitched(true);
          }}
          disabled={running}
        />
      </div>

      <form onSubmit={submit} className="mt-4">
        {source === "website" ? (
          <div role="tabpanel" id="source-panel-website" aria-labelledby="source-tab-website">
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
                autoFocus={!switched}
                placeholder="yourbusiness.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={running}
                className="h-12 min-w-0 flex-1 bg-transparent text-lg text-fg placeholder:text-fg-faint disabled:opacity-70 sm:text-xl"
                // The global focus ring is unlayered, so it outranks utilities; the field shows focus on its wrapper instead.
                style={{ outline: "none" }}
              />
              {running ? (
                <Button type="button" variant="secondary" size="lg" aria-disabled className="pointer-events-none shrink-0">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Onboarding
                </Button>
              ) : (
                <Button type="submit" variant="primary" size="lg" disabled={!url.trim()} className="shrink-0">
                  {phase === "done" ? "Onboard another" : "Onboard"}
                </Button>
              )}
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
                      void start({ url: ex });
                    }}
                    className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div role="tabpanel" id="source-panel-documents" aria-labelledby="source-tab-documents" className="flex flex-col gap-3">
            <Dropzone files={files} onChange={setFiles} disabled={running} />
            <div
              className={cn(
                "flex items-center gap-3 rounded-2xl border bg-surface p-2 pl-5 shadow-md transition-[border-color,box-shadow] duration-200 focus-within:border-accent/60 focus-within:shadow-[0_0_0_4px_var(--accent-soft)]",
                phase === "error" ? "border-danger/50" : "border-border-strong",
              )}
            >
              <Globe className="size-5 shrink-0 text-fg-subtle" aria-hidden />
              <label htmlFor="site-optional" className="sr-only">
                Website address, optional
              </label>
              <input
                id="site-optional"
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                placeholder="yourbusiness.com, optional"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={running}
                className="h-12 min-w-0 flex-1 bg-transparent text-lg text-fg placeholder:text-fg-faint disabled:opacity-70 sm:text-xl"
                // The global focus ring is unlayered, so it outranks utilities; the field shows focus on its wrapper instead.
                style={{ outline: "none" }}
              />
              {running ? (
                <Button type="button" variant="secondary" size="lg" aria-disabled className="pointer-events-none shrink-0">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Onboarding
                </Button>
              ) : (
                <Button type="submit" variant="primary" size="lg" disabled={files.length === 0} className="shrink-0">
                  {phase === "done" ? "Onboard another" : "Onboard"}
                </Button>
              )}
            </div>
            <p className="pl-1 text-[13px] text-fg-subtle">Add your website too and Suryo reads both. Where they disagree, your documents win.</p>
          </div>
        )}
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
              <div className="text-sm font-medium text-danger">{fromDocuments ? "Could not onboard from these documents" : "Could not onboard this site"}</div>
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
                <h2 className="font-display text-[40px] leading-[1.05] text-fg">{result.profile.name}</h2>
                {result.business.website ? (
                  <a href={result.business.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-fg-subtle transition-colors hover:text-fg">
                    {new URL(result.business.website).hostname}
                    <ArrowUpRight className="size-3.5" />
                  </a>
                ) : (
                  <span className="text-[13px] text-fg-subtle">From {plural(result.stats.documents, "document")}</span>
                )}
              </div>
              {result.profile.description ? <p className="line-clamp-3 max-w-2xl text-[14px] leading-relaxed text-fg-muted" title={result.profile.description}>{result.profile.description}</p> : null}
              <p className="text-[13px] text-fg-subtle">
                {result.stats.documents ? (
                  <>
                    <span className="font-mono text-fg tabular">{result.stats.documents}</span> {result.stats.documents === 1 ? "document" : "documents"} read,{" "}
                  </>
                ) : null}
                {result.stats.pages || !result.stats.documents ? (
                  <>
                    <span className="font-mono text-fg tabular">{result.stats.pages}</span> pages read,{" "}
                  </>
                ) : null}
                <span className="font-mono text-fg tabular">{result.stats.chunks}</span> passages embedded, <span className="font-mono text-fg tabular">{result.stats.slots}</span> open slots over the next 14 days
                {result.business.replaced ? `. Replaced the earlier agent for this ${result.business.website ? "website" : "business"}.` : "."}
              </p>
              <ProfileEditor
                key={`${result.business.id}-${revision}`}
                businessId={result.business.id}
                profile={result.profile}
                persona={result.persona}
                source={fromDocuments ? "documents" : "website"}
                onSaved={(profile, persona) => setResult({ ...result, profile, persona })}
              />
              <KnowledgeSources
                businessId={result.business.id}
                onProfile={(profile) => {
                  setResult((r) => (r ? { ...r, profile } : r));
                  setRevision((n) => n + 1);
                }}
              />
            </div>
          ) : (
            <Panel className="p-6">
              {fromDocuments ? (
                <>
                  <div className="mb-5 text-sm font-medium text-fg">Documents read</div>
                  <DocumentFeed documents={documents} expected={running ? files.length : documents.length} />
                </>
              ) : null}
              {mode !== "documents" ? (
                <>
                  <div className={cn("mb-5 text-sm font-medium text-fg", fromDocuments && "mt-8")}>Pages read</div>
                  <PageFeed pages={pages} />
                </>
              ) : null}
              {(pages.length > 0 || documents.length > 0) && running ? (
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
              <ProgressTimeline steps={steps} order={stepsFor(mode)} failed={phase === "error"} />
            </Panel>
          </div>
        </motion.div>
      ) : null}
    </main>
  );
}
