import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { getAnalytics, type Analytics } from "@/lib/analytics";
import type { ConsoleEventType } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import { maskEmailAddress, maskPhone } from "./mask";
import type {
  ActivityItem,
  BookingRow,
  BusinessOption,
  ConsoleEvent,
  ConversationDetail,
  CustomerDetail,
  CustomerRow,
  EscalationQueue,
  FollowUpRow,
  LeadRow,
  LiveConversation,
  OrdersResponse,
  QueueEscalation,
  Snapshot,
  TicketRow,
  TimelineItem,
  Urgency,
} from "./types";

const { conversations: c, customers: cu, escalations: e, events: ev, messages: m } = schema;

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

/** Rows tied to evaluation traffic never reach the console. Rows without a conversation are real. */
const notEvalConversation = (conversationId: SQL | AnyColumn) =>
  sql`not exists (select 1 from conversations ce where ce.id = ${conversationId} and ce.is_eval)`;

const URGENCY_RANK: Record<Urgency, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/* ------------------------------------------------------------------ */
/* Businesses                                                          */
/* ------------------------------------------------------------------ */

export async function listBusinesses(): Promise<BusinessOption[]> {
  const rows = await db
    .select({ id: schema.businesses.id, slug: schema.businesses.slug, name: schema.businesses.name, kind: schema.businesses.kind, isDemo: schema.businesses.isDemo, persona: schema.businesses.persona })
    .from(schema.businesses)
    .orderBy(desc(schema.businesses.isDemo), asc(schema.businesses.createdAt));
  return rows.map(({ persona, ...b }) => ({ ...b, agentName: persona.agentName }));
}

/** Accepts either a business id or slug. */
export async function resolveBusiness(idOrSlug: string): Promise<BusinessOption | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const row = await db.query.businesses.findFirst({
    where: isUuid ? eq(schema.businesses.id, idOrSlug) : eq(schema.businesses.slug, idOrSlug),
    columns: { id: true, slug: true, name: true, kind: true, isDemo: true, persona: true },
  });
  if (!row) return null;
  const { persona, ...business } = row;
  return { ...business, agentName: persona.agentName };
}

/* ------------------------------------------------------------------ */
/* Live conversations                                                  */
/* ------------------------------------------------------------------ */

async function selectConversations(where: SQL | undefined, limit: number) {
  const rows = await db
    .select({
      conversation: c,
      customerName: cu.name,
      customerPhone: cu.phone,
      messageCount: sql<number>`(select count(*)::int from messages mc where mc.conversation_id = ${c.id})`,
      lastRole: sql<string | null>`(select ml.role from messages ml where ml.conversation_id = ${c.id} and ml.role <> 'system' order by ml.created_at desc limit 1)`,
      lastContent: sql<string | null>`(select left(ml.content, 160) from messages ml where ml.conversation_id = ${c.id} and ml.role <> 'system' order by ml.created_at desc limit 1)`,
    })
    .from(c)
    .leftJoin(cu, eq(cu.id, c.customerId))
    .where(where)
    .orderBy(desc(c.lastActivityAt))
    .limit(limit);

  const ids = rows.map((r) => r.conversation.id);
  const openEscalations = ids.length
    ? await db
        .select({ id: e.id, conversationId: e.conversationId, urgency: e.urgency, status: e.status })
        .from(e)
        .where(and(inArray(e.conversationId, ids), ne(e.status, "resolved")))
    : [];
  const escalationByConversation = new Map(openEscalations.map((x) => [x.conversationId, x]));

  return rows.map(({ conversation: conv, customerName, customerPhone, messageCount, lastRole, lastContent }) => {
    const esc = escalationByConversation.get(conv.id);
    const live: LiveConversation = {
      id: conv.id,
      channel: conv.channel,
      status: conv.status,
      stage: conv.stage,
      language: conv.language,
      intent: conv.intent,
      sentiment: conv.sentiment,
      customerId: conv.customerId,
      customerName,
      customerPhone: maskPhone(customerPhone),
      headline: conv.summary?.headline ?? null,
      messageCount,
      lastMessage: lastRole && lastContent ? { role: lastRole, content: lastContent } : null,
      escalation: esc ? { id: esc.id, urgency: esc.urgency, status: esc.status } : null,
      startedAt: iso(conv.startedAt),
      lastActivityAt: iso(conv.lastActivityAt),
      endedAt: isoOrNull(conv.endedAt),
    };
    return { live, conversation: conv };
  });
}

