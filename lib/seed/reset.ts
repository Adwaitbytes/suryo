import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { embedDocuments } from "@/lib/kb/embed";
import { addDaysIso, istToUtc, todayIso } from "@/lib/time";
import type { BusinessProfile } from "@/lib/contracts";
import {
  CLINIC_SLUG,
  clinicDoctors,
  clinicKnowledge,
  clinicLocations,
  clinicPersona,
  clinicProfile,
  clinicServices,
  type DoctorSeed,
} from "./clinic";
import { historyTemplates, seedCustomers } from "./history";

const SLOT_MIN = 30;
const DAYS_AHEAD = 14;

type Schedule = DoctorSeed["schedule"];

/** Splits each working shift into 30 minute slots for the next two weeks. */
export function buildSlots(
  businessId: string,
  staff: Array<{ id: string; locationId: string | null; schedule: Schedule }>,
  fromIso = todayIso(),
  days = DAYS_AHEAD,
) {
  const rows: Array<typeof schema.slots.$inferInsert> = [];
  for (let d = 0; d < days; d++) {
    const dateIso = addDaysIso(fromIso, d);
    const weekday = istToUtc(dateIso, "12:00").getUTCDay() as keyof Schedule;
    for (const member of staff) {
      for (const [start, end] of member.schedule[weekday] ?? []) {
        let t = istToUtc(dateIso, start).getTime();
        const stop = istToUtc(dateIso, end).getTime();
        while (t + SLOT_MIN * 60_000 <= stop) {
          rows.push({
            businessId,
            staffId: member.id,
            locationId: member.locationId,
            startsAt: new Date(t),
            endsAt: new Date(t + SLOT_MIN * 60_000),
          });
          t += SLOT_MIN * 60_000;
        }
      }
    }
  }
  return rows;
}

/** Converts published business hours into a weekly schedule for a generic business. */
export function scheduleFromHours(hours: BusinessProfile["hours"]): Schedule {
  const index = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as const;
  const schedule: Schedule = {};
  for (const h of hours) {
    if (h.open && h.close && h.open < h.close) schedule[index[h.day]] = [[h.open, h.close]];
  }
  if (Object.keys(schedule).length === 0) {
    for (const d of [1, 2, 3, 4, 5] as const) schedule[d] = [["10:00", "13:00"], ["14:00", "18:00"]];
  }
  return schedule;
}

