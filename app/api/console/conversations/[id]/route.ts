import { guard } from "@/lib/console/http";
import { getConversationDetail } from "@/lib/console/queries";
import { error, json } from "@/lib/http";

export async function GET(req: Request, ctx: RouteContext<"/api/console/conversations/[id]">) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "Invalid id");
  const detail = await getConversationDetail(id);
  return detail ? json(detail, { headers: { "Cache-Control": "no-store" } }) : error(404, "Conversation not found");
}
