"use client";

import { FileText, Globe, ListChecks, Loader2, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/primitives";
import type { BusinessProfile } from "@/lib/contracts";
import { kindFromName } from "@/lib/onboard/limits";
import type { KnowledgeSource } from "@/lib/onboard/sources";
import { cn } from "@/lib/utils";
import { Dropzone } from "./dropzone";

const ease = [0.22, 1, 0.36, 1] as const;

type AddResponse = {
  documents: Array<{ name: string; pages: number; chunks: number; replaced: boolean }>;
  profile: BusinessProfile;
  changes: string[];
  profileWarning: string | null;
  sources: KnowledgeSource[];
};

type Status = { kind: "idle" } | { kind: "uploading" } | { kind: "done"; message: string } | { kind: "error"; message: string };

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error ?? `Request failed with HTTP ${res.status}.`);
  return data;
}

const fetchSources = async (endpoint: string) => (await readJson<{ sources: KnowledgeSource[] }>(await fetch(endpoint, { cache: "no-store" }))).sources;

function summary(data: AddResponse): string {
  const passages = data.documents.reduce((n, d) => n + d.chunks, 0);
  const replaced = data.documents.filter((d) => d.replaced).length;
  const head = `Added ${data.documents.length} document${data.documents.length === 1 ? "" : "s"}, ${passages} passage${passages === 1 ? "" : "s"}${replaced ? `, replacing ${replaced} earlier version${replaced === 1 ? "" : "s"}` : ""}.`;
  if (data.profileWarning) return `${head} ${data.profileWarning}`;
  return data.changes.length ? `${head} Profile picked up ${data.changes.join(", ")}.` : `${head} Nothing new for the profile; your edits are unchanged.`;
}

function SourceIcon({ source }: { source: KnowledgeSource }) {
  const Icon = source.kind === "website" ? Globe : source.kind === "overview" ? ListChecks : FileText;
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-fg-subtle">
      <Icon className="size-4" />
    </span>
  );
}

function meta(source: KnowledgeSource): string {
  if (source.kind === "website") return "Website";
  if (source.kind === "overview") return "Built from the profile";
  return (kindFromName(source.label) ?? "document").toUpperCase();
}

/** What the agent answers from, with removal per source and an uploader that adds to a live agent. */
export function KnowledgeSources({ businessId, onProfile }: { businessId: string; onProfile: (profile: BusinessProfile) => void }) {
  const [sources, setSources] = useState<KnowledgeSource[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const endpoint = `/api/businesses/${businessId}/documents`;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSources(await fetchSources(endpoint));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load knowledge sources.");
    }
  }, [endpoint]);

  useEffect(() => {
    let cancelled = false;
    fetchSources(endpoint)
      .then((list) => {
        if (!cancelled) setSources(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load knowledge sources.");
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const upload = async () => {
    if (!files.length) return;
    setStatus({ kind: "uploading" });
    const form = new FormData();
    for (const f of files) form.append("files", f, f.name);
    try {
      const data = await readJson<AddResponse>(await fetch(endpoint, { method: "POST", body: form }));
      setSources(data.sources);
      setFiles([]);
      setStatus({ kind: "done", message: summary(data) });
      if (data.changes.length) onProfile(data.profile);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Upload failed." });
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    setRemoveError(null);
    try {
      const data = await readJson<{ sources: KnowledgeSource[] }>(await fetch(`${endpoint}?source=${encodeURIComponent(id)}`, { method: "DELETE" }));
      setSources(data.sources);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Could not remove that source.");
    } finally {
      setRemoving(null);
      setConfirming(null);
    }
  };

  const uploading = status.kind === "uploading";
  const total = sources?.reduce((n, s) => n + s.chunks, 0) ?? 0;

  return (
    <Panel>
      <section className="flex flex-col gap-4 px-6 py-6">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-fg">Knowledge sources</h3>
            <p className="mt-0.5 text-[13px] text-fg-subtle">What the agent answers from. Removing a source removes its passages.</p>
          </div>
          {sources ? (
            <span className="shrink-0 font-mono text-xs tabular text-fg-subtle">
              {total} passage{total === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {loadError ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-2.5 text-[13px]">
            <span className="text-danger">{loadError}</span>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : sources === null ? (
          <div className="flex flex-col gap-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <span className="skeleton size-8 rounded-lg" />
                <span className="skeleton h-3.5 flex-1" style={{ maxWidth: `${[52, 40, 46][i]}%` }} />
              </div>
            ))}
          </div>
        ) : sources.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">No sources yet. Add documents below and the agent starts answering from them.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            <AnimatePresence initial={false}>
              {sources.map((s) => (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease }}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
                >
                  <SourceIcon source={s} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg" title={s.label}>
                      {s.label}
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {meta(s)}, <span className="font-mono tabular">{s.chunks}</span> passage{s.chunks === 1 ? "" : "s"}
                    </div>
                  </div>
                  {s.removable ? (
                    confirming === s.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={removing === s.id}>
                          Keep
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void remove(s.id)} disabled={removing === s.id}>
                          {removing === s.id ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${s.label}`}
                        onClick={() => setConfirming(s.id)}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-3 hover:text-danger"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )
                  ) : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {removeError ? (
          <p role="alert" className="text-[13px] text-danger">
            {removeError}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 border-t border-border px-6 py-6">
        <div>
          <h3 className="text-sm font-semibold text-fg">Add documents</h3>
          <p className="mt-0.5 text-[13px] text-fg-subtle">New services, hours and rules are added to the profile. Fields you already filled stay as they are.</p>
        </div>
        <Dropzone files={files} onChange={setFiles} disabled={uploading} compact label="Drop price lists, menus or policies" />
        <div className="flex items-center justify-between gap-3">
          <span
            role="status"
            className={cn("min-w-0 text-[13px] leading-relaxed", status.kind === "error" ? "text-danger" : status.kind === "done" ? "text-success" : "text-fg-subtle")}
          >
            {status.kind === "uploading" ? "Reading, embedding and merging" : status.kind === "idle" ? "" : status.message}
          </span>
          <Button variant="primary" size="sm" disabled={!files.length || uploading} onClick={() => void upload()} className="shrink-0">
            {uploading ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
            {uploading ? "Adding" : "Add to knowledge base"}
          </Button>
        </div>
      </section>
    </Panel>
  );
}
