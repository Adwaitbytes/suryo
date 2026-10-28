import { embed, embedMany } from "ai";
import { embeddingModel } from "@/lib/ai/models";
import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

const providerOptions = (taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") => ({
  google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType },
});

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel(),
    value: text,
    providerOptions: providerOptions("RETRIEVAL_QUERY"),
  });
  return embedding;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: embeddingModel(),
    values: texts,
    maxParallelCalls: 4,
    providerOptions: providerOptions("RETRIEVAL_DOCUMENT"),
  });
  return embeddings;
}
