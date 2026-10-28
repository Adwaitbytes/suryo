import { businessFromQuery, guard } from "@/lib/console/http";
import { getCustomerDetail } from "@/lib/console/queries";
import { error, json } from "@/lib/http";

export async function GET(req: Request, ctx: RouteContext<"/api/console/customers/[id]">) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "Invalid id");
  const business = await businessFromQuery(req);
  if (business instanceof Response) return business;
  const detail = await getCustomerDetail(business.id, id);
  return detail ? json(detail) : error(404, "Customer not found");
}
