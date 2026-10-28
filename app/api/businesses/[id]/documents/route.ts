import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { error, isOperator, json } from "@/lib/http";
import { readUploads } from "@/lib/onboard/documents";
import { formatBytes, MAX_REQUEST_BYTES } from "@/lib/onboard/limits";
import { addDocuments, deleteSource, listSources } from "@/lib/onboard/sources";
import { OnboardError } from "@/lib/onboard/url";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const UUID = /^[0-9a-f-]{36}$/i;
const sourceSchema = z.union([z.literal("website"), z.string().startsWith("doc://").max(200)]);

async function find(id: string) {
  if (!UUID.test(id)) return null;
  return (await db.query.businesses.findFirst({ where: eq(schema.businesses.id, id) })) ?? null;
}

const STATUS: Partial<Record<OnboardError["code"], number>> = { file_too_large: 413, no_content: 404, extraction_failed: 502 };

function failure(err: unknown): Response {
  if (err instanceof OnboardError) return error(STATUS[err.code] ?? 400, err.message);
  console.error("[documents]", err);
  return error(500, "Updating the knowledge base failed unexpectedly. Try again.");
}

/** Knowledge sources of a business, grouped by document, website and profile summary. */
export async function GET(req: Request, ctx: RouteContext<"/api/businesses/[id]/documents">) {
  if (!isOperator(req)) return error(401, "Operator access required");
  const business = await find((await ctx.params).id);
  if (!business) return error(404, "Not found");
  return json({ sources: await listSources(business) });
}

/** Adds documents to a live agent: multipart "files". Responds once passages are stored and the profile is merged. */
export async function POST(req: Request, ctx: RouteContext<"/api/businesses/[id]/documents">) {
  if (!isOperator(req)) return error(401, "Operator access required");
  if (!rateLimit(`documents:${clientKey(req)}`, 12, 10 * 60_000)) return error(429, "Too many uploads. Try again in a few minutes.");
  const business = await find((await ctx.params).id);
  if (!business) return error(404, "Not found");
  if (business.isDemo) return error(409, "The demo business is managed by the seed script.");
  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return error(415, "Send documents as multipart form data in a files field.");
  if (Number(req.headers.get("content-length") ?? "0") > MAX_REQUEST_BYTES + 64 * 1024) return error(413, `One upload can carry up to ${formatBytes(MAX_REQUEST_BYTES)}.`);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error(400, "The upload could not be read. Try again.");
  }
  try {
    const uploads = await readUploads(form.getAll("files"));
    const result = await addDocuments(business, uploads, req.signal);
    const updated = await find(business.id);
    return json({ ...result, sources: updated ? await listSources(updated) : [] });
  } catch (err) {
    return failure(err);
  }
}

/** Removes one knowledge source: DELETE ?source=doc://<filename> or ?source=website. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/businesses/[id]/documents">) {
  if (!isOperator(req)) return error(401, "Operator access required");
  const business = await find((await ctx.params).id);
  if (!business) return error(404, "Not found");
  if (business.isDemo) return error(409, "The demo business is managed by the seed script.");
  const source = sourceSchema.safeParse(new URL(req.url).searchParams.get("source"));
  if (!source.success) return error(400, "Pass ?source=doc://<filename> or ?source=website.");
  try {
    const removed = await deleteSource(business, source.data);
    return json({ removed, sources: await listSources(business) });
  } catch (err) {
    return failure(err);
  }
}
