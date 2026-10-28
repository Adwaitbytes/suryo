import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type BusinessBundle = Awaited<ReturnType<typeof loadBusiness>>;

export async function loadBusiness(slugOrId: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const business = await db.query.businesses.findFirst({
    where: isUuid ? eq(schema.businesses.id, slugOrId) : eq(schema.businesses.slug, slugOrId),
  });
  if (!business) return null;
  const [locations, staff, services] = await Promise.all([
    db.select().from(schema.locations).where(eq(schema.locations.businessId, business.id)),
    db.select().from(schema.staff).where(eq(schema.staff.businessId, business.id)).orderBy(asc(schema.staff.name)),
    db.select().from(schema.services).where(eq(schema.services.businessId, business.id)),
  ]);
  return { business, locations, staff, services };
}

/** Matches a free text service name ("cleaning", "teeth cleaning ka") to a catalog entry. */
export function matchService(bundle: NonNullable<BusinessBundle>, query: string) {
  const q = normalize(query);
  if (!q) return null;
  let best: { score: number; service: (typeof bundle.services)[number] } | null = null;
  for (const service of bundle.services) {
    const name = normalize(service.name);
    let score = 0;
    if (name === q) score = 100;
    else if (name.includes(q) || q.includes(name)) score = 60;
    else {
      const words = q.split(" ").filter((w) => w.length > 2);
      score = words.filter((w) => name.includes(w) || normalize(service.description).includes(w)).length * 15;
    }
    if (score > 0 && (!best || score > best.score)) best = { score, service };
  }
  return best?.service ?? null;
}

export function matchStaff(bundle: NonNullable<BusinessBundle>, query: string) {
  const q = normalize(query).replace(/^dr /, "");
  if (!q) return null;
  return bundle.staff.find((s) => normalize(s.name).includes(q)) ?? null;
}

export function matchLocation(bundle: NonNullable<BusinessBundle>, query: string) {
  const q = normalize(query);
  if (!q) return null;
  return bundle.locations.find((l) => normalize(l.name).includes(q) || q.includes(normalize(l.name))) ?? null;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
