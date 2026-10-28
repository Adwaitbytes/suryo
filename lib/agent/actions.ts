import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import type { Card } from "@/lib/contracts";
import { emit } from "@/lib/events";
import { emailHtml, formatForEmail, sendEmail } from "@/lib/notify/email";
import { searchKnowledge, MIN_CONFIDENCE } from "@/lib/kb/search";
import { TIME_WINDOWS, addDaysIso, formatSlot, istToUtc, todayIso, type TimeWindow } from "@/lib/time";
import { loadBusiness, matchLocation, matchService, matchStaff, type BusinessBundle } from "./business";

export type ActionContext = {
  bundle: NonNullable<BusinessBundle>;
  conversationId: string;
  channel: "voice" | "chat";
  /** Background writes to await before the request ends. */
  pending?: Promise<unknown>[];
  /** Cards produced by slow side effects (email), streamed once they settle. */
  deferredCards?: Promise<Card>[];
};

export type ActionResult = {
  ok: boolean;
  /** What the model sees. Keep it compact and factual. */
  data: Record<string, unknown>;
  cards?: Card[];
  sources?: Array<{ id: string; title: string; url: string | null; score: number }>;
};

export class ActionError extends Error {}

/* ------------------------------------------------------------------ */
/* Schemas: one source of truth for chat (AI SDK) and voice (Gemini)   */
/* ------------------------------------------------------------------ */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD in Asia/Kolkata");
const confirmed = z
  .literal(true)
  .describe("Only true after you read the details back and the customer explicitly said yes");

export const actionSchemas = {
  search_knowledge: z.object({
    query: z.string().min(2).describe("The customer's question rephrased as a search query, in English"),
  }),
  check_availability: z.object({
    service: z.string().describe("Service name, for example 'Teeth cleaning and polishing'"),
    date: isoDate.describe("First day to search, YYYY-MM-DD in Asia/Kolkata"),
    days: z.number().int().min(1).max(14).default(1).describe("How many days to search from date"),
    timeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).default("any"),
    preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("24h HH:mm the customer asked for"),
    doctor: z.string().optional().describe("Staff name if the customer asked for someone specific"),
    location: z.string().optional(),
  }),
  lookup_customer: z.object({
    phone: z.string().optional(),
    email: z.string().optional(),
  }),
  upsert_customer: z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    language: z.enum(["en", "hi", "hinglish"]).optional(),
  }),
  book_appointment: z.object({
    slotId: z.string().uuid().describe("slotId returned by check_availability"),
    service: z.string(),
    customerName: z.string().min(1),
    phone: z.string().min(6),
    email: z.string().email().optional(),
    notes: z.string().optional(),
    confirmedByCustomer: confirmed,
  }),
  reschedule_appointment: z.object({
    appointmentId: z.string().uuid(),
    newSlotId: z.string().uuid(),
    confirmedByCustomer: confirmed,
  }),
  cancel_appointment: z.object({
    appointmentId: z.string().uuid(),
    reason: z.string().optional(),
    confirmedByCustomer: confirmed,
  }),
  create_ticket: z.object({
    category: z.enum(["billing", "complaint", "clinical_query", "records", "feedback", "other"]),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    summary: z.string().min(10).describe("One or two sentences a human can act on without re reading the chat"),
    confirmedByCustomer: confirmed,
  }),
  capture_lead: z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    interest: z.string().describe("What they want, in their words"),
    budget: z.string().optional(),
    timeline: z.string().optional().describe("When they want to start, for example 'this month'"),
    notes: z.string().optional(),
  }),
  send_confirmation: z.object({
    appointmentId: z.string().uuid(),
    email: z.string().email(),
  }),
  escalate_to_human: z.object({
    reason: z.string(),
    urgency: z.enum(["low", "medium", "high", "critical"]),
    trigger: z.enum(["customer_request", "emergency", "medical_advice", "billing_dispute", "frustration", "low_confidence", "repeated_misunderstanding", "other"]),
  }),
  schedule_follow_up: z.object({
    kind: z.enum(["callback", "reminder", "lead_nurture", "post_visit"]),
    inHours: z.number().min(0.1).max(24 * 14).describe("Hours from now"),
    note: z.string().describe("What the follow up should say or do"),
  }),
} as const;

