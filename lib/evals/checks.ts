import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { EvalCheck, EvalTurn, ExpectedDbState } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import type { ScenarioDef } from "./scenarios";
import type { SetupState } from "./setup";

export const LATENCY_BUDGET_MS = 8000;

export type Evidence = {
  tools: Array<{ name: string; ok: boolean; input: unknown; output: unknown }>;
  /** Tools the agent used, including retrieval that was prefetched before the model ran. */
  toolNames: Set<string>;
  passages: Array<{ title: string; text: string }>;
  appointments: Array<typeof schema.appointments.$inferSelect>;
  tickets: number;
  leads: number;
  escalations: Array<{ urgency: string; trigger: string }>;
};

type TraceMessage = { role?: string; content?: unknown };
type TracePart = { type?: string; toolName?: string; toolCallId?: string; output?: { value?: unknown } };

function passagesFrom(value: unknown): Array<{ title: string; text: string }> {
  const passages = (value as { passages?: Array<{ title?: unknown; text?: unknown }> } | null)?.passages;
  if (!Array.isArray(passages)) return [];
  return passages.filter((p) => typeof p.title === "string" && typeof p.text === "string").map((p) => ({ title: p.title as string, text: p.text as string }));
}

/** Reads what actually happened from the database, not from the agent's own claims. */
export async function gatherEvidence(conversationId: string, state: SetupState): Promise<Evidence> {
  const [tools, messages, escalations, tickets, leads] = await Promise.all([
    db.select().from(schema.toolCalls).where(eq(schema.toolCalls.conversationId, conversationId)).orderBy(asc(schema.toolCalls.createdAt)),
    db.select({ meta: schema.messages.meta }).from(schema.messages).where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.role, "agent"))),
    db.select({ urgency: schema.escalations.urgency, trigger: schema.escalations.trigger }).from(schema.escalations).where(eq(schema.escalations.conversationId, conversationId)),
    db.select({ id: schema.tickets.id }).from(schema.tickets).where(eq(schema.tickets.conversationId, conversationId)),
    db.select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.conversationId, conversationId)),
  ]);
  const toolNames = new Set(tools.filter((t) => t.ok).map((t) => t.name));
  const passages: Evidence["passages"] = [];
  for (const t of tools) if (t.name === "search_knowledge") passages.push(...passagesFrom(t.output));
  for (const m of messages) {
    for (const msg of (m.meta.trace ?? []) as TraceMessage[]) {
      if (msg.role !== "tool" || !Array.isArray(msg.content)) continue;
      for (const part of msg.content as TracePart[]) {
        if (part.toolName === "search_knowledge" && part.toolCallId?.startsWith("prefetch_")) {
          toolNames.add("search_knowledge");
          passages.push(...passagesFrom(part.output?.value));
        }
      }
    }
  }
  const apptFilters = [eq(schema.appointments.conversationId, conversationId), state.appointmentIds.length ? inArray(schema.appointments.id, state.appointmentIds) : undefined].filter(
    (f): f is NonNullable<typeof f> => Boolean(f),
  );
  const appointments = await db.select().from(schema.appointments).where(or(...apptFilters));
  const unique = new Map(passages.map((p) => [`${p.title}:${p.text.slice(0, 40)}`, p]));
  return {
    tools: tools.map((t) => ({ name: t.name, ok: t.ok, input: t.input, output: t.output })),
    toolNames,
    passages: [...unique.values()],
    appointments,
    tickets: tickets.length,
    leads: leads.length,
    escalations,
  };
}

export const fill = (text: string, vars: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);

function dbCheck(expected: ExpectedDbState, ev: Evidence, state: SetupState): EvalCheck {
  const created = ev.appointments.filter((a) => !state.appointmentIds.includes(a.id));
  const statuses = ev.appointments.map((a) => a.status).join(", ") || "none";
  switch (expected.kind) {
    case "appointment": {
      let passed = false;
      if (expected.status === "confirmed") passed = created.some((a) => a.status === "confirmed");
      else if (expected.status === "cancelled") passed = ev.appointments.some((a) => state.appointmentIds.includes(a.id) && a.status === "cancelled") && !created.some((a) => a.status === "confirmed");
      else passed = ev.appointments.some((a) => state.appointmentIds.includes(a.id) && a.status === "rescheduled") && created.some((a) => a.status === "confirmed");
      return { name: `db: appointment ${expected.status}`, passed, detail: `appointments for this conversation: ${statuses}` };
    }
    case "no_appointment":
      return { name: "db: no appointment booked", passed: !created.some((a) => a.status === "confirmed"), detail: `appointments created: ${created.length}` };
    case "ticket":
      return { name: "db: ticket opened", passed: ev.tickets > 0, detail: `${ev.tickets} ticket(s)` };
    case "lead":
      return { name: "db: lead recorded", passed: ev.leads > 0, detail: `${ev.leads} lead(s)` };
    case "escalation":
      return { name: "db: escalated to a human", passed: ev.escalations.length > 0, detail: ev.escalations.map((e) => `${e.urgency} via ${e.trigger}`).join(", ") || "no escalation" };
    case "no_escalation":
      return { name: "db: not escalated", passed: ev.escalations.length === 0, detail: ev.escalations.map((e) => `${e.urgency} via ${e.trigger}`).join(", ") || "none" };
  }
}

