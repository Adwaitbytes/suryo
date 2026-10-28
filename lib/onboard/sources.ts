import { and, count, eq, gte, inArray, like, max, notInArray, or } from "drizzle-orm";
import { invalidateBusiness } from "@/lib/agent/business";
import type { BusinessProfile } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import { buildSlots, scheduleFromHours } from "@/lib/seed/reset";
import { chunkPages, MAX_CHUNKS_WITH_DOCUMENTS, OVERVIEW_SOURCE, profileChunk } from "./chunk";
import { parseDocument, type ParsedDocument, type UploadedDocument } from "./documents";
import { extractProfile } from "./extract";
import { SOURCE_PREFIX } from "./limits";
import { mergeProfile } from "./merge";
import { embedWithRetry } from "./pipeline";
import { OnboardError } from "./url";

type Business = typeof schema.businesses.$inferSelect;

export type KnowledgeSource = {
  /** Pass back to DELETE to remove the source. */
  id: string;
  kind: "document" | "website" | "overview";
  label: string;
  chunks: number;
  updatedAt: string;
  removable: boolean;
};

const WEBSITE_SOURCE = "website";

const overviewTitles = (business: Business) => [...new Set([`${business.name} overview`, `${business.profile.name} overview`])];

/** Groups the knowledge base by where each passage came from: each document, the website as a whole, and the profile fact sheet. */
export async function listSources(business: Business): Promise<KnowledgeSource[]> {
  const rows = await db
    .select({ sourceUrl: schema.kbChunks.sourceUrl, title: schema.kbChunks.title, chunks: count(), updatedAt: max(schema.kbChunks.createdAt) })
    .from(schema.kbChunks)
    .where(eq(schema.kbChunks.businessId, business.id))
    .groupBy(schema.kbChunks.sourceUrl, schema.kbChunks.title);

  const titles = new Set(overviewTitles(business));
  const groups = new Map<string, KnowledgeSource>();
  const add = (id: string, kind: KnowledgeSource["kind"], label: string, chunks: number, at: Date | null) => {
    const iso = (at ?? new Date(0)).toISOString();
    const g = groups.get(id);
    if (g) {
      g.chunks += chunks;
      if (iso > g.updatedAt) g.updatedAt = iso;
    } else groups.set(id, { id, kind, label, chunks, updatedAt: iso, removable: kind !== "overview" });
  };
  for (const r of rows) {
    const url = r.sourceUrl ?? "";
    if (url.startsWith(SOURCE_PREFIX)) add(url, "document", url.slice(SOURCE_PREFIX.length), r.chunks, r.updatedAt);
    else if (!url || url === OVERVIEW_SOURCE || titles.has(r.title)) add(OVERVIEW_SOURCE, "overview", "Profile summary", r.chunks, r.updatedAt);
    else add(WEBSITE_SOURCE, "website", websiteLabel(business.website, url), r.chunks, r.updatedAt);
  }
  const order: Record<KnowledgeSource["kind"], number> = { document: 0, website: 1, overview: 2 };
  return [...groups.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label));
}

function websiteLabel(website: string | null, fallback: string): string {
  try {
    return new URL(website ?? fallback).hostname.replace(/^www\./, "");
  } catch {
    return "Website";
  }
}

/** Removes one document, or every website passage. The profile fact sheet stays because the agent relies on it. */
export async function deleteSource(business: Business, source: string): Promise<number> {
  let where;
  if (source.startsWith(SOURCE_PREFIX)) where = and(eq(schema.kbChunks.businessId, business.id), eq(schema.kbChunks.sourceUrl, source));
  else if (source === WEBSITE_SOURCE) {
    where = and(
      eq(schema.kbChunks.businessId, business.id),
      or(like(schema.kbChunks.sourceUrl, "http://%"), like(schema.kbChunks.sourceUrl, "https://%")),
      notInArray(schema.kbChunks.title, overviewTitles(business)),
    );
  } else throw new OnboardError("That knowledge source cannot be removed.", "invalid_url");
  const removed = await db.delete(schema.kbChunks).where(where).returning({ id: schema.kbChunks.id });
  if (removed.length === 0) throw new OnboardError("That knowledge source was not found.", "no_content");
  return removed.length;
}

export type AddDocumentsResult = {
  documents: Array<{ name: string; pages: number; chunks: number; replaced: boolean }>;
  profile: BusinessProfile;
  changes: string[];
  /** Set when the passages were added but reading the profile from them failed. */
  profileWarning: string | null;
  tokens: number;
};

