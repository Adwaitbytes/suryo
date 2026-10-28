import { businessFromQuery, guard } from "@/lib/console/http";
import { listLeads } from "@/lib/console/queries";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const business = await businessFromQuery(req);
  if (business instanceof Response) return business;
  return json({ items: await listLeads(business.id) });
}
