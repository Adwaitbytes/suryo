import { json } from "@/lib/http";
import { scorecard } from "@/lib/evals/store";

export async function GET() {
  return json(await scorecard(), { headers: { "Cache-Control": "no-store" } });
}
