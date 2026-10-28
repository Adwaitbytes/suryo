import { businessFromQuery, guard } from "@/lib/console/http";
import { listBookings } from "@/lib/console/queries";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const business = await businessFromQuery(req);
  if (business instanceof Response) return business;
  const [upcoming, past] = await Promise.all([
    listBookings(business.id, { when: "upcoming" }),
    listBookings(business.id, { when: "past" }),
  ]);
  return json({ upcoming, past });
}
