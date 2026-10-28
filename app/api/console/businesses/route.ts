import { guard } from "@/lib/console/http";
import { listBusinesses } from "@/lib/console/queries";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return json({ businesses: await listBusinesses() });
}