export type ActionName = keyof typeof actionSchemas;
export const ACTION_NAMES = Object.keys(actionSchemas) as ActionName[];

/** Short human labels for the live tool rail in chat, call screen and console. */
export const ACTION_LABELS: Record<ActionName, string> = {
  search_knowledge: "Searching knowledge base",
  check_availability: "Checking availability",
  lookup_customer: "Looking up customer",
  upsert_customer: "Saving customer",
  book_appointment: "Booking appointment",
  reschedule_appointment: "Rescheduling",
  cancel_appointment: "Cancelling appointment",
  create_ticket: "Opening ticket",
  capture_lead: "Recording lead",
  send_confirmation: "Sending confirmation",
  escalate_to_human: "Connecting a human",
  schedule_follow_up: "Scheduling follow up",
};

export const ACTION_DESCRIPTIONS: Record<ActionName, string> = {
  search_knowledge:
    "Search the business knowledge base. Call before answering ANY factual question about services, prices, policies, hours, doctors, locations or aftercare.",
  check_availability:
    "Find real open appointment slots. Always call before offering times. Never invent slots.",
  lookup_customer: "Find a returning customer and their upcoming appointments by phone or email.",
  upsert_customer: "Create or update the customer record once you know their name and phone or email.",
  book_appointment:
    "Book a slot. Only after reading back service, doctor, day, time and location and getting an explicit yes.",
  reschedule_appointment: "Move an existing appointment to a new slot after explicit confirmation.",
  cancel_appointment: "Cancel an existing appointment after explicit confirmation.",
  create_ticket: "Open a support ticket for billing, complaints, records or anything needing staff action.",
  capture_lead: "Record a sales lead for someone interested but not booking now.",
  send_confirmation: "Re send the confirmation email with a calendar invite for an appointment.",
  escalate_to_human:
    "Hand the conversation to a human. Use for emergencies, medical advice requests, billing disputes, explicit requests for a person, frustration, or questions the knowledge base cannot answer.",
  schedule_follow_up: "Schedule a callback or follow up message so nothing is forgotten.",
};

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

