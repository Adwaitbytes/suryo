import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { embedDocuments } from "@/lib/kb/embed";

/**
 * Re-embeds every knowledge chunk with the current embedding model. The free tier counts
 * each chunk as one request against a 100 per minute cap, so batches are paced a minute apart.
 */
const rows = await db.select({ id: schema.kbChunks.id, title: schema.kbChunks.title, content: schema.kbChunks.content }).from(schema.kbChunks).orderBy(schema.kbChunks.id);
const BATCH = 90;
const PAUSE_MS = 62_000;
const started = Date.now();
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  let vectors: number[][] | null = null;
  // Network blips happen on long runs; retry a batch a few times before giving up.
  for (let attempt = 1; !vectors; attempt++) {
    try {
      vectors = await embedDocuments(batch.map((r) => `${r.title}\n${r.content}`));
    } catch (err) {
      if (attempt >= 4) throw err;
      console.log(`batch at ${i} failed (${err instanceof Error ? err.message.slice(0, 80) : "error"}), retrying in 20 s`);
      await new Promise((resolve) => setTimeout(resolve, 20_000));
    }
  }
  await Promise.all(batch.map((r, j) => db.update(schema.kbChunks).set({ embedding: vectors[j] }).where(eq(schema.kbChunks.id, r.id))));
  console.log(`re-embedded ${Math.min(i + BATCH, rows.length)} of ${rows.length}`);
  if (i + BATCH < rows.length) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
}
console.log(`done in ${Date.now() - started} ms`);
process.exit(0);
