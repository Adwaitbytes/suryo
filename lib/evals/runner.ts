import { eq, sql } from "drizzle-orm";
import { loadBusiness, type BusinessBundle } from "@/lib/agent/business";
import { runTurn, startConversation } from "@/lib/agent/run";
import type { EvalCheck, EvalTurn } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import { deterministicChecks, fill, gatherEvidence } from "./checks";
import { judgeScenario } from "./judge";
import { EVAL_BUSINESS, type ScenarioDef } from "./scenarios";
import { applySetup, cleanupScenario, type SetupState } from "./setup";
import { STORE_SLUG, resetStoreState } from "@/lib/seed/store";
import { nextCustomerTurn } from "./simulator";

type Bundle = NonNullable<BusinessBundle>;

export const SCENARIO_TIMEOUT_MS = 180_000;
export const DEFAULT_CONCURRENCY = 3;

export type ScenarioResult = {
  scenarioId: string;
  category: string;
  title: string;
  passed: boolean;
  checks: EvalCheck[];
  transcript: EvalTurn[];
  judgeNotes: string;
  avgLatencyMs: number | null;
  conversationId: string | null;
};

/**
 * Plays one scenario against the real agent through runTurn, the same generator behind
 * POST /api/chat, on a conversation flagged is_eval. Setup state is created first and
 * everything the run touched is cleaned up afterwards, whatever happens in between.
 */
export async function runScenario(bundle: Bundle, scenario: ScenarioDef, index: number): Promise<ScenarioResult> {
  const startedAt = new Date();
  const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
  const transcript: EvalTurn[] = [];
  const errors: string[] = [];
  let state: SetupState | null = null;
  let conversationId: string | null = null;
  const base = { scenarioId: scenario.id, category: scenario.category, title: scenario.title };

  try {
    state = await applySetup(bundle, scenario, index);
    const conversation = await startConversation(bundle, "chat", true);
    conversationId = conversation.id;

    let message = fill(scenario.opening, state.vars);
    for (let turn = 0; turn < scenario.maxTurns; turn++) {
      if (Date.now() > deadline) {
        errors.push(`timed out after ${SCENARIO_TIMEOUT_MS / 1000}s`);
        break;
      }
      transcript.push({ role: "customer", content: message });
      let reply = "";
      const tools: string[] = [];
      let latencyMs: number | undefined;
      for await (const event of runTurn({ bundle, conversationId, channel: "chat", text: message })) {
        if (event.type === "text") reply += event.delta;
        else if (event.type === "tool" && event.status !== "start") tools.push(event.status === "error" ? `${event.name} (failed)` : event.name);
        else if (event.type === "done") latencyMs = event.latencyMs;
        else if (event.type === "error") errors.push(`turn ${turn + 1}: ${event.message}`);
      }
      transcript.push({ role: "agent", content: reply.trim(), tools, latencyMs });
      if (turn === scenario.maxTurns - 1) break;
      const next = await nextCustomerTurn(scenario, state, transcript);
      if (next.done) break;
      message = next.message;
    }

    const evidence = await gatherEvidence(conversationId, state);
    const checks = deterministicChecks(scenario, state, evidence, transcript, errors);
    const verdict = await judgeScenario(bundle, scenario, transcript, evidence);
    checks.push({ name: "judge: rubric and grounding", passed: verdict.passed, detail: verdict.notes });
    const latencies = transcript.map((t) => t.latencyMs).filter((l): l is number => typeof l === "number");
    return {
      ...base,
      passed: checks.every((c) => c.passed),
      checks,
      transcript,
      judgeNotes: verdict.notes,
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      conversationId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      passed: false,
      checks: [{ name: "scenario ran to completion", passed: false, detail: message.slice(0, 300) }],
      transcript,
      judgeNotes: "Not judged: the scenario crashed before completion.",
      avgLatencyMs: null,
      conversationId,
    };
  } finally {
    await cleanupScenario(bundle, conversationId, state, startedAt).catch((err: unknown) => {
      console.error(`[evals] cleanup failed for ${scenario.id}`, err);
    });
  }
}

export async function createRun(total: number): Promise<string> {
  const [run] = await db.insert(schema.evalRuns).values({ status: "running", total }).returning({ id: schema.evalRuns.id });
  return run.id;
}

/**
 * Runs scenarios with a small worker pool, writing each result as it lands so the
 * scorecard can show live progress. The run is marked failed only if the harness itself breaks.
 */
export async function executeRun(
  runId: string,
  scenarios: ScenarioDef[],
  opts: { concurrency?: number; onResult?: (result: ScenarioResult, done: number) => void } = {},
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  try {
    const bundles = new Map<string, Bundle>();
    for (const slug of new Set(scenarios.map((s) => s.business ?? EVAL_BUSINESS))) {
      const loaded = await loadBusiness(slug);
      if (!loaded) throw new Error(`Eval business "${slug}" is not seeded`);
      bundles.set(slug, loaded);
    }
    const queue = scenarios.map((s, i) => ({ s, i }));
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const result = await runScenario(bundles.get(item.s.business ?? EVAL_BUSINESS) as Bundle, item.s, item.i);
        const done = results.push(result);
        await db.insert(schema.evalResults).values({ runId, ...result });
        await db
          .update(schema.evalRuns)
          .set({ completed: sql`${schema.evalRuns.completed} + 1`, passed: sql`${schema.evalRuns.passed} + ${result.passed ? 1 : 0}` })
          .where(eq(schema.evalRuns.id, runId));
        opts.onResult?.(result, done);
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, scenarios.length) }, worker));
    // Store scenarios change real seeded orders; restore them so the demo store is clean again.
    if (scenarios.some((s) => s.business === STORE_SLUG)) await resetStoreState();
    const latencies = results.map((r) => r.avgLatencyMs).filter((l): l is number => l !== null);
    await db
      .update(schema.evalRuns)
      .set({
        status: "done",
        finishedAt: new Date(),
        avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      })
      .where(eq(schema.evalRuns.id, runId));
    return results;
  } catch (err) {
    await db.update(schema.evalRuns).set({ status: "failed", finishedAt: new Date() }).where(eq(schema.evalRuns.id, runId));
    throw err;
  }
}
