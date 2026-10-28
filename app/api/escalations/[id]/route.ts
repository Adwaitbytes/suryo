import { z } from "zod";
import { failure, guard, parseBody } from "@/lib/console/http";
import { claimEscalation, DEFAULT_OPERATOR, resolveEscalation } from "@/lib/console/operator";
import { error, json } from "@/lib/http";

const bodySchema = z.object({
  action: z.enum(["claim", "resolve"]),
  operator: z.string().trim().min(2).max(60).default(DEFAULT_OPERATOR),
});

/** Claiming an escalation takes over its conversation when the customer is still there; resolving closes both. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/escalations/[id]">) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "Invalid id");
  const body = await parseBody(req, bodySchema);
  if (body instanceof Response) return body;
  try {
    if (body.action === "resolve") return json(await resolveEscalation(id, body.operator));
    return json(await claimEscalation(id, body.operator));
  } catch (err) {
    return failure(err, "escalation");
  }
}
