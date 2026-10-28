import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SourceRef } from "@/lib/contracts";
import { embedQuery } from "./embed";

export type KnowledgeHit = SourceRef & { content: string };

const RRF_K = 60;

/**
 * Hybrid retrieval: pgvector cosine similarity and Postgres full text search,
 * fused with reciprocal rank fusion. `confidence` is the best cosine similarity,
 * which the agent uses to decide whether it may answer at all.
 */
export async function searchKnowledge(
  businessId: string,
  query: string,
  limit = 4,
): Promise<{ hits: KnowledgeHit[]; confidence: number }> {
  let embedding: number[];
  try {
    embedding = await embedQuery(query);
  } catch (err) {
    // If every embedding key is out of quota the agent still answers from keyword search.
    console.error("[searchKnowledge] embedding unavailable, using lexical search", err instanceof Error ? err.message : err);
    return lexicalSearch(businessId, query, limit);
  }
  const vector = `[${embedding.join(",")}]`;
  const rows = await db.execute<{
    id: string;
    title: string;
    content: string;
    source_url: string | null;
    similarity: number;
    rrf: number;
  }>(sql`
    with semantic as (
      select id, 1 - (embedding <=> ${vector}::vector) as similarity,
             row_number() over (order by embedding <=> ${vector}::vector) as rank
      from kb_chunks where business_id = ${businessId}
      order by embedding <=> ${vector}::vector limit 12
    ),
    lexical as (
      select id, row_number() over (order by ts_rank_cd(tsv, q) desc) as rank
      from kb_chunks, websearch_to_tsquery('simple', ${query}) q
      where business_id = ${businessId} and tsv @@ q
      order by ts_rank_cd(tsv, q) desc limit 12
    ),
    fused as (
      select coalesce(s.id, l.id) as id,
             coalesce(1.0 / (${RRF_K} + s.rank), 0) + coalesce(1.0 / (${RRF_K} + l.rank), 0) as rrf
      from semantic s full outer join lexical l on s.id = l.id
    )
    select c.id, c.title, c.content, c.source_url,
           1 - (c.embedding <=> ${vector}::vector) as similarity, f.rrf
    from fused f join kb_chunks c on c.id = f.id
    order by f.rrf desc limit ${limit}
  `);
  const hits = rows.rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    // Uploaded documents are stored as doc:// sources; only web pages are linkable.
    url: r.source_url && /^https?:\/\//i.test(r.source_url) ? r.source_url : null,
    score: Number(Number(r.similarity).toFixed(3)),
  }));
  const confidence = hits.reduce((max, h) => Math.max(max, h.score), 0);
  return { hits, confidence };
}

/** Below this cosine similarity the knowledge base does not cover the question. */
export const MIN_CONFIDENCE = 0.62;

export function toSourceRef(hit: KnowledgeHit): SourceRef {
  return { id: hit.id, title: hit.title, url: hit.url, score: hit.score };
}

/** Any word may match, so Hinglish questions still find English passages that share a few terms. */
function orQuery(query: string): string {
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return [...new Set(words)].join(" | ") || "''";
}

/** Keyword only fallback. Confidence is scaled so a strong multi term match clears MIN_CONFIDENCE. */
async function lexicalSearch(businessId: string, query: string, limit: number): Promise<{ hits: KnowledgeHit[]; confidence: number }> {
  const rows = await db.execute<{ id: string; title: string; content: string; source_url: string | null; rank: number }>(sql`
    select id, title, content, source_url, ts_rank_cd(tsv, q) as rank
    from kb_chunks, to_tsquery('simple', ${orQuery(query)}) q
    where business_id = ${businessId} and tsv @@ q
    order by rank desc limit ${limit}`);
  const hits = rows.rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    url: r.source_url && /^https?:\/\//i.test(r.source_url) ? r.source_url : null,
    score: Number(Math.min(0.9, 0.55 + Number(r.rank)).toFixed(3)),
  }));
  return { hits, confidence: hits[0]?.score ?? 0 };
}
