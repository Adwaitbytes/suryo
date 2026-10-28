import { eq } from "drizzle-orm";
import { z } from "zod";
import { loadBusiness } from "@/lib/agent/business";
import { endConversation } from "@/lib/agent/run";
import { db, schema } from "@/lib/db";
import { error, json } from "@/lib/http";

const bodySchema = z.object({ reason: z.enum(["completed", "abandoned"]).default("completed") });

export async function POST(req: Request, ctx: RouteContext<"/api/conversations/[id]/end">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "Invalid id");
  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return error(400, "Invalid request");
  const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, id) });
  if (!conversation) return error(404, "Not found");
  const bundle = await loadBusiness(conversation.businessId);
  if (!bundle) return error(404, "Not found");
  await endConversation(bundle, id, body.data.reason);
  return json({ ok: true });
}
