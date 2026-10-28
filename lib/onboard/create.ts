import { and, eq, isNotNull, like, or } from "drizzle-orm";
import type { BusinessProfile, Persona } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import { buildSlots, scheduleFromHours } from "@/lib/seed/reset";
import type { Chunk } from "./chunk";

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/, "") || "business"
  );
}

const RESERVED = new Set(["kesar", "api", "admin", "console", "onboard", "evals", "chat", "call", "pitch", "widget"]);

async function uniqueSlug(base: string): Promise<string> {
  const rows = await db
    .select({ slug: schema.businesses.slug })
    .from(schema.businesses)
    .where(or(eq(schema.businesses.slug, base), like(schema.businesses.slug, `${base}-%`)));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base) && !RESERVED.has(base)) return base;
  for (let n = 2; n < 500; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** Price text like "₹1,500" or "INR 1500 per session" becomes a number only when it is plainly rupees. */
export function priceInrFrom(price: string): number | null {
  const m = price.match(/(?:₹|rs\.?|inr)\s*([\d,]+)(?!\s*[-to]+\s*\d)/i);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 && value < 10_000_000 ? value : null;
}

export type CreatedBusiness = { id: string; slug: string; name: string; replaced: boolean };

/**
 * Writes the business and everything the agent's tools need: a location, a team calendar,
 * the bookable offering as a service anyone on the team can deliver, two weeks of slots
 * and the embedded knowledge base. Re-onboarding the same website replaces the earlier agent
 * and keeps its link, so a demo can be rerun without piling up copies.
 */
export async function createOnboardedBusiness(input: {
  website: string;
  profile: BusinessProfile;
  persona: Persona;
  chunks: Array<Chunk & { embedding: number[] }>;
  onboardMs: number;
}): Promise<CreatedBusiness & { slots: number }> {
  const host = new URL(input.website).hostname.replace(/^www\./, "");
  const candidates = await db
    .select({ id: schema.businesses.id, slug: schema.businesses.slug, website: schema.businesses.website })
    .from(schema.businesses)
    .where(and(eq(schema.businesses.isDemo, false), eq(schema.businesses.kind, "generic"), isNotNull(schema.businesses.website)));
  const previous = candidates.filter((c) => {
    try {
      return new URL(c.website ?? "").hostname.replace(/^www\./, "") === host;
    } catch {
      return false;
    }
  });

  return db.transaction(async (tx) => {
    for (const p of previous) await tx.delete(schema.businesses).where(eq(schema.businesses.id, p.id));
    const slug = previous[0]?.slug ?? (await uniqueSlug(slugify(input.profile.name)));
    const [business] = await tx
      .insert(schema.businesses)
      .values({
        slug,
        name: input.profile.name,
        kind: "generic",
        website: input.website,
        profile: input.profile,
        persona: input.persona,
        onboardMs: input.onboardMs,
        isDemo: false,
      })
      .returning();

    const published = input.profile.locations.filter((l) => l.name || l.address).slice(0, 3);
    const locations = await tx
      .insert(schema.locations)
      .values(
        published.length
          ? published.map((l) => ({ businessId: business.id, name: l.name || l.address.split(",")[0] || "Main office", address: l.address || l.name, phone: input.profile.contact.phone || null }))
          : [{ businessId: business.id, name: "Online", address: "Video call", phone: input.profile.contact.phone || null }],
      )
      .returning();

    const [team] = await tx
      .insert(schema.staff)
      .values({
        businessId: business.id,
        name: `${input.profile.name} team`,
        title: "Team",
        specialties: [],
        languages: input.profile.languages,
        locationId: locations[0].id,
      })
      .returning();

    const offering = input.profile.services.find((s) => s.name.toLowerCase() === input.profile.bookableOffering.toLowerCase());
    await tx.insert(schema.services).values({
      businessId: business.id,
      name: input.profile.bookableOffering,
      category: "Booking",
      durationMin: 30,
      priceInr: offering ? priceInrFrom(offering.price) : null,
      priceNote: offering?.price || null,
      description: offering?.description || `${input.profile.bookableOffering} with the ${input.profile.name} team.`,
      specialty: null,
    });

    const slots = buildSlots(business.id, [{ id: team.id, locationId: team.locationId, schedule: scheduleFromHours(input.profile.hours) }]);
    if (slots.length) await tx.insert(schema.slots).values(slots);

    if (input.chunks.length) {
      await tx.insert(schema.kbChunks).values(
        input.chunks.map((c) => ({ businessId: business.id, sourceUrl: c.sourceUrl, title: c.title.slice(0, 200), content: c.content, embedding: c.embedding })),
      );
    }
    return { id: business.id, slug: business.slug, name: business.name, replaced: previous.length > 0, slots: slots.length };
  });
}
