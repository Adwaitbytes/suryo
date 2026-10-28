import { z } from "zod";
import { error } from "@/lib/http";
import { readUploads, type UploadedDocument } from "@/lib/onboard/documents";
import { formatBytes, MAX_REQUEST_BYTES } from "@/lib/onboard/limits";
import { onboard, type OnboardEvent } from "@/lib/onboard/pipeline";
import { OnboardError } from "@/lib/onboard/url";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const bodySchema = z.object({ url: z.string().trim().min(3).max(2048) });
const formUrlSchema = z.string().trim().max(2048).optional();

type Parsed = { url: string | null; documents: UploadedDocument[] };

/** JSON { url } onboards a website; multipart with "files" and an optional "url" onboards documents. */
async function readRequest(req: Request): Promise<Parsed | Response> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data")) {
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return error(400, "Send a website address as { url }.");
    return { url: body.data.url, documents: [] };
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_REQUEST_BYTES + 64 * 1024) return error(413, `One upload can carry up to ${formatBytes(MAX_REQUEST_BYTES)}.`);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error(400, "The upload could not be read. Try again.");
  }
  const url = formUrlSchema.safeParse(form.get("url") ?? undefined);
  if (!url.success) return error(400, "The website address is too long.");
  try {
    const documents = await readUploads(form.getAll("files"));
    return { url: url.data || null, documents };
  } catch (err) {
    if (err instanceof OnboardError) return error(err.code === "file_too_large" ? 413 : 400, err.message);
    throw err;
  }
}

/** Streams onboarding progress as newline delimited JSON, ending with a done or error event. */
export async function POST(req: Request) {
  if (!rateLimit(`onboard:${clientKey(req)}`, 6, 10 * 60_000)) return error(429, "Too many onboarding runs. Try again in a few minutes.");
  const input = await readRequest(req);
  if (input instanceof Response) return input;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: OnboardEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      await onboard(input, send, req.signal);
      open = false;
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
