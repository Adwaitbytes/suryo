import { z } from "zod";
import { businessFromQuery, guard } from "@/lib/console/http";
import { eventsAfter, latestEventId } from "@/lib/console/queries";
import { error } from "@/lib/http";

export const maxDuration = 60;

const POLL_MS = 700;
const HEARTBEAT_MS = 15_000;
/** Ends before the platform limit so functions recycle; the client reconnects with its cursor. */
const LIFETIME_MS = 55_000;
const MAX_CONSECUTIVE_ERRORS = 5;

const cursorSchema = z.coerce.number().int().min(0).optional();

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const business = await businessFromQuery(req);
  if (business instanceof Response) return business;
  const url = new URL(req.url);
  const parsed = cursorSchema.safeParse(url.searchParams.get("after") ?? req.headers.get("last-event-id") ?? undefined);
  if (!parsed.success) return error(400, "after must be a non negative integer");
  let cursor = parsed.data ?? (await latestEventId(business.id));

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      send(`retry: 1500\nevent: ready\ndata: ${JSON.stringify({ cursor })}\n\n`);
      const started = Date.now();
      let lastWrite = Date.now();
      let errors = 0;
      while (!closed && Date.now() - started < LIFETIME_MS) {
        try {
          const batch = await eventsAfter(business.id, cursor);
          cursor = batch.cursor;
          errors = 0;
          if (batch.events.length) {
            send(`id: ${cursor}\nevent: events\ndata: ${JSON.stringify(batch.events)}\n\n`);
            lastWrite = Date.now();
          }
        } catch (err) {
          errors += 1;
          console.error("[console:stream]", err);
          if (errors >= MAX_CONSECUTIVE_ERRORS) break;
        }
        if (Date.now() - lastWrite >= HEARTBEAT_MS) {
          send(`: heartbeat ${Date.now()}\n\n`);
          lastWrite = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      send(`event: end\ndata: ${JSON.stringify({ cursor })}\n\n`);
      closed = true;
      try {
        controller.close();
      } catch {
        // The client already disconnected.
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
