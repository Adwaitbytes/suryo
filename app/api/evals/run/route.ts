import { after } from "next/server";
import { z } from "zod";
import { error, isOperator, json } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createRun, executeRun } from "@/lib/evals/runner";
import { selectScenarios } from "@/lib/evals/scenarios";
import { activeRun } from "@/lib/evals/store";

export const maxDuration = 300;

/** One more worker than the CLI so a full suite fits inside the 300 second function limit. */
const API_CONCURRENCY = 4;

const bodySchema = z.object({
  only: z.array(z.string().min(1).max(60)).max(60).optional(),
  category: z.string().min(1).max(40).optional(),
});

export async function POST(req: Request) {
  if (!isOperator(req)) return error(401, "Operator access required");
  if (!rateLimit(`evals:${clientKey(req)}`, 4, 10 * 60_000)) return error(429, "Eval runs are rate limited. Try again in a few minutes.");
  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return error(400, "Invalid request");
  const running = await activeRun();
  if (running) return json({ error: "A run is already in progress", runId: running.id }, { status: 409 });
  const scenarios = selectScenarios(body.data);
  if (scenarios.length === 0) return error(400, "No scenarios match those filters");

  const runId = await createRun(scenarios.length);
  after(async () => {
    try {
      await executeRun(runId, scenarios, { concurrency: API_CONCURRENCY });
    } catch (err) {
      console.error("[evals] run failed", runId, err);
    }
  });
  return json({ runId, total: scenarios.length }, { status: 202 });
}
