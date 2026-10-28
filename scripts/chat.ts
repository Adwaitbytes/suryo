import { loadBusiness } from "@/lib/agent/business";
import { runTurn, startConversation } from "@/lib/agent/run";

/** Usage: tsx scripts/chat.ts <business-slug> "message one" "message two" ... */
const [slug = "kesar", ...turns] = process.argv.slice(2);
const bundle = await loadBusiness(slug);
if (!bundle) throw new Error(`No business ${slug}`);
const conversation = await startConversation(bundle, "chat", true);
for (const text of turns) {
  console.log(`\n> ${text}`);
  let line = "";
  for await (const ev of runTurn({ bundle, conversationId: conversation.id, channel: "chat", text })) {
    if (ev.type === "text") line += ev.delta;
    else if (ev.type === "tool" && ev.status !== "start") console.log(`  [${ev.name} ${ev.status}]`);
    else if (ev.type === "card") console.log(`  [card ${ev.card.kind}]`);
    else if (ev.type === "done") console.log(`${line}\n  (latency ${ev.latencyMs} ms, first token ${ev.firstTokenMs} ms)`);
    else if (ev.type === "handoff") console.log(`  [handoff ${ev.reason}]`);
    else if (ev.type === "error") console.log(`  [error ${ev.message}]`);
  }
}
process.exit(0);
