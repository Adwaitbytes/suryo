import { businessFromQuery, guard } from "@/lib/console/http";
import { getEscalationQueue } from "@/lib/console/queries";
import { json } from "@/lib/http";

/** Open escalations sorted by urgency then age, plus the last week of resolved ones. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const business = await businessFromQuery(req);
  if (business instanceof Response) return business;
  return json(await getEscalationQueue(business.id), { headers: { "Cache-Control": "no-store" } });
}
