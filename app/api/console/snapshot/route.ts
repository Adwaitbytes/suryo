import { businessFromQuery, guard } from "@/lib/console/http";
import { maybeRunMaintenance } from "@/lib/console/maintenance";
import { getSnapshot } from "@/lib/console/queries";
import { json } from "@/lib/http";

/** Everything the live view needs in one round trip; also the polling fallback when SSE is unavailable. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const business = await businessFromQuery(req);
  if (business instanceof Response) return business;
  maybeRunMaintenance();
  return json(await getSnapshot(business), { headers: { "Cache-Control": "no-store" } });
}
