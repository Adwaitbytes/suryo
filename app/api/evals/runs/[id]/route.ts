import { error, json } from "@/lib/http";
import { getRunDetail } from "@/lib/evals/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/evals/runs/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "Invalid id");
  const detail = await getRunDetail(id);
  if (!detail) return error(404, "Not found");
  return json(detail, { headers: { "Cache-Control": "no-store" } });
}
