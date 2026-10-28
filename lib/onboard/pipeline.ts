import { eq } from "drizzle-orm";
import { invalidateBusiness } from "@/lib/agent/business";
import { db, schema } from "@/lib/db";
import type { BusinessProfile, Persona } from "@/lib/contracts";
import { embedDocuments } from "@/lib/kb/embed";
import { chunkPages, MAX_CHUNKS_WITH_DOCUMENTS, OVERVIEW_SOURCE, profileChunk, type Chunk } from "./chunk";
import { crawlSite, type CrawledPage } from "./crawl";
import { createOnboardedBusiness } from "./create";
import { parseDocument, type ParsedDocument, type UploadedDocument } from "./documents";
import { extractProfile, generatePersona } from "./extract";
import { OnboardError, parseSiteUrl } from "./url";

export const ONBOARD_STEPS = ["parse", "crawl", "chunk", "embed", "extract", "persona", "calendar", "live"] as const;
export type OnboardStep = (typeof ONBOARD_STEPS)[number];

export type OnboardEvent =
  | { type: "step"; step: OnboardStep; status: "active" | "done"; label: string; detail?: string; elapsedMs: number }
  | { type: "page"; url: string; title: string; index: number; elapsedMs: number }
  | { type: "document"; name: string; kind: ParsedDocument["kind"]; pages: number; chars: number; index: number; elapsedMs: number }
  | {
      type: "done";
      business: { id: string; slug: string; name: string; website: string | null; replaced: boolean };
      profile: BusinessProfile;
      persona: Persona;
      stats: { pages: number; documents: number; chunks: number; slots: number; tokens: number; personaFallback: boolean };
      totalMs: number;
    }
  | { type: "error"; message: string; code: string; elapsedMs: number };

