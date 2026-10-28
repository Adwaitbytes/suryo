import { and, desc, eq, lt } from "drizzle-orm";
import type { EvalCheck, EvalTurn } from "@/lib/contracts";
import { db, schema } from "@/lib/db";
import { CATEGORY_LABELS, SCENARIOS } from "./scenarios";

/** A run left "running" this long was killed with its process (deploy, crash, timeout). */
const STALE_MS = 15 * 60_000;

export type RunSummary = {
  id: string;
  status: "running" | "done" | "failed";
  total: number;
  passed: number;
  completed: number;
  avgLatencyMs: number | null;
  startedAt: string;
  finishedAt: string | null;
};

export type ResultRow = {
  id: string;
  scenarioId: string;
  category: string;
  title: string;
  passed: boolean;
  checks: EvalCheck[];
  transcript: EvalTurn[];
  judgeNotes: string | null;
  avgLatencyMs: number | null;
  conversationId: string | null;
};

export type CategoryStat = { category: string; label: string; passed: number; total: number };

export type RunDetail = { run: RunSummary; results: ResultRow[]; categories: CategoryStat[] };

async function expireStaleRuns(): Promise<void> {
  await db
    .update(schema.evalRuns)
    .set({ status: "failed", finishedAt: new Date() })
    .where(and(eq(schema.evalRuns.status, "running"), lt(schema.evalRuns.startedAt, new Date(Date.now() - STALE_MS))));
}

const toSummary = (r: typeof schema.evalRuns.$inferSelect): RunSummary => ({
  id: r.id,
  status: r.status,
  total: r.total,
  passed: r.passed,
  completed: r.completed,
  avgLatencyMs: r.avgLatencyMs,
  startedAt: r.startedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
});

export async function listRuns(limit = 12): Promise<RunSummary[]> {
  await expireStaleRuns();
  const rows = await db.select().from(schema.evalRuns).orderBy(desc(schema.evalRuns.startedAt)).limit(limit);
  return rows.map(toSummary);
}

export async function activeRun(): Promise<RunSummary | null> {
  await expireStaleRuns();
  const row = await db.query.evalRuns.findFirst({ where: eq(schema.evalRuns.status, "running"), orderBy: desc(schema.evalRuns.startedAt) });
  return row ? toSummary(row) : null;
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  const run = await db.query.evalRuns.findFirst({ where: eq(schema.evalRuns.id, runId) });
  if (!run) return null;
  const rows = await db.select().from(schema.evalResults).where(eq(schema.evalResults.runId, runId));
  const order = new Map(SCENARIOS.map((s, i) => [s.id, i]));
  const results: ResultRow[] = rows
    .sort((a, b) => (order.get(a.scenarioId) ?? 999) - (order.get(b.scenarioId) ?? 999))
    .map((r) => ({
      id: r.id,
      scenarioId: r.scenarioId,
      category: r.category,
      title: r.title,
      passed: r.passed,
      checks: r.checks,
      transcript: r.transcript,
      judgeNotes: r.judgeNotes,
      avgLatencyMs: r.avgLatencyMs,
      conversationId: r.conversationId,
    }));
  const stats = new Map<string, CategoryStat>();
  for (const r of results) {
    const stat = stats.get(r.category) ?? { category: r.category, label: CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] ?? r.category, passed: 0, total: 0 };
    stat.total += 1;
    if (r.passed) stat.passed += 1;
    stats.set(r.category, stat);
  }
  return { run: toSummary(run), results, categories: [...stats.values()].sort((a, b) => a.passed / a.total - b.passed / b.total || b.total - a.total) };
}

export async function latestRunDetail(): Promise<RunDetail | null> {
  const [latest] = await listRuns(1);
  return latest ? getRunDetail(latest.id) : null;
}