const alternatives = (term: string) => term.split("|").map((t) => t.trim().toLowerCase()).filter(Boolean);
const DEVANAGARI = /[ऀ-ॿ]/;

/** Every check is computed from the transcript text and database rows, never from the model's opinion. */
export function deterministicChecks(scenario: ScenarioDef, state: SetupState, ev: Evidence, transcript: EvalTurn[], errors: string[]): EvalCheck[] {
  const agentTurns = transcript.filter((t) => t.role === "agent");
  const agentText = agentTurns.map((t) => t.content).join("\n");
  const lower = agentText.toLowerCase();
  const checks: EvalCheck[] = [];

  checks.push({ name: "agent replied every turn", passed: errors.length === 0 && agentTurns.length > 0 && agentTurns.every((t) => t.content.trim()), detail: errors.length ? errors.join("; ") : `${agentTurns.length} replies` });

  for (const tool of scenario.expect.tools ?? []) {
    const options = tool.split("|");
    const hit = options.find((o) => ev.toolNames.has(o));
    checks.push({ name: `tool called: ${options.join(" or ")}`, passed: Boolean(hit), detail: hit ? `${hit} succeeded` : `called: ${[...new Set(ev.tools.map((t) => `${t.name}${t.ok ? "" : " (failed)"}`))].join(", ") || "nothing"}` });
  }
  for (const tool of scenario.expect.forbiddenTools ?? []) {
    const used = ev.tools.some((t) => t.name === tool);
    checks.push({ name: `tool not called: ${tool}`, passed: !used, detail: used ? `${tool} was called` : "not called" });
  }
  for (const expected of scenario.expect.db ?? []) checks.push(dbCheck(expected, ev, state));

  for (const raw of scenario.expect.mustMention ?? []) {
    const options = alternatives(fill(raw, state.vars));
    const hit = options.find((o) => lower.includes(o));
    checks.push({ name: `mentions ${options[0]}`, passed: Boolean(hit), detail: hit ? `found "${hit}"` : `none of: ${options.join(", ")}` });
  }
  for (const raw of scenario.expect.mustNotMention ?? []) {
    const options = alternatives(fill(raw, state.vars));
    const hit = options.find((o) => lower.includes(o));
    checks.push({ name: `does not mention ${options[0]}`, passed: !hit, detail: hit ? `found "${hit}"` : "clean" });
  }

  if (scenario.extra?.escalationUrgency) {
    const want = scenario.extra.escalationUrgency;
    const got = ev.escalations.map((e) => e.urgency);
    checks.push({ name: `escalation urgency ${want}`, passed: got.includes(want), detail: got.join(", ") || "no escalation" });
  }
  if (scenario.extra?.replyScript) {
    const want = scenario.extra.replyScript;
    const offending = agentTurns.filter((t) => (want === "devanagari" ? !DEVANAGARI.test(t.content) : DEVANAGARI.test(t.content)));
    checks.push({
      name: want === "devanagari" ? "replies in Devanagari" : "replies in Roman script",
      passed: offending.length === 0,
      detail: offending.length ? `${offending.length} of ${agentTurns.length} replies in the wrong script` : "all replies",
    });
  }

  const dashes = agentTurns.filter((t) => t.content.includes("\u2014")).length;
  checks.push({ name: "no em dash", passed: dashes === 0, detail: dashes ? `${dashes} replies contain an em dash` : "clean" });

  const latencies = agentTurns.map((t) => t.latencyMs).filter((l): l is number => typeof l === "number");
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  checks.push({ name: `avg latency under ${LATENCY_BUDGET_MS / 1000}s`, passed: latencies.length > 0 && avg <= LATENCY_BUDGET_MS, detail: `${avg} ms average over ${latencies.length} turns, max ${Math.max(0, ...latencies)} ms` });
  return checks;
}
