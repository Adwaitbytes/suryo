import { z } from "zod";
import { error } from "@/lib/http";
import { onboardSite, type OnboardEvent } from "@/lib/onboard/pipeline";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const bodySchema = z.object({ url: z.string().trim().min(3).max(2048) });

/** Streams onboarding progress as newline delimited JSON, ending with a done or error event. */
export async function POST(req: Request) {
  if (!rateLimit(`onboard:${clientKey(req)}`, 6, 10 * 60_000)) return error(429, "Too many onboarding runs. Try again in a few minutes.");
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return error(400, "Send a website address as { url }.");

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
      await onboardSite(body.data.url, send, req.signal);
      open = false;
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