/** Full rebuild of the demo clinic including knowledge base embeddings. */
export async function seedClinic(): Promise<string> {
  await db.delete(schema.businesses).where(eq(schema.businesses.slug, CLINIC_SLUG));
  const [business] = await db
    .insert(schema.businesses)
    .values({
      slug: CLINIC_SLUG,
      name: clinicProfile.name,
      kind: "clinic",
      website: "https://kesarclinic.in",
      profile: {
        ...clinicProfile,
        services: clinicServices.map((s) => ({
          name: s.name,
          description: s.description,
          price: s.priceInr ? `INR ${s.priceInr}${s.priceNote ? `, ${s.priceNote}` : ""}` : "",
        })),
        locations: clinicLocations.map((l) => ({ name: l.name, address: l.address })),
      },
      persona: clinicPersona,
      isDemo: true,
    })
    .returning();
  const locs = await db
    .insert(schema.locations)
    .values(clinicLocations.map((l) => ({ businessId: business.id, name: l.name, address: l.address, phone: l.phone })))
    .returning();
  const locId = (key: string) => locs.find((l) => l.name === clinicLocations.find((c) => c.key === key)?.name)?.id ?? null;
  await db.insert(schema.staff).values(
    clinicDoctors.map((d) => ({
      businessId: business.id,
      name: d.name,
      title: d.title,
      specialties: d.specialties,
      languages: d.languages,
      locationId: locId(d.location),
    })),
  );
  await db.insert(schema.services).values(
    clinicServices.map((s) => ({
      businessId: business.id,
      name: s.name,
      category: s.category,
      durationMin: s.durationMin,
      priceInr: s.priceInr,
      priceNote: s.priceNote ?? null,
      description: s.description,
      specialty: s.specialty,
    })),
  );
  const embeddings = await embedDocuments(clinicKnowledge.map((k) => `${k.title}\n${k.content}`));
  await db.insert(schema.kbChunks).values(
    clinicKnowledge.map((k, i) => ({
      businessId: business.id,
      sourceUrl: `https://kesarclinic.in/help#${k.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: k.title,
      content: k.content,
      embedding: embeddings[i],
    })),
  );
  await resetClinicState(business.id);
  return business.id;
}

/** Restores clean operational state (slots, CRM, history) without re-embedding. Target: under 5 seconds. */
export async function resetClinicState(businessId?: string): Promise<{ ms: number }> {
  const started = Date.now();
  const business = businessId
    ? await db.query.businesses.findFirst({ where: eq(schema.businesses.id, businessId) })
    : await db.query.businesses.findFirst({ where: eq(schema.businesses.slug, CLINIC_SLUG) });
  if (!business) throw new Error("Demo clinic is not seeded. Run pnpm db:seed.");
  const id = business.id;

  await db.transaction(async (tx) => {
    await tx.delete(schema.conversations).where(eq(schema.conversations.businessId, id));
    await tx.delete(schema.appointments).where(eq(schema.appointments.businessId, id));
    await tx.delete(schema.tickets).where(eq(schema.tickets.businessId, id));
    await tx.delete(schema.leads).where(eq(schema.leads.businessId, id));
    await tx.delete(schema.followUps).where(eq(schema.followUps.businessId, id));
    await tx.delete(schema.notifications).where(eq(schema.notifications.businessId, id));
    await tx.delete(schema.events).where(eq(schema.events.businessId, id));
    await tx.delete(schema.customers).where(eq(schema.customers.businessId, id));
    await tx.delete(schema.slots).where(eq(schema.slots.businessId, id));
  });

  const staffRows = await db.select().from(schema.staff).where(eq(schema.staff.businessId, id));
  const serviceRows = await db.select().from(schema.services).where(eq(schema.services.businessId, id));
  const schedules = staffRows.map((s) => ({
    id: s.id,
    locationId: s.locationId,
    schedule: clinicDoctors.find((d) => d.name === s.name)?.schedule ?? {},
  }));

  // Past ten days of slots carry the seeded history; the next fourteen are bookable.
  const pastSlots = buildSlots(id, schedules, addDaysIso(todayIso(), -10), 10);
  const futureSlots = buildSlots(id, schedules);
  const insertedPast = pastSlots.length
    ? await db.insert(schema.slots).values(pastSlots.map((s) => ({ ...s, status: "booked" as const }))).returning()
    : [];
  const insertedFuture = await db.insert(schema.slots).values(futureSlots).returning();

  const customers = await db
    .insert(schema.customers)
    .values(seedCustomers.map((c) => ({ businessId: id, name: c.name, phone: c.phone, email: c.email, language: c.language })))
    .returning();

  const rand = mulberry32(42);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const serviceFor = (staffId: string) => {
    const staff = staffRows.find((s) => s.id === staffId);
    const options = serviceRows.filter((sv) => !sv.specialty || staff?.specialties.includes(sv.specialty));
    return pick(options.length ? options : serviceRows);
  };

  // Book a realistic share of the coming two weeks (denser in the next few days).
  const now = Date.now();
  const bookedFuture = insertedFuture.filter((s) => {
    const daysOut = (s.startsAt.getTime() - now) / 86_400_000;
    const density = daysOut < 2 ? 0.45 : daysOut < 5 ? 0.35 : 0.2;
    return rand() < density;
  });
  const appointmentRows: Array<typeof schema.appointments.$inferInsert> = [];
  for (const slot of bookedFuture) {
    const service = serviceFor(slot.staffId);
    appointmentRows.push({ businessId: id, customerId: pick(customers).id, slotId: slot.id, serviceId: service.id, staffId: slot.staffId, startsAt: slot.startsAt, priceInr: service.priceInr, status: "confirmed", createdAt: new Date(now - Math.floor(rand() * 9 * 86_400_000) - 3600_000) });
  }
  const pastSample = insertedPast.filter(() => rand() < 0.25);
  for (const slot of pastSample) {
    const service = serviceFor(slot.staffId);
    appointmentRows.push({ businessId: id, customerId: pick(customers).id, slotId: slot.id, serviceId: service.id, staffId: slot.staffId, startsAt: slot.startsAt, priceInr: service.priceInr, status: "completed", createdAt: new Date(slot.startsAt.getTime() - Math.floor(1 + rand() * 4) * 86_400_000) });
  }
  const unbookedPast = insertedPast.filter((s) => !pastSample.includes(s)).map((s) => s.id);
  if (unbookedPast.length) await db.update(schema.slots).set({ status: "blocked" }).where(inArray(schema.slots.id, unbookedPast));
  if (bookedFuture.length) await db.update(schema.slots).set({ status: "booked" }).where(inArray(schema.slots.id, bookedFuture.map((s) => s.id)));

  // Seeded conversation history, two passes over the templates with different customers.
  const convRows: Array<typeof schema.conversations.$inferInsert & { _t: number }> = [];
  for (let pass = 0; pass < 3; pass++) {
    historyTemplates.forEach((t, i) => {
      if (pass === 2 && i % 2 === 1) return;
      const hoursAgo = 6 + Math.floor(rand() * 9 * 24) + pass * 7;
      const startedAt = new Date(now - hoursAgo * 3600_000);
      const customer = customers[(i + pass * 5) % customers.length];
      convRows.push({
        _t: i,
        businessId: id,
        customerId: customer.id,
        channel: t.channel,
        status: t.escalation ? (t.escalation.open === false || pass > 0 ? "resolved" : "escalated") : t.outcome === "unresolved" ? "abandoned" : "resolved",
        stage: "close",
        language: t.language,
        intent: t.intent,
        sentiment: t.sentiment,
        summary: t.summary,
        resolvedByAi: !t.escalation && t.outcome !== "unresolved",
        startedAt,
        lastActivityAt: new Date(startedAt.getTime() + 3 * 60_000),
        endedAt: new Date(startedAt.getTime() + 3 * 60_000),
      });
    });
  }
  const insertedConvs = await db.insert(schema.conversations).values(convRows.map(withoutTemplateIndex)).returning();

  const msgRows: Array<typeof schema.messages.$inferInsert> = [];
  const toolRows: Array<typeof schema.toolCalls.$inferInsert> = [];
  const ticketRows: Array<typeof schema.tickets.$inferInsert> = [];
  const leadRows: Array<typeof schema.leads.$inferInsert> = [];
  const escRows: Array<typeof schema.escalations.$inferInsert> = [];
  const followRows: Array<typeof schema.followUps.$inferInsert> = [];
  insertedConvs.forEach((conv, idx) => {
    const t = historyTemplates[convRows[idx]._t];
    const base = conv.startedAt.getTime();
    t.turns.forEach(([role, text], k) => {
      msgRows.push({
        conversationId: conv.id,
        role,
        content: text,
        createdAt: new Date(base + k * 20_000),
        meta: role === "agent" ? { latencyMs: 900 + Math.floor(rand() * 700), tools: t.tools, language: t.language } : { language: t.language, sentiment: t.sentiment },
      });
    });
    t.tools.forEach((name, k) =>
      toolRows.push({ conversationId: conv.id, name, input: {}, output: { seeded: true }, ok: true, durationMs: 120 + Math.floor(rand() * 400), createdAt: new Date(base + k * 15_000 + 5_000) }),
    );
    if (t.ticket) ticketRows.push({ businessId: id, customerId: conv.customerId, conversationId: conv.id, ...t.ticket, status: conv.status === "resolved" ? "resolved" : "open", createdAt: conv.startedAt });
    if (t.lead) leadRows.push({ businessId: id, customerId: conv.customerId, conversationId: conv.id, interest: t.lead.interest, budget: t.lead.budget, timeline: t.lead.timeline, score: t.lead.score, status: idx % 3 === 0 ? "contacted" : "new", createdAt: conv.startedAt });
    if (t.escalation) {
      const open = conv.status === "escalated";
      escRows.push({ businessId: id, conversationId: conv.id, reason: t.escalation.reason, trigger: t.escalation.trigger, urgency: t.escalation.urgency, summary: [t.summary.headline, ...t.summary.bullets].slice(0, 3).join("\n"), status: open ? "open" : "resolved", claimedBy: open ? null : "Priya (front desk)", createdAt: conv.startedAt, resolvedAt: open ? null : new Date(conv.startedAt.getTime() + 25 * 60_000) });
    }
    if (t.outcome === "unresolved" || t.lead) {
      followRows.push({ businessId: id, conversationId: conv.id, customerId: conv.customerId, kind: t.lead ? "lead_nurture" : "callback", channel: t.lead ? "email" : "call", dueAt: new Date(base + 26 * 3600_000), status: base + 26 * 3600_000 < now ? "sent" : "pending", subject: t.lead ? `Following up on ${t.lead.interest}` : "Callback requested", body: t.summary.nextStep, sentAt: base + 26 * 3600_000 < now ? new Date(base + 26 * 3600_000) : null });
    }
  });
  await db.insert(schema.messages).values(msgRows);
  await db.insert(schema.toolCalls).values(toolRows);
  if (ticketRows.length) await db.insert(schema.tickets).values(ticketRows);
  if (leadRows.length) await db.insert(schema.leads).values(leadRows);
  if (escRows.length) await db.insert(schema.escalations).values(escRows);
  if (followRows.length) await db.insert(schema.followUps).values(followRows);
  if (appointmentRows.length) {
    // Attach some appointments to the seeded booking conversations for timeline continuity.
    const bookingConvs = insertedConvs.filter((c, i) => historyTemplates[convRows[i]._t].outcome === "booked");
    appointmentRows.slice(0, bookingConvs.length).forEach((a, i) => {
      a.conversationId = bookingConvs[i].id;
      a.customerId = bookingConvs[i].customerId ?? a.customerId;
    });
    await db.insert(schema.appointments).values(appointmentRows);
  }
  // Upcoming reminders for confirmed bookings in the next two days.
  const reminders = appointmentRows
    .filter((a) => a.status === "confirmed" && (a.startsAt as Date).getTime() - now < 2 * 86_400_000)
    .slice(0, 8)
    .map((a) => ({ businessId: id, customerId: a.customerId, conversationId: a.conversationId ?? null, kind: "reminder" as const, channel: "email" as const, dueAt: new Date(Math.max(now + 3600_000, (a.startsAt as Date).getTime() - 3 * 3600_000)), subject: "Appointment reminder", body: "Reminder for your upcoming visit at Kesar Dental & Skin." }));
  if (reminders.length) await db.insert(schema.followUps).values(reminders);

  return { ms: Date.now() - started };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withoutTemplateIndex<T extends { _t: number }>(row: T): Omit<T, "_t"> {
  const copy: Partial<T> = { ...row };
  delete copy._t;
  return copy as Omit<T, "_t">;
}
