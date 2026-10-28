import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { BusinessBundle } from "@/lib/agent/business";
import { db, schema } from "@/lib/db";
import { addDaysIso, formatSlot, istToUtc, todayIso } from "@/lib/time";
import type { ScenarioDef } from "./scenarios";

type Bundle = NonNullable<BusinessBundle>;

export type Identity = { name: string; firstName: string; phone: string; email: string | null };

export type SetupState = {
  identity: Identity;
  /** Facts the simulated customer knows, written into its brief. */
  facts: string[];
  /** Template values for openings and expectations. */
  vars: Record<string, string>;
  customerIds: string[];
  appointmentIds: string[];
  blockedSlotIds: string[];
  extraConversationIds: string[];
};

const NAMES = ["Ananya Rao", "Kabir Sethi", "Ishita Bansal", "Rohit Tiwari", "Meghna Kapoor", "Aarav Joshi", "Sana Mirza", "Vikas Pandey", "Neha Saxena", "Arnav Khurana", "Priyanka Das", "Siddharth Jain"];

/** Unique fake contact details per scenario run: 9000 prefixed phones and eval+ addresses on example.com. */
export async function makeIdentity(businessId: string, index: number, withEmail: boolean): Promise<Identity> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const phone = `9000${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
    const taken = await db.query.customers.findFirst({ where: and(eq(schema.customers.businessId, businessId), eq(schema.customers.phone, phone)) });
    if (taken) continue;
    const name = NAMES[(index + Math.floor(Math.random() * NAMES.length)) % NAMES.length];
    return { name, firstName: name.split(" ")[0], phone, email: withEmail ? `eval+${phone.slice(4)}@example.com` : null };
  }
  throw new Error("Could not allocate a unique eval phone number");
}

/** First open slot for the given staff member from a day offset, inside an IST time window. */
async function findOpenSlot(bundle: Bundle, staffId: string, fromDays: number, window: [string, string]) {
  for (let d = fromDays; d < 13; d++) {
    const day = addDaysIso(todayIso(), d);
    const [slot] = await db
      .select()
      .from(schema.slots)
      .where(
        and(
          eq(schema.slots.businessId, bundle.business.id),
          eq(schema.slots.staffId, staffId),
          eq(schema.slots.status, "open"),
          gte(schema.slots.startsAt, istToUtc(day, window[0])),
          lte(schema.slots.startsAt, istToUtc(day, window[1])),
        ),
      )
      .orderBy(asc(schema.slots.startsAt))
      .limit(1);
    if (slot) return slot;
  }
  return null;
}

const dentist = (bundle: Bundle) => {
  const staff = bundle.staff.find((s) => s.specialties.includes("dentist"));
  if (!staff) throw new Error("Eval setup needs a dentist on staff");
  return staff;
};

/**
 * Creates the deterministic database state a scenario starts from. Everything it writes is
 * recorded in the returned state so cleanup can remove exactly that and nothing else.
 */
export async function applySetup(bundle: Bundle, scenario: ScenarioDef, index: number): Promise<SetupState> {
  const withEmail = scenario.id === "book-en-cleaning";
  const identity = await makeIdentity(bundle.business.id, index, withEmail);
  const state: SetupState = {
    identity,
    facts: [],
    vars: { phone: identity.phone, firstName: identity.firstName, name: identity.name },
    customerIds: [],
    appointmentIds: [],
    blockedSlotIds: [],
    extraConversationIds: [],
  };
  const businessId = bundle.business.id;

  if (scenario.setup === "existing_booking" || scenario.setup === "returning_customer") {
    const [customer] = await db
      .insert(schema.customers)
      .values({ businessId, name: identity.name, phone: identity.phone, email: identity.email, language: scenario.language })
      .returning();
    state.customerIds.push(customer.id);

    if (scenario.setup === "existing_booking") {
      const doctor = dentist(bundle);
      const service = bundle.services.find((s) => s.name === "Teeth cleaning and polishing") ?? bundle.services.find((s) => s.specialty === "dentist");
      if (!service) throw new Error("Eval setup needs a dentist service");
      const slot = await findOpenSlot(bundle, doctor.id, 2, ["16:00", "19:30"]);
      if (!slot) throw new Error("No open dentist slot for existing_booking setup");
      const booked = await db.update(schema.slots).set({ status: "booked" }).where(and(eq(schema.slots.id, slot.id), eq(schema.slots.status, "open"))).returning();
      if (booked.length === 0) throw new Error("Setup slot was taken concurrently");
      const [appointment] = await db
        .insert(schema.appointments)
        .values({ businessId, customerId: customer.id, slotId: slot.id, serviceId: service.id, staffId: doctor.id, startsAt: slot.startsAt, priceInr: service.priceInr, status: "confirmed" })
        .returning();
      state.appointmentIds.push(appointment.id);
      state.facts.push(`You already have a ${service.name} appointment on ${formatSlot(slot.startsAt)} with ${doctor.name}. You booked it under your phone number.`);
      state.vars.existingSlot = formatSlot(slot.startsAt);
    } else {
      const [past] = await db
        .insert(schema.conversations)
        .values({
          businessId,
          customerId: customer.id,
          channel: "chat",
          isEval: true,
          status: "resolved",
          stage: "close",
          language: scenario.language,
          intent: "book",
          resolvedByAi: true,
          summary: { headline: "Booked teeth cleaning with Dr. Mehta", bullets: ["Six monthly cleaning booked"], outcome: "booked", nextStep: "None" },
          startedAt: new Date(Date.now() - 180 * 86_400_000),
          lastActivityAt: new Date(Date.now() - 180 * 86_400_000),
          endedAt: new Date(Date.now() - 180 * 86_400_000),
        })
        .returning();
      state.extraConversationIds.push(past.id);
      state.facts.push("You are a returning patient. Your last cleaning here was about six months ago with Dr. Ananya Mehta.");
    }
  }

  if (scenario.setup === "fully_booked_day") {
    const doctor = dentist(bundle);
    // A weekday at least four days out that the dentist works, so it does not collide with the
    // "tomorrow", "day after tomorrow" and "this Saturday" scenarios running alongside.
    let day = "";
    for (let d = 4; d < 12 && !day; d++) {
      const candidate = addDaysIso(todayIso(), d);
      const weekday = istToUtc(candidate, "12:00").getUTCDay();
      if (weekday >= 1 && weekday <= 5) day = candidate;
    }
    const rows = await db
      .update(schema.slots)
      .set({ status: "blocked" })
      .where(
        and(
          eq(schema.slots.businessId, businessId),
          eq(schema.slots.staffId, doctor.id),
          eq(schema.slots.status, "open"),
          gte(schema.slots.startsAt, istToUtc(day, "00:00")),
          lte(schema.slots.startsAt, istToUtc(day, "23:59")),
        ),
      )
      .returning({ id: schema.slots.id });
    state.blockedSlotIds.push(...rows.map((r) => r.id));
    const label = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(istToUtc(day, "12:00"));
    state.vars.fullDay = label;
    state.facts.push(`You want the appointment on ${label}.`);
  }

  if (identity.email) state.facts.push(`Your email is ${identity.email}.`);
  else state.facts.push("You do not have an email address handy; phone is fine for you.");
  return state;
}

/**
 * Removes every operational trace of one scenario so the demo stays clean: bookings are
 * released and their slots reopened, tickets, leads, escalations, follow ups, notifications
 * and console events are deleted, setup customers are removed. The eval conversation itself,
 * its messages and tool calls are kept for drill down.
 */
export async function cleanupScenario(bundle: Bundle, conversationId: string | null, state: SetupState | null, startedAt: Date): Promise<void> {
  const businessId = bundle.business.id;
  const convIds = [conversationId, ...(state?.extraConversationIds ?? [])].filter((c): c is string => Boolean(c));
  const phones = state ? [state.identity.phone] : [];
  const emails = state?.identity.email ? [state.identity.email] : [];

  const conversation = conversationId ? await db.query.conversations.findFirst({ where: eq(schema.conversations.id, conversationId) }) : null;
  const customerFilters = [
    phones.length ? inArray(schema.customers.phone, phones) : undefined,
    emails.length ? inArray(schema.customers.email, emails) : undefined,
    state?.customerIds.length ? inArray(schema.customers.id, state.customerIds) : undefined,
    // A customer the agent created under a mistyped number is still this scenario's.
    conversation?.customerId ? and(eq(schema.customers.id, conversation.customerId), gte(schema.customers.createdAt, startedAt)) : undefined,
  ].filter((f): f is NonNullable<typeof f> => Boolean(f));
  const customers = customerFilters.length
    ? await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.businessId, businessId), or(...customerFilters)))
    : [];
  const customerIds = customers.map((c) => c.id);

  await db.transaction(async (tx) => {
    const apptFilters = [
      convIds.length ? inArray(schema.appointments.conversationId, convIds) : undefined,
      customerIds.length ? inArray(schema.appointments.customerId, customerIds) : undefined,
      state?.appointmentIds.length ? inArray(schema.appointments.id, state.appointmentIds) : undefined,
    ].filter((f): f is NonNullable<typeof f> => Boolean(f));
    if (apptFilters.length) {
      const appts = await tx.select().from(schema.appointments).where(and(eq(schema.appointments.businessId, businessId), or(...apptFilters)));
      const liveSlots = appts.filter((a) => a.status === "confirmed").map((a) => a.slotId);
      if (appts.length) await tx.delete(schema.appointments).where(inArray(schema.appointments.id, appts.map((a) => a.id)));
      if (liveSlots.length) {
        // Reopen only slots no other live booking holds.
        await tx
          .update(schema.slots)
          .set({ status: "open" })
          .where(
            and(
              inArray(schema.slots.id, liveSlots),
              eq(schema.slots.status, "booked"),
              sql`not exists (select 1 from ${schema.appointments} a where a.slot_id = ${schema.slots.id} and a.status = 'confirmed')`,
            ),
          );
      }
    }
    if (state?.blockedSlotIds.length) {
      await tx.update(schema.slots).set({ status: "open" }).where(and(inArray(schema.slots.id, state.blockedSlotIds), eq(schema.slots.status, "blocked")));
    }
    const byCustomer = customerIds.length > 0;
    const hasConv = convIds.length > 0;
    const ticketWhere = or(hasConv ? inArray(schema.tickets.conversationId, convIds) : undefined, byCustomer ? inArray(schema.tickets.customerId, customerIds) : undefined);
    const leadWhere = or(hasConv ? inArray(schema.leads.conversationId, convIds) : undefined, byCustomer ? inArray(schema.leads.customerId, customerIds) : undefined);
    const followWhere = or(hasConv ? inArray(schema.followUps.conversationId, convIds) : undefined, byCustomer ? inArray(schema.followUps.customerId, customerIds) : undefined);
    if (ticketWhere) await tx.delete(schema.tickets).where(and(eq(schema.tickets.businessId, businessId), ticketWhere));
    if (leadWhere) await tx.delete(schema.leads).where(and(eq(schema.leads.businessId, businessId), leadWhere));
    if (followWhere) await tx.delete(schema.followUps).where(and(eq(schema.followUps.businessId, businessId), followWhere));
    if (convIds.length) {
      await tx.delete(schema.escalations).where(inArray(schema.escalations.conversationId, convIds));
      await tx.delete(schema.notifications).where(inArray(schema.notifications.conversationId, convIds));
      await tx.delete(schema.events).where(inArray(schema.events.conversationId, convIds));
    }
    if (state?.extraConversationIds.length) await tx.delete(schema.conversations).where(inArray(schema.conversations.id, state.extraConversationIds));
    if (customerIds.length) await tx.delete(schema.customers).where(inArray(schema.customers.id, customerIds));
    if (conversationId) {
      await tx
        .update(schema.conversations)
        .set({ endedAt: new Date(), status: sql`case when ${schema.conversations.status} = 'active' then 'resolved' else ${schema.conversations.status} end` })
        .where(and(eq(schema.conversations.id, conversationId), isNull(schema.conversations.endedAt)));
    }
  });
}
