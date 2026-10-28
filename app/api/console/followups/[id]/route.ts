import { eq } from "drizzle-orm";
import { z } from "zod";
import { guard, parseBody } from "@/lib/console/http";
import { db, schema } from "@/lib/db";
import { emit } from "@/lib/events";
import { error, json } from "@/lib/http";

const bodySchema = z.object({ status: z.enum(["sent", "cancelled", "pending"]) });

export async function PATCH(req: Request, ctx: RouteContext<"/api/console/followups/[id]">) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "Invalid id");
  const body = await parseBody(req, bodySchema);
  if (body instanceof Response) return body;
  const t = schema.followUps;
  const [row] = await db
    .update(t)
    .set({ status: body.status, sentAt: body.status === "sent" ? new Date() : null, error: null })
    .where(eq(t.id, id))
    .returning({ id: t.id, businessId: t.businessId, conversationId: t.conversationId, status: t.status });
  if (!row) return error(404, "Not found");
  await emit("followup.changed", { businessId: row.businessId, conversationId: row.conversationId }, { id: row.id, status: row.status, updated: true });
  return json({ id: row.id, status: row.status });
}
