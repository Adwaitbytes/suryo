import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { error, json } from "@/lib/http";

/** Polled by the chat widget and call screen to receive human replies after takeover. */
export async function GET(req: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "Invalid id");
  const after = new URL(req.url).searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, id) });
  if (!conversation) return error(404, "Not found");
  const rows = await db
    .select({ id: schema.messages.id, role: schema.messages.role, content: schema.messages.content, meta: schema.messages.meta, createdAt: schema.messages.createdAt })
    .from(schema.messages)
    .where(and(eq(schema.messages.conversationId, id), afterDate && !Number.isNaN(afterDate.getTime()) ? gt(schema.messages.createdAt, afterDate) : undefined))
    .orderBy(asc(schema.messages.createdAt));
  return json({
    status: conversation.status,
    messages: rows.map(({ meta, ...m }) => ({ ...m, cards: meta.cards ?? [], sources: meta.sources ?? [] })),
  });
}
