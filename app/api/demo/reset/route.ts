import { invalidateBusiness } from "@/lib/agent/business";
import { error, isOperator, json } from "@/lib/http";
import { resetClinicState } from "@/lib/seed/reset";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isOperator(req)) return error(401, "Operator access required");
  const { ms } = await resetClinicState();
  invalidateBusiness();
  return json({ ok: true, ms });
}