export async function executeAction(
  ctx: ActionContext,
  name: ActionName,
  rawInput: unknown,
): Promise<ActionResult> {
  const started = Date.now();
  const parsed = actionSchemas[name].safeParse(rawInput);
  let result: ActionResult;
  if (!parsed.success) {
    result = {
      ok: false,
      data: { error: "invalid_input", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
    };
  } else {
    try {
      result = await handlers[name](ctx, parsed.data as never);
    } catch (err) {
      const message = err instanceof ActionError ? err.message : "internal_error";
      if (!(err instanceof ActionError)) console.error(`[action:${name}]`, err);
      result = { ok: false, data: { error: message } };
    }
  }
  const durationMs = Date.now() - started;
  // Audit writes stay off the customer's critical path; callers flush ctx.pending before finishing.
  const audit = Promise.all([
    db.insert(schema.toolCalls).values({
      conversationId: ctx.conversationId,
      name,
      input: maskPii(rawInput),
      output: result.data,
      ok: result.ok,
      durationMs,
    }),
    emit("tool.called", { businessId: ctx.bundle.business.id, conversationId: ctx.conversationId }, {
      name,
      ok: result.ok,
      durationMs,
      label: ACTION_LABELS[name],
    }),
  ]);
  if (ctx.pending) ctx.pending.push(audit);
  else await audit;
  return result;
}

type Handlers = { [K in ActionName]: (ctx: ActionContext, input: z.infer<(typeof actionSchemas)[K]>) => Promise<ActionResult> };

const handlers: Handlers = {
  async search_knowledge(ctx, { query }) {
    const { hits, confidence } = await searchKnowledge(ctx.bundle.business.id, query);
    const covered = confidence >= MIN_CONFIDENCE;
    return {
      ok: true,
      data: {
        covered,
        confidence,
        guidance: covered
          ? "Answer only from these passages."
          : "The knowledge base does not cover this. Say so honestly and offer a callback or a human.",
        passages: covered ? hits.map((h) => ({ title: h.title, text: h.content })) : [],
      },
      sources: covered ? hits.map(({ content: _c, ...ref }) => ref) : [],
    };
  },

  async check_availability(ctx, input) {
    const { bundle } = ctx;
    const service = matchService(bundle, input.service) ?? (bundle.services.length === 1 ? bundle.services[0] : null);
    if (!service) {
      return { ok: false, data: { error: "unknown_service", available: bundle.services.map((s) => s.name) } };
    }
    const doctor = input.doctor ? matchStaff(bundle, input.doctor) : null;
    const location = input.location ? matchLocation(bundle, input.location) : null;
    const eligible = bundle.staff.filter(
      (s) =>
        (!service.specialty || s.specialties.includes(service.specialty)) &&
        (!doctor || s.id === doctor.id) &&
        (!location || s.locationId === location.id),
    );
    if (eligible.length === 0) {
      return { ok: false, data: { error: "no_matching_staff", hint: "That doctor or location does not offer this service." } };
    }
    const today = todayIso();
    const fromIso = input.date < today ? today : input.date;
    const [winStart, winEnd] = TIME_WINDOWS[input.timeOfDay as TimeWindow];
    const search = async (from: string, days: number) => {
      const rows = await db
        .select()
        .from(schema.slots)
        .where(
          and(
            eq(schema.slots.businessId, bundle.business.id),
            eq(schema.slots.status, "open"),
            inArray(schema.slots.staffId, eligible.map((s) => s.id)),
            gte(schema.slots.startsAt, new Date(Math.max(istToUtc(from).getTime(), Date.now() + 30 * 60_000))),
            lte(schema.slots.startsAt, istToUtc(addDaysIso(from, days - 1), "23:59")),
          ),
        )
        .orderBy(asc(schema.slots.startsAt))
        .limit(400);
      return rows.filter((r) => {
        const hm = formatHm(r.startsAt);
        return hm >= winStart && hm < winEnd;
      });
    };
    let rows = await search(fromIso, input.days);
    let shifted = false;
    if (rows.length === 0) {
      rows = await search(addDaysIso(fromIso, input.days), 7);
      shifted = rows.length > 0;
    }
    if (input.preferredTime) {
      const target = minutes(input.preferredTime);
      rows.sort((a, b) => {
        const da = dayKey(a.startsAt).localeCompare(dayKey(b.startsAt));
        if (da !== 0) return da;
        return Math.abs(minutes(formatHm(a.startsAt)) - target) - Math.abs(minutes(formatHm(b.startsAt)) - target);
      });
    }
    const picked = spread(rows, 5);
    const staffName = (id: string) => bundle.staff.find((s) => s.id === id)?.name ?? "Team";
    const locName = (id: string | null) => bundle.locations.find((l) => l.id === id)?.name ?? null;
    const slots = picked.map((s) => ({
      slotId: s.id,
      when: formatSlot(s.startsAt),
      startsAt: s.startsAt.toISOString(),
      staff: staffName(s.staffId),
      location: locName(s.locationId),
    }));
    return {
      ok: true,
      data: {
        service: service.name,
        priceInr: service.priceInr,
        priceNote: service.priceNote,
        durationMin: service.durationMin,
        requestedDayFullyBooked: shifted,
        note: shifted ? "No open slots on the requested day(s). These are the next available." : undefined,
        slots,
      },
      cards: slots.length
        ? [{ kind: "slots", service: service.name, slots: slots.map(({ slotId, startsAt, staff, location }) => ({ slotId, startsAt, staff, location })) }]
        : undefined,
    };
  },

  async lookup_customer(ctx, { phone, email }) {
    const customer = await findCustomer(ctx.bundle.business.id, phone, email);
    if (!customer) return { ok: true, data: { found: false } };
    await linkCustomer(ctx, customer.id);
    const upcoming = await db
      .select({
        appointmentId: schema.appointments.id,
        startsAt: schema.appointments.startsAt,
        service: schema.services.name,
        staff: schema.staff.name,
      })
      .from(schema.appointments)
      .leftJoin(schema.services, eq(schema.services.id, schema.appointments.serviceId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.appointments.staffId))
      .where(
        and(
          eq(schema.appointments.customerId, customer.id),
          eq(schema.appointments.status, "confirmed"),
          gte(schema.appointments.startsAt, new Date()),
        ),
      )
      .orderBy(asc(schema.appointments.startsAt));
    const lastConversation = await db.query.conversations.findFirst({
      where: and(
        eq(schema.conversations.customerId, customer.id),
        sql`${schema.conversations.id} <> ${ctx.conversationId}`,
      ),
      orderBy: desc(schema.conversations.startedAt),
    });
    return {
      ok: true,
      data: {
        found: true,
        customerId: customer.id,
        name: customer.name,
        email: customer.email,
        hasEmail: Boolean(customer.email),
        upcoming: upcoming.map((u) => ({ ...u, when: formatSlot(u.startsAt) })),
        lastContact: lastConversation?.summary?.headline ?? null,
      },
    };
  },

  async upsert_customer(ctx, input) {
    const customer = await upsertCustomer(ctx.bundle.business.id, input);
    await linkCustomer(ctx, customer.id);
    return { ok: true, data: { customerId: customer.id, name: customer.name } };
  },

  async book_appointment(ctx, input) {
    const { bundle } = ctx;
    const service = matchService(bundle, input.service);
    const customer = await upsertCustomer(bundle.business.id, {
      name: input.customerName,
      phone: input.phone,
      email: input.email,
    });
    await linkCustomer(ctx, customer.id);
    const booked = await db.transaction(async (tx) => {
      // Conditional update is the lock: only one transaction can flip open to booked.
      const [slot] = await tx
        .update(schema.slots)
        .set({ status: "booked" })
        .where(
          and(
            eq(schema.slots.id, input.slotId),
            eq(schema.slots.businessId, bundle.business.id),
            eq(schema.slots.status, "open"),
            gte(schema.slots.startsAt, new Date()),
          ),
        )
        .returning();
      if (!slot) throw new ActionError("slot_unavailable: that slot was just taken or is not open. Check availability again.");
      const [appointment] = await tx
        .insert(schema.appointments)
        .values({
          businessId: bundle.business.id,
          customerId: customer.id,
          slotId: slot.id,
          serviceId: service?.id ?? null,
          staffId: slot.staffId,
          conversationId: ctx.conversationId,
          startsAt: slot.startsAt,
          priceInr: service?.priceInr ?? null,
          notes: input.notes ?? null,
        })
        .returning();
      return { slot, appointment };
    });
    const staffName = bundle.staff.find((s) => s.id === booked.slot.staffId)?.name ?? "Team";
    const location = bundle.locations.find((l) => l.id === booked.slot.locationId) ?? null;
    const card: Card = {
      kind: "booking",
      appointmentId: booked.appointment.id,
      service: service?.name ?? input.service,
      staff: staffName,
      startsAt: booked.slot.startsAt.toISOString(),
      location: location?.name ?? null,
      priceInr: service?.priceInr ?? null,
      status: "confirmed",
    };
    await emit("appointment.changed", { businessId: bundle.business.id, conversationId: ctx.conversationId }, { status: "confirmed", appointmentId: booked.appointment.id });
    const cards: Card[] = [card];
    const email = input.email ?? customer.email;
    const emailStatus = email ? await dispatchEmail(ctx, cards, booked.appointment.id, email, "REQUEST") : "no_email_on_file";
    await createFollowUp(ctx, {
      customerId: customer.id,
      kind: "reminder",
      channel: "email",
      dueAt: new Date(Math.max(Date.now() + 60_000, booked.slot.startsAt.getTime() - 3 * 3600_000)),
      subject: `Reminder: ${card.service} at ${formatSlot(booked.slot.startsAt)}`,
      body: `See you at ${location?.name ?? bundle.business.name} with ${staffName}. Reply or call to reschedule.`,
    });
    return {
      ok: true,
      data: {
        appointmentId: booked.appointment.id,
        when: formatSlot(booked.slot.startsAt),
        staff: staffName,
        location: location?.name ?? null,
        address: location?.address ?? null,
        confirmationEmail: emailStatus,
        reminderScheduled: true,
      },
      cards,
    };
  },

  async reschedule_appointment(ctx, { appointmentId, newSlotId }) {
    const { bundle } = ctx;
    const result = await db.transaction(async (tx) => {
      const [old] = await tx
        .select()
        .from(schema.appointments)
        .where(and(eq(schema.appointments.id, appointmentId), eq(schema.appointments.businessId, bundle.business.id), eq(schema.appointments.status, "confirmed")))
        .for("update");
      if (!old) throw new ActionError("appointment_not_found_or_not_active");
      const [slot] = await tx
        .update(schema.slots)
        .set({ status: "booked" })
        .where(and(eq(schema.slots.id, newSlotId), eq(schema.slots.businessId, bundle.business.id), eq(schema.slots.status, "open"), gte(schema.slots.startsAt, new Date())))
        .returning();
      if (!slot) throw new ActionError("slot_unavailable: check availability again.");
      await tx.update(schema.appointments).set({ status: "rescheduled" }).where(eq(schema.appointments.id, old.id));
      await tx.update(schema.slots).set({ status: "open" }).where(eq(schema.slots.id, old.slotId));
      const [next] = await tx
        .insert(schema.appointments)
        .values({
          businessId: bundle.business.id,
          customerId: old.customerId,
          slotId: slot.id,
          serviceId: old.serviceId,
          staffId: slot.staffId,
          conversationId: ctx.conversationId,
          startsAt: slot.startsAt,
          priceInr: old.priceInr,
          notes: old.notes,
        })
        .returning();
      return { old, next, slot };
    });
    await linkCustomer(ctx, result.old.customerId);
    await emit("appointment.changed", { businessId: bundle.business.id, conversationId: ctx.conversationId }, { status: "rescheduled", appointmentId: result.next.id });
    const service = bundle.services.find((s) => s.id === result.next.serviceId);
    const staffName = bundle.staff.find((s) => s.id === result.slot.staffId)?.name ?? "Team";
    const location = bundle.locations.find((l) => l.id === result.slot.locationId);
    const cards: Card[] = [
      {
        kind: "booking",
        appointmentId: result.next.id,
        service: service?.name ?? "Appointment",
        staff: staffName,
        startsAt: result.slot.startsAt.toISOString(),
        location: location?.name ?? null,
        priceInr: result.next.priceInr,
        status: "rescheduled",
      },
    ];
    const customer = await db.query.customers.findFirst({ where: eq(schema.customers.id, result.old.customerId) });
    if (customer?.email) await dispatchEmail(ctx, cards, result.next.id, customer.email, "REQUEST");
    return {
      ok: true,
      data: { appointmentId: result.next.id, when: formatSlot(result.slot.startsAt), staff: staffName, location: location?.name ?? null },
      cards,
    };
  },

  async cancel_appointment(ctx, { appointmentId, reason }) {
    const { bundle } = ctx;
    const appt = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.appointments)
        .set({ status: "cancelled", notes: reason ? `Cancelled: ${reason}` : undefined })
        .where(and(eq(schema.appointments.id, appointmentId), eq(schema.appointments.businessId, bundle.business.id), eq(schema.appointments.status, "confirmed")))
        .returning();
      if (!row) throw new ActionError("appointment_not_found_or_not_active");
      await tx.update(schema.slots).set({ status: "open" }).where(eq(schema.slots.id, row.slotId));
      return row;
    });
    await linkCustomer(ctx, appt.customerId);
    await db
      .update(schema.followUps)
      .set({ status: "cancelled" })
      .where(and(eq(schema.followUps.customerId, appt.customerId), eq(schema.followUps.kind, "reminder"), eq(schema.followUps.status, "pending")));
    await emit("appointment.changed", { businessId: bundle.business.id, conversationId: ctx.conversationId }, { status: "cancelled", appointmentId });
    const service = bundle.services.find((s) => s.id === appt.serviceId);
    const staffName = bundle.staff.find((s) => s.id === appt.staffId)?.name ?? "Team";
    const cards: Card[] = [
      { kind: "booking", appointmentId, service: service?.name ?? "Appointment", staff: staffName, startsAt: appt.startsAt.toISOString(), location: null, priceInr: appt.priceInr, status: "cancelled" },
    ];
    const customer = await db.query.customers.findFirst({ where: eq(schema.customers.id, appt.customerId) });
    if (customer?.email) await dispatchEmail(ctx, cards, appointmentId, customer.email, "CANCEL");
    const hoursAhead = (appt.startsAt.getTime() - Date.now()) / 3600_000;
    return { ok: true, data: { cancelled: true, when: formatSlot(appt.startsAt), lateCancellation: hoursAhead < 4 }, cards };
  },

  async create_ticket(ctx, input) {
    const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, ctx.conversationId) });
    const [ticket] = await db
      .insert(schema.tickets)
      .values({
        businessId: ctx.bundle.business.id,
        customerId: conversation?.customerId ?? null,
        conversationId: ctx.conversationId,
        category: input.category,
        priority: input.priority,
        summary: input.summary,
      })
      .returning();
    await emit("ticket.created", { businessId: ctx.bundle.business.id, conversationId: ctx.conversationId }, { ticketId: ticket.id, priority: ticket.priority });
    return {
      ok: true,
      data: { ticketId: ticket.id, reference: ticketRef(ticket.id), slaHours: input.priority === "urgent" ? 2 : input.priority === "high" ? 8 : 24 },
      cards: [{ kind: "ticket", ticketId: ticket.id, category: ticket.category, priority: ticket.priority, summary: ticket.summary }],
    };
  },

  async capture_lead(ctx, input) {
    if (!input.phone && !input.email) throw new ActionError("need_phone_or_email");
    const customer = await upsertCustomer(ctx.bundle.business.id, { name: input.name, phone: input.phone, email: input.email });
    await linkCustomer(ctx, customer.id);
    const score = scoreLead(input);
    const [lead] = await db
      .insert(schema.leads)
      .values({
        businessId: ctx.bundle.business.id,
        customerId: customer.id,
        conversationId: ctx.conversationId,
        interest: input.interest,
        budget: input.budget ?? null,
        timeline: input.timeline ?? null,
        score,
        notes: input.notes ?? null,
      })
      .returning();
    await emit("lead.created", { businessId: ctx.bundle.business.id, conversationId: ctx.conversationId }, { leadId: lead.id, score });
    await createFollowUp(ctx, {
      customerId: customer.id,
      kind: "lead_nurture",
      channel: input.email || customer.email ? "email" : "call",
      dueAt: new Date(Date.now() + (score >= 70 ? 2 : 24) * 3600_000),
      subject: `Following up on ${input.interest}`,
      body: `Hi ${input.name}, following up on your interest in ${input.interest}. Reply with a good time and we will set it up.`,
    });
    return {
      ok: true,
      data: { leadId: lead.id, score, followUp: score >= 70 ? "in 2 hours" : "tomorrow" },
      cards: [{ kind: "lead", leadId: lead.id, interest: lead.interest, score }],
    };
  },

  async send_confirmation(ctx, { appointmentId, email }) {
    const { card } = await sendAppointmentEmail(ctx, appointmentId, email, "REQUEST");
    if (card.kind === "email" && card.status !== "sent") {
      return { ok: false, data: { error: `email_${card.status}` }, cards: [card] };
    }
    const appt = await db.query.appointments.findFirst({ where: eq(schema.appointments.id, appointmentId) });
    if (appt) await db.update(schema.customers).set({ email }).where(and(eq(schema.customers.id, appt.customerId), sql`${schema.customers.email} is null`));
    return { ok: true, data: { sent: true, to: email }, cards: [card] };
  },

  async escalate_to_human(ctx, input) {
    const { escalateConversation } = await import("./escalation");
    const escalation = await escalateConversation(ctx, input);
    return {
      ok: true,
      data: {
        escalated: true,
        urgency: escalation.urgency,
        instruction:
          input.trigger === "emergency"
            ? "Tell them to call 108 or go to the nearest emergency now, and that a coordinator has been alerted."
            : "Tell them a coordinator has the full summary and will take over shortly, so they will not need to repeat anything.",
      },
      cards: [{ kind: "escalation", urgency: escalation.urgency, reason: escalation.reason }],
    };
  },

  async schedule_follow_up(ctx, input) {
    const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, ctx.conversationId) });
    const customer = conversation?.customerId
      ? await db.query.customers.findFirst({ where: eq(schema.customers.id, conversation.customerId) })
      : null;
    const dueAt = new Date(Date.now() + input.inHours * 3600_000);
    await createFollowUp(ctx, {
      customerId: customer?.id ?? null,
      kind: input.kind,
      channel: input.kind === "callback" || !customer?.email ? "call" : "email",
      dueAt,
      subject: input.kind === "callback" ? "Callback requested" : "Follow up",
      body: input.note,
    });
    return {
      ok: true,
      data: { scheduled: true, when: formatSlot(dueAt) },
      cards: [{ kind: "followup", dueAt: dueAt.toISOString(), kind_: input.kind }],
    };
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function findCustomer(businessId: string, phone?: string, email?: string) {
  const p = normalizePhone(phone);
  const e = email?.trim().toLowerCase() || null;
  if (!p && !e) return null;
  const conds = [p ? eq(schema.customers.phone, p) : undefined, e ? eq(schema.customers.email, e) : undefined].filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );
  return (
    (await db.query.customers.findFirst({
      where: and(eq(schema.customers.businessId, businessId), or(...conds)),
    })) ?? null
  );
}

