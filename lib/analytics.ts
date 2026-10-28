import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type Analytics = {
  conversations: number;
  voice: number;
  chat: number;
  containmentRate: number;
  bookings: number;
  revenueBookedInr: number;
  leads: number;
  tickets: number;
  escalations: number;
  openEscalations: number;
  avgResponseMs: number | null;
  p50FirstTokenMs: number | null;
  languages: Array<{ language: string; count: number }>;
  daily: Array<{ day: string; conversations: number; bookings: number }>;
  followUpsPending: number;
  followUpsSent: number;
};

/**
 * Every number here is computed from live rows; evaluation traffic is excluded.
 * Bookings and revenue count only appointments the agent made inside a conversation.
 */
export async function getAnalytics(businessId: string, days = 14): Promise<Analytics> {
  const since = sql`now() - make_interval(days => ${days})`;
  const [totals] = (
    await db.execute<{
      conversations: number;
      voice: number;
      chat: number;
      contained: number;
      finished: number;
    }>(sql`
      select count(*)::int as conversations,
             count(*) filter (where channel = 'voice')::int as voice,
             count(*) filter (where channel = 'chat')::int as chat,
             count(*) filter (where resolved_by_ai is true)::int as contained,
             count(*) filter (where status in ('resolved','escalated','human','abandoned'))::int as finished
      from conversations where business_id = ${businessId} and not is_eval and created_at > ${since}`)
  ).rows;
  const [actions] = (
    await db.execute<{ bookings: number; revenue: number; leads: number; tickets: number; escalations: number; open_escalations: number; fu_pending: number; fu_sent: number }>(sql`
      select
        (select count(*) from appointments a join conversations c on c.id = a.conversation_id
           where a.business_id = ${businessId} and a.status in ('confirmed','completed') and a.created_at > ${since} and not c.is_eval)::int as bookings,
        (select coalesce(sum(a.price_inr), 0) from appointments a join conversations c on c.id = a.conversation_id
           where a.business_id = ${businessId} and a.status in ('confirmed','completed') and a.created_at > ${since} and not c.is_eval)::int as revenue,
        (select count(*) from leads l left join conversations c on c.id = l.conversation_id
           where l.business_id = ${businessId} and l.created_at > ${since} and coalesce(c.is_eval, false) = false)::int as leads,
        (select count(*) from tickets t left join conversations c on c.id = t.conversation_id
           where t.business_id = ${businessId} and t.created_at > ${since} and coalesce(c.is_eval, false) = false)::int as tickets,
        (select count(*) from escalations e join conversations c on c.id = e.conversation_id
           where e.business_id = ${businessId} and e.created_at > ${since} and not c.is_eval)::int as escalations,
        (select count(*) from escalations e join conversations c on c.id = e.conversation_id
           where e.business_id = ${businessId} and e.status <> 'resolved' and not c.is_eval)::int as open_escalations,
        (select count(*) from follow_ups where business_id = ${businessId} and status = 'pending')::int as fu_pending,
        (select count(*) from follow_ups where business_id = ${businessId} and status = 'sent')::int as fu_sent`)
  ).rows;
  const [latency] = (
    await db.execute<{ avg_ms: number | null; p50_first: number | null }>(sql`
      select avg((m.meta->>'latencyMs')::int)::int as avg_ms,
             percentile_cont(0.5) within group (order by (m.meta->>'firstTokenMs')::int)::int as p50_first
      from messages m join conversations c on c.id = m.conversation_id
      where c.business_id = ${businessId} and not c.is_eval and m.role = 'agent'
        and m.meta ? 'latencyMs' and m.created_at > ${since}`)
  ).rows;
  const languages = (
    await db.execute<{ language: string; count: number }>(sql`
      select language, count(*)::int as count from conversations
      where business_id = ${businessId} and not is_eval and created_at > ${since}
      group by language order by count desc`)
  ).rows;
  const daily = (
    await db.execute<{ day: string; conversations: number; bookings: number }>(sql`
      with days as (
        select generate_series((now() at time zone 'Asia/Kolkata')::date - (${days} - 1), (now() at time zone 'Asia/Kolkata')::date, interval '1 day')::date as day
      )
      select to_char(d.day, 'YYYY-MM-DD') as day,
        (select count(*) from conversations c where c.business_id = ${businessId} and not c.is_eval
           and (c.created_at at time zone 'Asia/Kolkata')::date = d.day)::int as conversations,
        (select count(*) from appointments a join conversations c on c.id = a.conversation_id
           where a.business_id = ${businessId} and a.status in ('confirmed','completed') and not c.is_eval
           and (a.created_at at time zone 'Asia/Kolkata')::date = d.day)::int as bookings
      from days d order by d.day`)
  ).rows;

  return {
    conversations: totals.conversations,
    voice: totals.voice,
    chat: totals.chat,
    containmentRate: totals.finished ? Number((totals.contained / totals.finished).toFixed(3)) : 0,
    bookings: actions.bookings,
    revenueBookedInr: actions.revenue,
    leads: actions.leads,
    tickets: actions.tickets,
    escalations: actions.escalations,
    openEscalations: actions.open_escalations,
    avgResponseMs: latency?.avg_ms ?? null,
    p50FirstTokenMs: latency?.p50_first ?? null,
    languages,
    daily,
    followUpsPending: actions.fu_pending,
    followUpsSent: actions.fu_sent,
  };
}