/** Everything still open, plus whatever finished in the last 24 hours. */
export async function listLiveConversations(businessId: string): Promise<LiveConversation[]> {
  const rows = await selectConversations(
    and(
      eq(c.businessId, businessId),
      eq(c.isEval, false),
      or(inArray(c.status, ["active", "escalated", "human"]), gt(c.lastActivityAt, sql`now() - interval '24 hours'`)),
    ),
    60,
  );
  return rows.map((r) => r.live);
}

export async function getConversationDetail(conversationId: string): Promise<ConversationDetail | null> {
  const [row] = await selectConversations(and(eq(c.id, conversationId), eq(c.isEval, false)), 1);
  if (!row) return null;
  const conv = row.conversation;
  const [customer, messages, tools, escalation] = await Promise.all([
    conv.customerId ? db.query.customers.findFirst({ where: eq(cu.id, conv.customerId) }) : Promise.resolve(undefined),
    db.select().from(m).where(eq(m.conversationId, conversationId)).orderBy(asc(m.createdAt)),
    db.select().from(schema.toolCalls).where(eq(schema.toolCalls.conversationId, conversationId)).orderBy(asc(schema.toolCalls.createdAt)),
    selectEscalations(eq(e.conversationId, conversationId), 1),
  ]);
  return {
    conversation: { ...row.live, summary: conv.summary, resolvedByAi: conv.resolvedByAi },
    customer: customer
      ? { id: customer.id, name: customer.name, phone: maskPhone(customer.phone), email: maskEmailAddress(customer.email), language: customer.language }
      : null,
    messages: messages.map((msg) => {
      // Model traces and tool memory are internal replay state, not something an operator needs.
      const meta = { ...msg.meta };
      delete meta.trace;
      delete meta.memory;
      return { id: msg.id, role: msg.role, content: msg.content, meta, createdAt: iso(msg.createdAt) };
    }),
    toolCalls: tools.map((t) => ({ id: t.id, name: t.name, ok: t.ok, durationMs: t.durationMs, input: t.input, createdAt: iso(t.createdAt) })),
    escalation: escalation[0] ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Escalations                                                         */
/* ------------------------------------------------------------------ */

async function selectEscalations(where: SQL | undefined, limit: number): Promise<QueueEscalation[]> {
  const rows = await db
    .select({ escalation: e, channel: c.channel, conversationStatus: c.status, customerName: cu.name, customerPhone: cu.phone })
    .from(e)
    .innerJoin(c, and(eq(c.id, e.conversationId), eq(c.isEval, false)))
    .leftJoin(cu, eq(cu.id, c.customerId))
    .where(where)
    .orderBy(desc(e.createdAt))
    .limit(limit);
  return rows.map(({ escalation: x, channel, conversationStatus, customerName, customerPhone }) => ({
    id: x.id,
    conversationId: x.conversationId,
    reason: x.reason,
    trigger: x.trigger,
    urgency: x.urgency,
    summary: x.summary,
    status: x.status,
    claimedBy: x.claimedBy,
    createdAt: iso(x.createdAt),
    resolvedAt: isoOrNull(x.resolvedAt),
    channel,
    conversationStatus,
    customerName,
    customerPhone: maskPhone(customerPhone),
  }));
}

/** Most urgent first; within the same urgency, whoever has waited longest. */
export function sortByUrgency(items: QueueEscalation[]): QueueEscalation[] {
  return [...items].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.createdAt.localeCompare(b.createdAt));
}

export async function getEscalationQueue(businessId: string): Promise<EscalationQueue> {
  const [open, resolved] = await Promise.all([
    selectEscalations(and(eq(e.businessId, businessId), ne(e.status, "resolved")), 100),
    selectEscalations(and(eq(e.businessId, businessId), eq(e.status, "resolved"), gt(e.resolvedAt, sql`now() - interval '7 days'`)), 30),
  ]);
  return { open: sortByUrgency(open), resolved };
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export async function latestEventId(businessId: string): Promise<number> {
  const [row] = await db.select({ id: sql<number | null>`max(${ev.id})` }).from(ev).where(eq(ev.businessId, businessId));
  return Number(row?.id ?? 0);
}

/**
 * New events after the cursor. The cursor always advances past evaluation
 * events too, so a busy eval run never makes the stream rescan the same rows.
 */
export async function eventsAfter(businessId: string, cursor: number, limit = 200): Promise<{ events: ConsoleEvent[]; cursor: number }> {
  const rows = await db
    .select({ event: ev, isEval: sql<boolean>`coalesce(${c.isEval}, false)` })
    .from(ev)
    .leftJoin(c, eq(c.id, ev.conversationId))
    .where(and(eq(ev.businessId, businessId), gt(ev.id, cursor)))
    .orderBy(asc(ev.id))
    .limit(limit);
  const next = rows.length ? Number(rows[rows.length - 1].event.id) : cursor;
  return {
    cursor: next,
    events: rows
      .filter((r) => !r.isEval)
      .map(({ event }) => ({
        id: Number(event.id),
        type: event.type as ConsoleEventType,
        conversationId: event.conversationId,
        payload: event.payload,
        createdAt: iso(event.createdAt),
      })),
  };
}

export async function recentActivity(businessId: string, limit = 30): Promise<ActivityItem[]> {
  const rows = await db
    .select({ event: ev, customerName: cu.name, channel: c.channel })
    .from(ev)
    .leftJoin(c, eq(c.id, ev.conversationId))
    .leftJoin(cu, eq(cu.id, c.customerId))
    .where(and(eq(ev.businessId, businessId), sql`coalesce(${c.isEval}, false) = false`, ne(ev.type, "conversation.updated")))
    .orderBy(desc(ev.id))
    .limit(limit);
  return rows.map(({ event, customerName, channel }) => ({
    id: Number(event.id),
    type: event.type as ConsoleEventType,
    conversationId: event.conversationId,
    payload: event.payload,
    createdAt: iso(event.createdAt),
    customerName,
    channel,
  }));
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

const analyticsCache = new Map<string, { at: number; value: Promise<Analytics> }>();

/** The snapshot is refetched on bursts of events; a few seconds of reuse keeps KPI queries off the hot path. */
export function cachedAnalytics(businessId: string, maxAgeMs = 4_000): Promise<Analytics> {
  const hit = analyticsCache.get(businessId);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value;
  const value = getAnalytics(businessId);
  analyticsCache.set(businessId, { at: Date.now(), value });
  value.catch(() => analyticsCache.delete(businessId));
  return value;
}

export async function getSnapshot(business: BusinessOption): Promise<Snapshot> {
  // Read the cursor first so nothing written while the snapshot is assembled can be missed by the stream.
  const lastEventId = await latestEventId(business.id);
  const [conversations, queue, activity, analytics] = await Promise.all([
    listLiveConversations(business.id),
    selectEscalations(and(eq(e.businessId, business.id), ne(e.status, "resolved")), 100),
    recentActivity(business.id),
    cachedAnalytics(business.id),
  ]);
  return {
    business,
    conversations,
    escalations: sortByUrgency(queue),
    activity,
    analytics,
    lastEventId,
    serverTime: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* CRM                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Single-table selects render columns unqualified, which a correlated subquery
 * would resolve against its own table; the outer customer id is always written out.
 */
const customerRef = sql.raw(`"customers"."id"`);

/** Customers who only ever appeared in evaluation conversations are hidden. */
const realCustomer = sql`not (
  exists (select 1 from conversations x where x.customer_id = ${customerRef} and x.is_eval)
  and not exists (select 1 from conversations y where y.customer_id = ${customerRef} and not y.is_eval)
)`;

export async function listCustomers(businessId: string, query?: string): Promise<CustomerRow[]> {
  const q = query?.trim();
  const digits = q?.replace(/\D/g, "") ?? "";
  const search = q
    ? or(
        ilike(cu.name, `%${q}%`),
        ilike(cu.email, `%${q}%`),
        digits.length >= 3 ? sql`regexp_replace(coalesce(${cu.phone}, ''), '[^0-9]', '', 'g') like ${`%${digits}%`}` : undefined,
      )
    : undefined;
  const rows = await db
    .select({
      customer: cu,
      conversations: sql<number>`(select count(*)::int from conversations x where x.customer_id = ${customerRef} and not x.is_eval)`,
      appointments: sql<number>`(select count(*)::int from appointments a where a.customer_id = ${customerRef} and ${notEvalConversation(sql`a.conversation_id`)})`,
      openTickets: sql<number>`(select count(*)::int from tickets t where t.customer_id = ${customerRef} and t.status <> 'resolved' and ${notEvalConversation(sql`t.conversation_id`)})`,
      lastContactAt: sql<string | null>`(select max(x.last_activity_at) from conversations x where x.customer_id = ${customerRef} and not x.is_eval)`,
    })
    .from(cu)
    .where(and(eq(cu.businessId, businessId), realCustomer, search))
    .orderBy(sql`(select max(x.last_activity_at) from conversations x where x.customer_id = ${customerRef} and not x.is_eval) desc nulls last`, desc(cu.createdAt))
    .limit(200);
  return rows.map(({ customer, conversations, appointments, openTickets, lastContactAt }) => ({
    id: customer.id,
    name: customer.name,
    phone: maskPhone(customer.phone),
    email: maskEmailAddress(customer.email),
    language: customer.language,
    conversations,
    appointments,
    openTickets,
    lastContactAt: lastContactAt ? new Date(lastContactAt).toISOString() : null,
    createdAt: iso(customer.createdAt),
  }));
}

export async function getCustomerDetail(businessId: string, customerId: string): Promise<CustomerDetail | null> {
  const customer = await db.query.customers.findFirst({ where: and(eq(cu.id, customerId), eq(cu.businessId, businessId)) });
  if (!customer) return null;
  const [convs, bookings, tickets, leads, followUps] = await Promise.all([
    db.select().from(c).where(and(eq(c.customerId, customerId), eq(c.isEval, false))).orderBy(desc(c.startedAt)),
    listBookings(businessId, { customerId }),
    listTickets(businessId, { customerId }),
    listLeads(businessId, { customerId }),
    listFollowUps(businessId, { customerId }),
  ]);
  const timeline: TimelineItem[] = [
    ...convs.map((x): TimelineItem => ({ kind: "conversation", id: x.id, at: iso(x.startedAt), channel: x.channel, status: x.status, intent: x.intent, summary: x.summary })),
    ...bookings.map((b): TimelineItem => ({ kind: "appointment", id: b.id, at: b.createdAt, startsAt: b.startsAt, status: b.status, service: b.service, staff: b.staff, priceInr: b.priceInr })),
    ...tickets.map((t): TimelineItem => ({ kind: "ticket", id: t.id, at: t.createdAt, category: t.category, priority: t.priority, status: t.status, summary: t.summary })),
    ...leads.map((l): TimelineItem => ({ kind: "lead", id: l.id, at: l.createdAt, interest: l.interest, score: l.score, status: l.status })),
    ...followUps.map((f): TimelineItem => ({ kind: "followup", id: f.id, at: f.createdAt, dueAt: f.dueAt, followUpKind: f.kind, channel: f.channel, status: f.status, subject: f.subject })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      language: customer.language,
      notes: customer.notes,
      createdAt: iso(customer.createdAt),
    },
    timeline,
  };
}

type Scope = { customerId?: string };

export async function listBookings(businessId: string, scope: Scope & { when?: "upcoming" | "past" } = {}): Promise<BookingRow[]> {
  const a = schema.appointments;
  const upcoming = scope.when === "upcoming";
  const rows = await db
    .select({
      appt: a,
      service: schema.services.name,
      staff: schema.staff.name,
      location: schema.locations.name,
      customerName: cu.name,
      customerPhone: cu.phone,
      channel: c.channel,
    })
    .from(a)
    .innerJoin(cu, eq(cu.id, a.customerId))
    .leftJoin(schema.services, eq(schema.services.id, a.serviceId))
    .leftJoin(schema.staff, eq(schema.staff.id, a.staffId))
    .leftJoin(schema.slots, eq(schema.slots.id, a.slotId))
    .leftJoin(schema.locations, eq(schema.locations.id, schema.slots.locationId))
    .leftJoin(c, eq(c.id, a.conversationId))
    .where(
      and(
        eq(a.businessId, businessId),
        or(isNull(a.conversationId), eq(c.isEval, false)),
        scope.customerId ? eq(a.customerId, scope.customerId) : undefined,
        scope.when === "upcoming" ? gte(a.startsAt, sql`now()`) : scope.when === "past" ? lt(a.startsAt, sql`now()`) : undefined,
      ),
    )
    .orderBy(upcoming ? asc(a.startsAt) : desc(a.startsAt))
    .limit(scope.customerId ? 100 : 150);
  return rows.map(({ appt, service, staff, location, customerName, customerPhone, channel }) => ({
    id: appt.id,
    status: appt.status,
    startsAt: iso(appt.startsAt),
    createdAt: iso(appt.createdAt),
    priceInr: appt.priceInr,
    service,
    staff,
    location,
    customerId: appt.customerId,
    customerName,
    customerPhone: maskPhone(customerPhone),
    conversationId: appt.conversationId,
    channel: channel ?? null,
  }));
}

export async function listTickets(businessId: string, scope: Scope = {}): Promise<TicketRow[]> {
  const t = schema.tickets;
  const rows = await db
    .select({ ticket: t, customerName: cu.name })
    .from(t)
    .leftJoin(cu, eq(cu.id, t.customerId))
    .where(and(eq(t.businessId, businessId), notEvalConversation(t.conversationId), scope.customerId ? eq(t.customerId, scope.customerId) : undefined))
    .orderBy(
      sql`case ${t.status} when 'open' then 0 when 'pending' then 1 else 2 end`,
      sql`case ${t.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
      desc(t.createdAt),
    )
    .limit(200);
  return rows.map(({ ticket, customerName }) => ({
    id: ticket.id,
    reference: `T-${ticket.id.slice(0, 6).toUpperCase()}`,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    summary: ticket.summary,
    createdAt: iso(ticket.createdAt),
    customerId: ticket.customerId,
    customerName,
    conversationId: ticket.conversationId,
  }));
}

export async function listLeads(businessId: string, scope: Scope = {}): Promise<LeadRow[]> {
  const l = schema.leads;
  const rows = await db
    .select({ lead: l, customerName: cu.name, customerPhone: cu.phone })
    .from(l)
    .leftJoin(cu, eq(cu.id, l.customerId))
    .where(and(eq(l.businessId, businessId), notEvalConversation(l.conversationId), scope.customerId ? eq(l.customerId, scope.customerId) : undefined))
    .orderBy(desc(l.score), desc(l.createdAt))
    .limit(200);
  return rows.map(({ lead, customerName, customerPhone }) => ({
    id: lead.id,
    interest: lead.interest,
    budget: lead.budget,
    timeline: lead.timeline,
    score: lead.score,
    status: lead.status,
    notes: lead.notes,
    createdAt: iso(lead.createdAt),
    customerId: lead.customerId,
    customerName,
    customerPhone: maskPhone(customerPhone),
    conversationId: lead.conversationId,
  }));
}

export async function listFollowUps(businessId: string, scope: Scope = {}): Promise<FollowUpRow[]> {
  const f = schema.followUps;
  const rows = await db
    .select({ followUp: f, customerName: cu.name, phone: cu.phone, email: cu.email })
    .from(f)
    .leftJoin(cu, eq(cu.id, f.customerId))
    .where(and(eq(f.businessId, businessId), notEvalConversation(f.conversationId), scope.customerId ? eq(f.customerId, scope.customerId) : undefined))
    .orderBy(desc(f.dueAt))
    .limit(300);
  return rows.map(({ followUp: x, customerName, phone, email }) => ({
    id: x.id,
    kind: x.kind,
    channel: x.channel,
    status: x.status,
    dueAt: iso(x.dueAt),
    sentAt: isoOrNull(x.sentAt),
    subject: x.subject,
    body: x.body,
    error: x.error,
    createdAt: iso(x.createdAt),
    customerId: x.customerId,
    customerName,
    customerContact: x.channel === "email" ? maskEmailAddress(email) : maskPhone(phone),
    conversationId: x.conversationId,
  }));
}

/* ------------------------------------------------------------------ */
/* Orders and returns (store businesses)                               */
/* ------------------------------------------------------------------ */

export async function listOrders(businessId: string): Promise<OrdersResponse> {
  const { orders: o, orderItems: oi, returns: r } = schema;
  const [orderRows, returnRows] = await Promise.all([
    db
      .select({ order: o, customerName: cu.name, customerPhone: cu.phone })
      .from(o)
      .leftJoin(cu, eq(cu.id, o.customerId))
      .where(and(eq(o.businessId, businessId), notEvalConversation(o.conversationId)))
      .orderBy(desc(o.placedAt))
      .limit(200),
    db
      .select({ ret: r, orderNumber: o.orderNumber, customerName: cu.name })
      .from(r)
      .innerJoin(o, eq(o.id, r.orderId))
      .leftJoin(cu, eq(cu.id, o.customerId))
      .where(and(eq(r.businessId, businessId), notEvalConversation(r.conversationId)))
      .orderBy(desc(r.createdAt))
      .limit(200),
  ]);
  const ids = orderRows.map((row) => row.order.id);
  const items = ids.length
    ? await db.select({ orderId: oi.orderId, name: oi.name, size: oi.size, quantity: oi.quantity }).from(oi).where(inArray(oi.orderId, ids))
    : [];
  const byOrder = new Map<string, Array<{ name: string; size: string | null; quantity: number }>>();
  for (const { orderId, ...item } of items) byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), item]);
  return {
    orders: orderRows.map(({ order, customerName, customerPhone }) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalInr: order.totalInr,
      paymentMethod: order.paymentMethod,
      placedAt: iso(order.placedAt),
      expectedDelivery: isoOrNull(order.expectedDelivery),
      deliveredAt: isoOrNull(order.deliveredAt),
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      customerId: order.customerId,
      customerName,
      customerPhone: maskPhone(customerPhone),
      items: byOrder.get(order.id) ?? [],
      conversationId: order.conversationId,
    })),
    returns: returnRows.map(({ ret, orderNumber, customerName }) => ({
      id: ret.id,
      orderNumber,
      type: ret.type,
      status: ret.status,
      reason: ret.reason,
      exchangeSize: ret.exchangeSize,
      refundInr: ret.refundInr,
      pickupDate: isoOrNull(ret.pickupDate),
      createdAt: iso(ret.createdAt),
      customerName,
      conversationId: ret.conversationId,
    })),
  };
}