export async function upsertCustomer(
  businessId: string,
  input: { name: string; phone?: string; email?: string; language?: string },
): Promise<typeof schema.customers.$inferSelect> {
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await findCustomer(businessId, phone ?? undefined, email ?? undefined);
    if (existing) {
      const [updated] = await db
        .update(schema.customers)
        .set({
          name: input.name || existing.name,
          phone: existing.phone ?? phone,
          email: existing.email ?? email,
          language: input.language ?? existing.language,
        })
        .where(eq(schema.customers.id, existing.id))
        .returning();
      return updated;
    }
    // Parallel tool calls can race to create the same customer; the unique index decides and we re-read.
    const [created] = await db
      .insert(schema.customers)
      .values({ businessId, name: input.name, phone, email, language: input.language ?? null })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
  }
  throw new ActionError("customer_conflict");
}

async function linkCustomer(ctx: ActionContext, customerId: string) {
  await db.update(schema.conversations).set({ customerId }).where(eq(schema.conversations.id, ctx.conversationId));
}

export function scoreLead(input: { phone?: string; email?: string; budget?: string; timeline?: string; interest: string }): number {
  let score = 30;
  if (input.phone) score += 15;
  if (input.email) score += 10;
  if (input.budget) score += 15;
  const t = (input.timeline ?? "").toLowerCase();
  if (/today|tomorrow|this week|asap|abhi|jaldi|kal|immediately/.test(t)) score += 25;
  else if (/this month|next week|2 weeks|soon/.test(t)) score += 15;
  else if (t) score += 5;
  if (input.interest.length > 20) score += 5;
  return Math.min(100, score);
}