export async function embedWithRetry(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await embedDocuments(texts);
    } catch (err) {
      if (attempt >= 2 || signal?.aborted) {
        throw new OnboardError(`Embedding the knowledge base failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`, "extraction_failed");
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}


export type OnboardInput = { url?: string | null; documents?: UploadedDocument[] };

/** Website only onboarding, kept as the entry point the JSON route has always used. */
export function onboardSite(rawUrl: string, emit: (event: OnboardEvent) => void, signal?: AbortSignal): Promise<void> {
  return onboard({ url: rawUrl }, emit, signal);
}

/**
 * Website, documents or both to a live agent. Reading the website and parsing documents run
 * side by side, then feed two parallel tracks (embedding the knowledge base and extracting the
 * profile) which join to create the calendar and go live.
 */
export async function onboard(input: OnboardInput, emit: (event: OnboardEvent) => void, signal?: AbortSignal): Promise<void> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const step = (s: OnboardStep, status: "active" | "done", label: string, detail?: string) =>
    emit({ type: "step", step: s, status, label, detail, elapsedMs: elapsed() });
  // Stops a running crawl when document parsing fails, and the reverse.
  const local = new AbortController();
  const runSignal = signal ? AbortSignal.any([signal, local.signal]) : local.signal;

  try {
    const uploads = input.documents ?? [];
    const url = input.url?.trim() ? parseSiteUrl(input.url) : null;
    if (!url && uploads.length === 0) throw new OnboardError("Add a website or at least one document.", "invalid_url");

    const reading = (async (): Promise<ParsedDocument[]> => {
      const parsed: ParsedDocument[] = [];
      for (const [index, upload] of uploads.entries()) {
        if (runSignal.aborted) throw new OnboardError("Onboarding was cancelled.", "timeout");
        step("parse", "active", `Parsing ${upload.name}`, `${index + 1} of ${uploads.length}`);
        const doc = await parseDocument(upload);
        parsed.push(doc);
        emit({ type: "document", name: doc.name, kind: doc.kind, pages: doc.pages, chars: doc.chars, index, elapsedMs: elapsed() });
      }
      if (uploads.length) {
        const pages = parsed.reduce((n, d) => n + d.pages, 0);
        step("parse", "done", `Read ${parsed.length} document${parsed.length === 1 ? "" : "s"}`, `${pages} page${pages === 1 ? "" : "s"}, ${parsed.reduce((n, d) => n + d.chars, 0).toLocaleString("en-IN")} characters`);
      }
      return parsed;
    })();

    const crawling = (async (): Promise<{ origin: string; pages: CrawledPage[] } | null> => {
      if (!url) return null;
      step("crawl", "active", `Reading ${url.hostname}`);
      try {
        const site = await crawlSite(url, {
          signal: runSignal,
          onProgress: (p) => {
            if (p.kind === "page") emit({ type: "page", url: p.url, title: p.title, index: p.index, elapsedMs: elapsed() });
          },
        });
        step("crawl", "done", `Read ${site.pages.length} page${site.pages.length === 1 ? "" : "s"}`, new URL(site.origin).hostname);
        return site;
      } catch (err) {
        // With documents in hand an unreachable website is not fatal; the documents carry the agent.
        if (uploads.length && err instanceof OnboardError && !runSignal.aborted) {
          step("crawl", "done", "Website skipped", err.message);
          return null;
        }
        throw err;
      }
    })();

    let documents: ParsedDocument[];
    let site: { origin: string; pages: CrawledPage[] } | null;
    try {
      [documents, site] = await Promise.all([reading, crawling]);
    } catch (err) {
      local.abort();
      throw err;
    }
    const pages = site?.pages ?? [];
    const sources: CrawledPage[] = [...documents.flatMap((d) => d.parts), ...pages];

    step("chunk", "active", "Chunking content");
    const chunks = chunkPages(sources, documents.length ? MAX_CHUNKS_WITH_DOCUMENTS : undefined);
    if (chunks.length === 0 && documents.length) throw new OnboardError("There was not enough text to build a knowledge base.", "no_content");
    step("chunk", "done", `${chunks.length} passages`, `${sources.reduce((n, p) => n + p.text.length, 0).toLocaleString("en-IN")} characters`);

    step("embed", "active", `Embedding ${chunks.length} passages`);
    step("extract", "active", "Extracting business profile");
    const embedding = embedWithRetry(chunks.map((c) => `${c.title}\n${c.content}`), signal).then((vectors) => {
      step("embed", "done", `Embedded ${vectors.length} passages`, "768 dimensions");
      return vectors;
    });
    const extraction = extractProfile({ pages, documents }, signal).then((r) => {
      const openDays = r.profile.hours.filter((h) => h.open).length;
      step("extract", "done", r.profile.name, `${r.profile.services.length} services, ${openDays ? `${openDays} open days` : "no published hours"}`);
      return r;
    });
    // Both tracks are awaited together so neither rejection goes unhandled.
    const [vectors, { profile, tokens }] = await Promise.all([embedding, extraction]);

    step("persona", "active", "Generating persona");
    const website = site ? new URL(site.origin).toString() : url ? new URL(url.origin).toString() : null;
    const overview = profileChunk(profile, website ?? OVERVIEW_SOURCE);
    const [{ persona, fallback }, [overviewVector]] = await Promise.all([
      generatePersona(profile, signal, documents.length ? "documents" : "website"),
      embedWithRetry([`${overview.title}\n${overview.content}`], signal),
    ]);
    step("persona", "done", persona.agentName, `Voice ${persona.voice}`);

    step("calendar", "active", "Creating calendar");
    const allChunks: Array<Chunk & { embedding: number[] }> = [
      { ...overview, embedding: overviewVector },
      ...chunks.map((c, i) => ({ ...c, embedding: vectors[i] })),
    ];
    const created = await createOnboardedBusiness({ website, profile, persona, chunks: allChunks, onboardMs: elapsed() });
    const totalMs = elapsed();
    await db.update(schema.businesses).set({ onboardMs: totalMs }).where(eq(schema.businesses.id, created.id));
    invalidateBusiness();
    step("calendar", "done", `${created.slots} open slots`, `${profile.bookableOffering}, 30 minutes, next 14 days${profile.hours.some((h) => h.open) ? "" : ", default weekday hours"}`);

    step("live", "done", `${persona.agentName} is live`, `/${created.slug}`);
    emit({
      type: "done",
      business: { id: created.id, slug: created.slug, name: created.name, website, replaced: created.replaced },
      profile,
      persona,
      stats: { pages: pages.length, documents: documents.length, chunks: allChunks.length, slots: created.slots, tokens, personaFallback: fallback },
      totalMs,
    });
  } catch (err) {
    if (err instanceof OnboardError) {
      emit({ type: "error", message: err.message, code: err.code, elapsedMs: elapsed() });
      return;
    }
    console.error("[onboard]", err);
    emit({ type: "error", message: "Onboarding failed unexpectedly. Try again.", code: "internal", elapsedMs: elapsed() });
  }
}