/**
 * Appends documents to a live agent. Passages are embedded and stored (a re-uploaded file name
 * replaces its earlier passages), then the profile is re-read from the new documents and merged
 * so operator edits survive. The profile fact sheet is rebuilt to match.
 */
export async function addDocuments(business: Business, uploads: UploadedDocument[], signal?: AbortSignal): Promise<AddDocumentsResult> {
  const documents: ParsedDocument[] = [];
  for (const upload of uploads) documents.push(await parseDocument(upload));
  const chunks = chunkPages(
    documents.flatMap((d) => d.parts),
    MAX_CHUNKS_WITH_DOCUMENTS,
  );
  if (chunks.length === 0) throw new OnboardError("There was not enough text in these documents to add.", "no_content");

  const [vectors, extraction] = await Promise.all([
    embedWithRetry(chunks.map((c) => `${c.title}\n${c.content}`), signal),
    extractProfile({ pages: [], documents, existingName: business.profile.name }, signal).then(
      (r) => ({ ok: true as const, ...r }),
      (err: unknown) => ({ ok: false as const, message: err instanceof OnboardError ? err.message : "Reading the profile from these documents failed." }),
    ),
  ]);

  const merged = extraction.ok ? mergeProfile(business.profile, extraction.profile) : { profile: business.profile, changes: [] };
  const overview = profileChunk(merged.profile, business.website ?? OVERVIEW_SOURCE);
  const [overviewVector] = await embedWithRetry([`${overview.title}\n${overview.content}`], signal);
  const hoursChanged = JSON.stringify(merged.profile.hours) !== JSON.stringify(business.profile.hours);
  const sourceUrls = documents.map((d) => d.sourceUrl);

  const existing = await db
    .selectDistinct({ sourceUrl: schema.kbChunks.sourceUrl })
    .from(schema.kbChunks)
    .where(and(eq(schema.kbChunks.businessId, business.id), inArray(schema.kbChunks.sourceUrl, sourceUrls)));
  const replaced = new Set(existing.map((e) => e.sourceUrl));

  await db.transaction(async (tx) => {
    await tx.delete(schema.kbChunks).where(and(eq(schema.kbChunks.businessId, business.id), inArray(schema.kbChunks.sourceUrl, sourceUrls)));
    await tx
      .delete(schema.kbChunks)
      .where(
        and(
          eq(schema.kbChunks.businessId, business.id),
          inArray(schema.kbChunks.title, overviewTitles(business)),
          or(eq(schema.kbChunks.sourceUrl, OVERVIEW_SOURCE), eq(schema.kbChunks.sourceUrl, business.website ?? OVERVIEW_SOURCE)),
        ),
      );
    await tx.insert(schema.kbChunks).values([
      { businessId: business.id, sourceUrl: overview.sourceUrl, title: overview.title.slice(0, 200), content: overview.content, embedding: overviewVector },
      ...chunks.map((c, i) => ({ businessId: business.id, sourceUrl: c.sourceUrl, title: c.title.slice(0, 200), content: c.content, embedding: vectors[i] })),
    ]);
    if (merged.changes.length) await tx.update(schema.businesses).set({ profile: merged.profile }).where(eq(schema.businesses.id, business.id));
    if (hoursChanged) {
      // Same rule as an operator edit: open future slots follow the new hours, booked ones stay.
      await tx.delete(schema.slots).where(and(eq(schema.slots.businessId, business.id), eq(schema.slots.status, "open"), gte(schema.slots.startsAt, new Date())));
      const team = await tx.select().from(schema.staff).where(eq(schema.staff.businessId, business.id));
      const rows = buildSlots(business.id, team.map((t) => ({ id: t.id, locationId: t.locationId, schedule: scheduleFromHours(merged.profile.hours) })));
      if (rows.length) await tx.insert(schema.slots).values(rows).onConflictDoNothing();
    }
  });
  invalidateBusiness();

  const perSource = new Map<string, number>();
  for (const c of chunks) perSource.set(c.sourceUrl ?? "", (perSource.get(c.sourceUrl ?? "") ?? 0) + 1);
  return {
    documents: documents.map((d) => ({ name: d.name, pages: d.pages, chunks: perSource.get(d.sourceUrl) ?? 0, replaced: replaced.has(d.sourceUrl) })),
    profile: merged.profile,
    changes: merged.changes,
    profileWarning: extraction.ok ? null : extraction.message,
    tokens: extraction.ok ? extraction.tokens : 0,
  };
}