export function ticketRef(id: string): string {
  return `T-${id.slice(0, 6).toUpperCase()}`;
}

export async function createFollowUp(
  ctx: ActionContext,
  input: {
    customerId: string | null;
    kind: "reminder" | "recovery" | "callback" | "post_visit" | "lead_nurture";
    channel: "email" | "whatsapp" | "call";
    dueAt: Date;
    subject: string;
    body: string;
  },
) {
  await db.insert(schema.followUps).values({
    businessId: ctx.bundle.business.id,
    conversationId: ctx.conversationId,
    ...input,
  });
  await emit("followup.changed", { businessId: ctx.bundle.business.id, conversationId: ctx.conversationId }, { kind: input.kind });
}

/**
 * Sends the confirmation without blocking the reply when the caller can stream
 * a late card; otherwise waits and attaches the card inline.
 */
async function dispatchEmail(
  ctx: ActionContext,
  cards: Card[],
  appointmentId: string,
  to: string,
  method: "REQUEST" | "CANCEL",
): Promise<string> {
  const sending = sendAppointmentEmail(ctx, appointmentId, to, method).then((r) => r.card);
  if (ctx.deferredCards) {
    ctx.deferredCards.push(sending);
    return "sending";
  }
  const card = await sending;
  cards.push(card);
  return card.kind === "email" ? card.status : "unknown";
}

