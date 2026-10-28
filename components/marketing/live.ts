import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { loadBusiness } from "@/lib/agent/business";
import { getAnalytics, type Analytics } from "@/lib/analytics";
import { db, schema } from "@/lib/db";
import { CLINIC_SLUG } from "@/lib/seed/clinic";

export type EvalSnapshot = { passed: number; total: number; avgLatencyMs: number | null; finishedAt: string | null };

export type LiveSnapshot = {
  businessName: string;
  agentName: string;
  analytics: Analytics | null;
  evaluation: EvalSnapshot | null;
};

/**
 * Real numbers for the demo business, read at request time. Each source fails independently
 * so a missing eval table never hides live conversation metrics, and nothing is ever invented.
 */
export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  await connection();
  const bundle = await loadBusiness(CLINIC_SLUG).catch((err: unknown) => {
    console.error("[live] loadBusiness", err);
    return null;
  });
  const [analytics, evaluation] = await Promise.all([
    bundle
      ? getAnalytics(bundle.business.id).catch((err: unknown) => {
          console.error("[live] analytics", err);
          return null;
        })
      : Promise.resolve(null),
    latestEval(),
  ]);
  return {
    businessName: bundle?.business.name ?? "Kesar Dental & Skin",
    agentName: bundle?.business.persona.agentName ?? "Riya",
    analytics,
    evaluation,
  };
}

async function latestEval(): Promise<EvalSnapshot | null> {
  try {
    const [run] = await db
      .select()
      .from(schema.evalRuns)
      .where(eq(schema.evalRuns.status, "done"))
      .orderBy(desc(schema.evalRuns.finishedAt))
      .limit(1);
    if (!run || run.total === 0) return null;
    return {
      passed: run.passed,
      total: run.total,
      avgLatencyMs: run.avgLatencyMs,
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  } catch (err) {
    console.error("[live] eval runs", err);
    return null;
  }
}
