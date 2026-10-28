import { businessFromQuery, guard } from "@/lib/console/http";
import { listCustomers } from "@/lib/console/queries";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const business = await businessFromQuery(req);
  if (business instanceof Response) return business;
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 80) ?? undefined;
  return json({ items: await listCustomers(business.id, q) });
}