async function sendAppointmentEmail(
  ctx: ActionContext,
  appointmentId: string,
  to: string,
  method: "REQUEST" | "CANCEL",
): Promise<{ card: Card }> {
  const { bundle } = ctx;
  const appt = await db.query.appointments.findFirst({
    where: and(eq(schema.appointments.id, appointmentId), eq(schema.appointments.businessId, bundle.business.id)),
  });
  if (!appt) throw new ActionError("appointment_not_found");
  const service = bundle.services.find((s) => s.id === appt.serviceId);
  const staff = bundle.staff.find((s) => s.id === appt.staffId);
  const slot = await db.query.slots.findFirst({ where: eq(schema.slots.id, appt.slotId) });
  const location = bundle.locations.find((l) => l.id === slot?.locationId);
  const serviceName = service?.name ?? bundle.business.profile.bookableOffering;
  const when = formatForEmail(appt.startsAt);
  const cancelled = method === "CANCEL";
  const subject = cancelled
    ? `Cancelled: ${serviceName} on ${formatSlot(appt.startsAt)}`
    : `Confirmed: ${serviceName} on ${formatSlot(appt.startsAt)}`;
  const where = location ? `${location.name}, ${location.address}` : bundle.business.name;
  const rows: Array<[string, string]> = [
    ["Service", serviceName],
    ["With", staff?.name ?? "Our team"],
    ["When", when],
    ["Where", where],
  ];
  if (appt.priceInr) rows.push(["Fee", `INR ${appt.priceInr.toLocaleString("en-IN")}`]);
  rows.push(["Reference", `A-${appt.id.slice(0, 6).toUpperCase()}`]);
  const note = cancelled
    ? "Your appointment has been cancelled. Reply to this email or call us any time to book again."
    : bundle.business.profile.bookingRules[1] ?? "Reply to this email to reschedule.";
  const result = await sendEmail({
    to,
    subject,
    fromName: bundle.business.name,
    text: `${subject}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${note}`,
    html: emailHtml({ business: bundle.business.name, heading: cancelled ? "Appointment cancelled" : "You are booked in", rows, note }),
    invite: {
      uid: `${appt.slotId}@suryo`,
      title: `${serviceName} at ${bundle.business.name}`,
      description: `${serviceName} with ${staff?.name ?? "our team"}. Reference A-${appt.id.slice(0, 6).toUpperCase()}.`,
      location: where,
      start: appt.startsAt,
      durationMin: service?.durationMin ?? 30,
      organizerName: bundle.business.name,
      method,
    },
  });
  const status = result.status;
  await db.insert(schema.notifications).values({
    businessId: bundle.business.id,
    conversationId: ctx.conversationId,
    channel: "email",
    recipient: maskEmail(to),
    subject,
    status,
    providerId: result.status === "sent" ? result.providerId : null,
    error: result.status === "failed" ? result.error : result.status === "skipped" ? result.reason : null,
  });
  await emit("notification.sent", { businessId: bundle.business.id, conversationId: ctx.conversationId }, { status, subject });
  return { card: { kind: "email", to: maskEmail(to), subject, status } };
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/** Tool inputs are logged with phone numbers and emails masked. */
export function maskPii(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([k, v]) => {
      if (typeof v !== "string") return [k, v];
      if (k === "phone") return [k, v.replace(/\d(?=\d{2})/g, "*")];
      if (k === "email") return [k, maskEmail(v)];
      return [k, v];
    }),
  );
}

function formatHm(d: Date): string {
  return formatSlotHm(d);
}
function formatSlotHm(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
function dayKey(d: Date): string {
  return todayIso(d);
}
function minutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Picks up to n slots, preferring variety across staff and times rather than five adjacent half hours. */
function spread<T extends { staffId: string; startsAt: Date }>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows;
  const out: T[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.staffId}:${dayKey(r.startsAt)}:${formatHm(r.startsAt).slice(0, 2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length === n) return out;
  }
  for (const r of rows) {
    if (out.length === n) break;
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

export { loadBusiness };
