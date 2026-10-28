import { invalidateBusiness } from "@/lib/agent/business";
import { error, isOperator, json } from "@/lib/http";
import { resetClinicState } from "@/lib/seed/reset";
import { resetStoreState } from "@/lib/seed/store";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isOperator(req)) return error(401, "Operator access required");
  const started = Date.now();
  await Promise.all([resetClinicState(), resetStoreState()]);
  const ms = Date.now() - started;
  invalidateBusiness();
  return json({ ok: true, ms });
}
