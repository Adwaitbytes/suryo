import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { embedDocuments } from "@/lib/kb/embed";

/**
 * Re-embeds every knowledge chunk with the current embedding model. The free tier counts
 * each chunk as one request against a 100 per minute cap, so batches are paced a minute apart.
 */
const rows = await db.select({ id: schema.kbChunks.id, title: schema.kbChunks.title, content: schema.kbChunks.content }).from(schema.kbChunks);
const BATCH = 90;
const PAUSE_MS = 62_000;
const started = Date.now();
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const vectors = await embedDocuments(batch.map((r) => `${r.title}\n${r.content}`));
  await Promise.all(batch.map((r, j) => db.update(schema.kbChunks).set({ embedding: vectors[j] }).where(eq(schema.kbChunks.id, r.id))));
  console.log(`re-embedded ${Math.min(i + BATCH, rows.length)} of ${rows.length}`);
  if (i + BATCH < rows.length) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
}
console.log(`done in ${Date.now() - started} ms`);
process.exit(0);
