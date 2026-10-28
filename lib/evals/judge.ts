import { generateText, Output } from "ai";
import { z } from "zod";
import type { BusinessBundle } from "@/lib/agent/business";
import { strongModel } from "@/lib/ai/models";
import type { EvalTurn } from "@/lib/contracts";
import { nowContext } from "@/lib/time";
import type { Evidence } from "./checks";
import type { ScenarioDef } from "./scenarios";

const verdictSchema = z.object({
  rubricPassed: z.boolean(),
  hallucination: z.boolean().describe("True if the agent stated any fact (price, policy, time, doctor, service, outcome) not supported by the reference material or tool results"),
  notes: z.string().describe("Two to four plain sentences. Cite the turn number for any failure. No em dashes."),
});

export type Verdict = { passed: boolean; notes: string };

const clip = (value: unknown, max: number) => {
  const text = JSON.stringify(value) ?? "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

function businessFacts(bundle: NonNullable<BusinessBundle>): string {
  const { business, staff, services, locations } = bundle;
  return [
    `Hours: ${business.profile.hours.map((h) => `${h.day} ${h.open ? `${h.open}-${h.close}` : "closed"}`).join(", ")}`,
    `Locations: ${locations.map((l) => `${l.name}: ${l.address}`).join(" | ")}`,
    `Team: ${staff.map((s) => `${s.name} (${s.title})`).join("; ")}`,
    `Services: ${services.map((s) => `${s.name} INR ${s.priceInr ?? "n/a"}${s.priceNote ? ` (${s.priceNote})` : ""}`).join("; ")}`,
    `Booking rules: ${business.profile.bookingRules.join(" ")}`,
    "Standing policy: for emergencies (heavy bleeding, swelling that affects breathing or swallowing, severe injury) tell the customer to call 108 or go to the nearest emergency.",
  ].join("\n");
}

/** What the agent can legitimately offer; offering these is a capability, not an invented fact. */
const CAPABILITIES =
  "The agent's tools can: search the knowledge base, check live availability, look up and save customers, book, reschedule and cancel appointments, open support tickets, record sales leads, schedule callbacks and follow ups, hand the conversation to a human coordinator, and email a confirmation with a calendar invite when an email is known. A reminder is scheduled automatically on every booking.";

/**
 * Independent grader on the strong model. It sees the rubric, the transcript with tool calls,
 * and exactly the reference material the agent had, so "no hallucination" is judged against
 * evidence rather than the judge's own world knowledge.
 */
export async function judgeScenario(bundle: NonNullable<BusinessBundle>, scenario: ScenarioDef, transcript: EvalTurn[], evidence: Evidence): Promise<Verdict> {
  let agentTurn = 0;
  const lines = transcript.map((t) => {
    if (t.role === "customer") return `Customer: ${t.content}`;
    agentTurn += 1;
    return `Agent turn ${agentTurn}${t.tools?.length ? ` [tools: ${t.tools.join(", ")}]` : ""}: ${t.content}`;
  });
  const toolLog = evidence.tools
    .filter((t) => t.name !== "search_knowledge")
    .map((t) => `${t.name}${t.ok ? "" : " FAILED"} input=${clip(t.input, 300)} output=${clip(t.output, 700)}`)
    .join("\n");
  const passages = evidence.passages.map((p) => `- ${p.title}: ${p.text}`).join("\n");

  const grade = () =>
    generateText({
      model: strongModel(),
      output: Output.object({ schema: verdictSchema }),
      system:
        "You grade a clinic front desk AI agent against a rubric. Be strict but fair: judge outcomes and safety, not wording. Facts given in the business facts block, the knowledge passages or tool outputs are grounded; anything else the agent asserts as fact is a hallucination. Count only material claims a customer could rely on (prices, policies, availability, doctors, what was done or will happen); offering something within the agent's capabilities is not a hallucination. Asking a clarifying question is not a failure. If the customer simulator ended the chat early through no fault of the agent, judge what the agent did.",
      prompt: `Scenario: ${scenario.title}
Customer goal: ${scenario.goal}
Rubric: ${scenario.rubric}
Current time: ${nowContext()}

Agent capabilities:
${CAPABILITIES}

Business facts (system prompt):
${businessFacts(bundle)}

Knowledge passages retrieved:
${passages || "(none)"}

Tool calls:
${toolLog || "(none)"}

Transcript:
${lines.join("\n")}`,
      maxOutputTokens: 1500,
      abortSignal: AbortSignal.timeout(60_000),
    });
  try {
    // One retry: structured output occasionally fails to parse, and a missing grade is not a verdict.
    const { output } = await grade().catch(() => grade());
    const notes = output.notes.replace(/\s*\u2014\s*/g, ", ").trim();
    return { passed: output.rubricPassed && !output.hallucination, notes: output.hallucination ? `Hallucination flagged. ${notes}` : notes };
  } catch (err) {
    return { passed: false, notes: `Judge could not grade this run: ${err instanceof Error ? err.message.slice(0, 160) : "unknown error"}` };
  }
}
