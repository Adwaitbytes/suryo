import { z } from "zod";
import { db } from "@/lib/db";
import { failure, guard, parseBody } from "@/lib/console/http";
import { DEFAULT_OPERATOR, resolveEscalation, takeOver } from "@/lib/console/operator";
import { error, json } from "@/lib/http";

const bodySchema = z.object({
  action: z.enum(["claim", "resolve"]),
  operator: z.string().trim().min(2).max(60).default(DEFAULT_OPERATOR),
});

/** Claiming an escalation is a takeover of its conversation; resolving closes both. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/escalations/[id]">) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "Invalid id");
  const body = await parseBody(req, bodySchema);
  if (body instanceof Response) return body;
  try {
    if (body.action === "resolve") return json(await resolveEscalation(id, body.operator));
    const escalation = await db.query.escalations.findFirst({ where: (e, { eq }) => eq(e.id, id) });
    if (!escalation) return error(404, "Escalation not found");
    return json(await takeOver(escalation.conversationId, body.operator));
  } catch (err) {
    return failure(err, "escalation");
  }
}
