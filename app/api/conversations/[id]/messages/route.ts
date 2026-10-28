import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { error, json } from "@/lib/http";

/** A dropped database socket surfaces as one failed query; a single retry gets a fresh connection. */
async function once<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    return run();
  }
}

/** Polled by the chat widget and call screen to receive human replies after takeover. */
export async function GET(req: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "Invalid id");
  const after = new URL(req.url).searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const validAfter = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;
  try {
    const conversation = await once(() => db.query.conversations.findFirst({ where: eq(schema.conversations.id, id) }));
    if (!conversation) return error(404, "Not found");
    const rows = await once(() =>
      db
        .select({ id: schema.messages.id, role: schema.messages.role, content: schema.messages.content, meta: schema.messages.meta, createdAt: schema.messages.createdAt })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.conversationId, id),
            // Postgres keeps microseconds but the client cursor has milliseconds, so compare at millisecond precision.
            validAfter ? sql`date_trunc('milliseconds', ${schema.messages.createdAt}) > ${validAfter.toISOString()}::timestamptz` : undefined,
          ),
        )
        .orderBy(asc(schema.messages.createdAt)),
    );
    return json({
      status: conversation.status,
      messages: rows.map(({ meta, ...m }) => ({ ...m, cards: meta.cards ?? [], sources: meta.sources ?? [] })),
    });
  } catch (err) {
    console.error("[messages] poll failed", err instanceof Error ? err.message : err);
    return error(503, "Temporarily unavailable, retrying");
  }
}
