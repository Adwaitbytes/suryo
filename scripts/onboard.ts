import { onboardSite, type OnboardEvent } from "@/lib/onboard/pipeline";

/** Usage: npx tsx --env-file=.env.local scripts/onboard.ts <url> [url ...] */
const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("Usage: scripts/onboard.ts <url> [url ...]");
  process.exit(1);
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const summary: Array<{ url: string; result: string }> = [];

for (const url of urls) {
  console.log(`\n=== ${url}`);
  let outcome = "no result";
  await onboardSite(url, (event: OnboardEvent) => {
    if (event.type === "page") console.log(`  ${seconds(event.elapsedMs).padStart(6)}  page ${event.index}  ${event.url}`);
    else if (event.type === "step" && event.status === "done") console.log(`  ${seconds(event.elapsedMs).padStart(6)}  ${event.step.padEnd(8)} ${event.label}${event.detail ? `  (${event.detail})` : ""}`);
    else if (event.type === "error") {
      console.log(`  ${seconds(event.elapsedMs).padStart(6)}  ERROR ${event.code}: ${event.message}`);
      outcome = `failed (${event.code}) after ${seconds(event.elapsedMs)}`;
    } else if (event.type === "done") {
      const p = event.profile;
      console.log(`  name: ${p.name}  slug: ${event.business.slug}  offering: ${p.bookableOffering}`);
      console.log(`  services: ${p.services.map((s) => `${s.name}${s.price ? ` [${s.price}]` : ""}`).join("; ")}`);
      console.log(`  hours: ${p.hours.map((h) => `${h.day} ${h.open || "closed"}-${h.close}`).join(", ") || "not published"}`);
      console.log(`  persona: ${event.persona.agentName} (${event.persona.voice}): ${event.persona.greeting}`);
      console.log(`  stats: ${JSON.stringify(event.stats)}`);
      outcome = `live in ${seconds(event.totalMs)} as /${event.business.slug} (${event.stats.pages} pages, ${event.stats.chunks} chunks)`;
    }
  });
  summary.push({ url, result: outcome });
}

console.log("\nSummary");
for (const row of summary) console.log(`  ${row.url.padEnd(40)} ${row.result}`);
process.exit(0);
