import { CATEGORY_LABELS, selectScenarios } from "@/lib/evals/scenarios";
import { createRun, executeRun, DEFAULT_CONCURRENCY } from "@/lib/evals/runner";

/** Usage: npx tsx --env-file=.env.local scripts/eval.ts [--only id,id] [--category x] [--concurrency n] */
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = flag("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const category = flag("category");
const concurrency = Number(flag("concurrency") ?? DEFAULT_CONCURRENCY);
const scenarios = selectScenarios({ only, category });
if (scenarios.length === 0) {
  console.error("No scenarios match those filters.");
  process.exit(1);
}

const started = Date.now();
const runId = await createRun(scenarios.length);
console.log(`Eval run ${runId}: ${scenarios.length} scenarios, concurrency ${concurrency}\n`);
const results = await executeRun(runId, scenarios, {
  concurrency,
  onResult: (r, done) => {
    console.log(`${String(done).padStart(2)}/${scenarios.length} ${r.passed ? "PASS" : "FAIL"}  ${r.scenarioId.padEnd(26)} ${r.avgLatencyMs ?? "-"} ms`);
    for (const c of r.checks.filter((c) => !c.passed)) console.log(`       x ${c.name}: ${c.detail}`);
  },
});

const passed = results.filter((r) => r.passed).length;
console.log(`\nScorecard: ${passed} of ${results.length} passing (${Math.round((passed / results.length) * 100)}%) in ${Math.round((Date.now() - started) / 1000)}s`);
const byCat = new Map<string, { p: number; t: number }>();
for (const r of results) {
  const s = byCat.get(r.category) ?? { p: 0, t: 0 };
  s.t += 1;
  if (r.passed) s.p += 1;
  byCat.set(r.category, s);
}
for (const [cat, s] of byCat) console.log(`  ${(CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat).padEnd(14)} ${s.p}/${s.t}`);
const lat = results.map((r) => r.avgLatencyMs).filter((l): l is number => l !== null);
console.log(`  Avg turn latency ${lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : "-"} ms`);
process.exit(0);
