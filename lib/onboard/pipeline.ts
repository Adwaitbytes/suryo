import { eq } from "drizzle-orm";
import { invalidateBusiness } from "@/lib/agent/business";
import { db, schema } from "@/lib/db";
import type { BusinessProfile, Persona } from "@/lib/contracts";
import { embedDocuments } from "@/lib/kb/embed";
import { chunkPages, profileChunk, type Chunk } from "./chunk";
import { crawlSite } from "./crawl";
import { createOnboardedBusiness } from "./create";
import { extractProfile, generatePersona } from "./extract";
import { OnboardError, parseSiteUrl } from "./url";

export const ONBOARD_STEPS = ["crawl", "chunk", "embed", "extract", "persona", "calendar", "live"] as const;
export type OnboardStep = (typeof ONBOARD_STEPS)[number];

export type OnboardEvent =
  | { type: "step"; step: OnboardStep; status: "active" | "done"; label: string; detail?: string; elapsedMs: number }
  | { type: "page"; url: string; title: string; index: number; elapsedMs: number }
  | {
      type: "done";
      business: { id: string; slug: string; name: string; website: string; replaced: boolean };
      profile: BusinessProfile;
      persona: Persona;
      stats: { pages: number; chunks: number; slots: number; tokens: number; personaFallback: boolean };
      totalMs: number;
    }
  | { type: "error"; message: string; code: string; elapsedMs: number };

async function embedWithRetry(texts: string[], signal?: AbortSignal): Promise<number[][]> {
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

/**
 * Website to live agent. Crawling feeds two parallel tracks (embedding the knowledge base and
 * extracting the profile) which join to create the calendar and go live.
 */
export async function onboardSite(rawUrl: string, emit: (event: OnboardEvent) => void, signal?: AbortSignal): Promise<void> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const step = (s: OnboardStep, status: "active" | "done", label: string, detail?: string) =>
    emit({ type: "step", step: s, status, label, detail, elapsedMs: elapsed() });

  try {
    const url = parseSiteUrl(rawUrl);
    step("crawl", "active", `Reading ${url.hostname}`);
    const { origin, pages } = await crawlSite(url, {
      signal,
      onProgress: (p) => {
        if (p.kind === "page") emit({ type: "page", url: p.url, title: p.title, index: p.index, elapsedMs: elapsed() });
      },
    });
    step("crawl", "done", `Read ${pages.length} page${pages.length === 1 ? "" : "s"}`, new URL(origin).hostname);

    step("chunk", "active", "Chunking content");
    const chunks = chunkPages(pages);
    step("chunk", "done", `${chunks.length} passages`, `${pages.reduce((n, p) => n + p.text.length, 0).toLocaleString("en-IN")} characters`);

    step("embed", "active", `Embedding ${chunks.length} passages`);
    step("extract", "active", "Extracting business profile");
    const embedding = embedWithRetry(chunks.map((c) => `${c.title}\n${c.content}`), signal).then((vectors) => {
      step("embed", "done", `Embedded ${vectors.length} passages`, "768 dimensions");
      return vectors;
    });
    const extraction = extractProfile(pages, signal).then((r) => {
      const openDays = r.profile.hours.filter((h) => h.open).length;
      step("extract", "done", r.profile.name, `${r.profile.services.length} services, ${openDays ? `${openDays} open days` : "no published hours"}`);
      return r;
    });
    // Both tracks are awaited together so neither rejection goes unhandled.
    const [vectors, { profile, tokens }] = await Promise.all([embedding, extraction]);

    step("persona", "active", "Generating persona");
    const website = new URL(origin).toString();
    const overview = profileChunk(profile, website);
    const [{ persona, fallback }, [overviewVector]] = await Promise.all([
      generatePersona(profile, signal),
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
      stats: { pages: pages.length, chunks: allChunks.length, slots: created.slots, tokens, personaFallback: fallback },
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
