import { createHash, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { error, isOperator } from "@/lib/http";
import { OperatorError } from "./operator";
import { resolveBusiness } from "./queries";
import type { BusinessOption } from "./types";

export const OPERATOR_COOKIE = "suryo_op";

/** Console data includes customer PII, so reads are gated the same way as writes. */
export function guard(req: Request): Response | null {
  return isOperator(req) ? null : error(401, "Operator access required");
}

export function keyMatches(candidate: string): boolean {
  const key = process.env.OPERATOR_KEY;
  if (!key) return true;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(key).digest();
  return timingSafeEqual(a, b);
}

export async function businessFromQuery(req: Request): Promise<BusinessOption | Response> {
  const raw = new URL(req.url).searchParams.get("business");
  if (!raw || raw.length > 80) return error(400, "business is required");
  const business = await resolveBusiness(raw);
  return business ?? error(404, "Unknown business");
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T> | Response> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return parsed.data;
}

/** Maps expected operator failures to their status and logs anything unexpected. */
export function failure(err: unknown, scope: string): Response {
  if (err instanceof OperatorError) return error(err.status, err.message);
  console.error(`[console:${scope}]`, err);
  return error(500, "Something went wrong on our side");
}
