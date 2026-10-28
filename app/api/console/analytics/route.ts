import { getAnalytics } from "@/lib/analytics";
import { businessFromQuery, guard } from "@/lib/console/http";
import { error, json } from "@/lib/http";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const business = await businessFromQuery(req);
  if (business instanceof Response) return business;
  const days = Number(new URL(req.url).searchParams.get("days") ?? 14);
  if (![7, 14, 30].includes(days)) return error(400, "days must be 7, 14 or 30");
  return json({ analytics: await getAnalytics(business.id, days), days }, { headers: { "Cache-Control": "no-store" } });
}
