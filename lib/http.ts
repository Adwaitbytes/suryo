import type { StreamEvent } from "@/lib/contracts";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Streams protocol events as newline delimited JSON. */
export function ndjson(events: AsyncIterable<StreamEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } catch (err) {
        console.error("[ndjson]", err);
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message: "Something went wrong" } satisfies StreamEvent)}\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

/** Mutating operator endpoints require the operator key when one is configured. */
export function isOperator(req: Request): boolean {
  const key = process.env.OPERATOR_KEY;
  if (!key) return true;
  const header = req.headers.get("x-operator-key");
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)suryo_op=([^;]+)/)?.[1];
  return header === key || (cookie ? decodeURIComponent(cookie) === key : false);
}
