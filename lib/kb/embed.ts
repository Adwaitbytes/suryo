import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, embedMany } from "ai";
import { withGeminiKey } from "@/lib/ai/keys";
import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

const MODEL = "gemini-embedding-001";

const providerOptions = (taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") => ({
  google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType },
});

const model = (apiKey: string) => createGoogleGenerativeAI({ apiKey }).embeddingModel(MODEL);

// Customers ask the same questions all day; caching query vectors saves quota and ~600 ms a turn.
const cache = new Map<string, number[]>();
const CACHE_LIMIT = 1000;

export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase().replace(/\s+/g, " ");
  const hit = cache.get(key);
  if (hit) return hit;
  const embedding = await withGeminiKey(async (apiKey) => {
    const result = await embed({ model: model(apiKey), value: text, maxRetries: 0, providerOptions: providerOptions("RETRIEVAL_QUERY") });
    return result.embedding;
  });
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, embedding);
  return embedding;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return withGeminiKey(async (apiKey) => {
    const { embeddings } = await embedMany({
      model: model(apiKey),
      values: texts,
      maxParallelCalls: 4,
      maxRetries: 1,
      providerOptions: providerOptions("RETRIEVAL_DOCUMENT"),
    });
    return embeddings;
  });
}
