import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { invalidateBusiness } from "@/lib/agent/business";
import { businessHoursSchema, type BusinessProfile, type Persona } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import { error, isOperator, json } from "@/lib/http";
import { LIVE_VOICES } from "@/lib/onboard/extract";
import { buildSlots, scheduleFromHours } from "@/lib/seed/reset";

const UUID = /^[0-9a-f-]{36}$/i;
const text = (max: number) => z.string().trim().max(max).refine((s) => !s.includes("—"), "Em dashes are not allowed");

const patchSchema = z
  .object({
    profile: z
      .object({
        name: text(120).min(1),
        tagline: text(200),
        description: text(1200),
        services: z.array(z.object({ name: text(120).min(1), description: text(400), price: text(120) })).max(20),
        hours: z.array(businessHoursSchema.extend({ open: z.string().regex(/^(\d{2}:\d{2})?$/), close: z.string().regex(/^(\d{2}:\d{2})?$/) })).max(7),
        bookingRules: z.array(text(300).min(1)).max(10),
        bookableOffering: text(60).min(2),
        toneOfVoice: text(300),
        languages: z.array(text(40).min(1)).min(1).max(8),
      })
      .partial()
      .strict(),
    persona: z
      .object({ agentName: text(24).min(1), greeting: text(240).min(4), style: text(400), voice: z.enum(LIVE_VOICES) })
      .partial()
      .strict(),
  })
  .partial()
  .strict();

async function find(id: string) {
  if (!UUID.test(id)) return null;
  return (await db.query.businesses.findFirst({ where: eq(schema.businesses.id, id) })) ?? null;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/businesses/[id]">) {
  const business = await find((await ctx.params).id);
  if (!business) return error(404, "Not found");
  const { id, slug, name, website, profile, persona, onboardMs, kind } = business;
  return json({ id, slug, name, website, profile, persona, onboardMs, kind });
}

/** Operator edits to an onboarded agent. Takes effect on the next customer turn. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/businesses/[id]">) {
  if (!isOperator(req)) return error(401, "Operator access required");
  const business = await find((await ctx.params).id);
  if (!business) return error(404, "Not found");
  if (business.isDemo) return error(409, "The demo business is managed by the seed script.");
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return error(400, body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

  const profile: BusinessProfile = { ...business.profile, ...body.data.profile };
  const persona: Persona = { ...business.persona, ...body.data.persona };
  const previousOffering = business.profile.bookableOffering;

  await db.transaction(async (tx) => {
    await tx.update(schema.businesses).set({ profile, persona, name: profile.name }).where(eq(schema.businesses.id, business.id));
    if (profile.bookableOffering !== previousOffering) {
      await tx
        .update(schema.services)
        .set({ name: profile.bookableOffering })
        .where(and(eq(schema.services.businessId, business.id), eq(schema.services.name, previousOffering)));
    }
    if (body.data.profile?.hours) {
      // New hours reshape the calendar: open future slots are rebuilt, booked ones are kept.
      await tx.delete(schema.slots).where(and(eq(schema.slots.businessId, business.id), eq(schema.slots.status, "open"), gte(schema.slots.startsAt, new Date())));
      const team = await tx.select().from(schema.staff).where(eq(schema.staff.businessId, business.id));
      const rows = buildSlots(business.id, team.map((t) => ({ id: t.id, locationId: t.locationId, schedule: scheduleFromHours(profile.hours) })));
      if (rows.length) await tx.insert(schema.slots).values(rows).onConflictDoNothing();
    }
    if (profile.name !== business.profile.name) {
      await tx
        .update(schema.staff)
        .set({ name: `${profile.name} team` })
        .where(and(eq(schema.staff.businessId, business.id), eq(schema.staff.name, `${business.profile.name} team`)));
    }
  });
  invalidateBusiness();
  return json({ ok: true, profile, persona });
}
