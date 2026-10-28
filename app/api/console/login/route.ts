import { z } from "zod";
import { keyMatches, OPERATOR_COOKIE, parseBody } from "@/lib/console/http";
import { error, json } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ key: z.string().min(1).max(200) });
const MAX_AGE = 60 * 60 * 24 * 14;

export async function POST(req: Request) {
  if (!rateLimit(`login:${clientKey(req)}`, 10, 60_000)) return error(429, "Too many attempts, wait a minute");
  const body = await parseBody(req, bodySchema);
  if (body instanceof Response) return body;
  if (!process.env.OPERATOR_KEY) return json({ ok: true, required: false });
  if (!keyMatches(body.key)) return error(401, "That key is not right");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return json(
    { ok: true, required: true },
    { headers: { "Set-Cookie": `${OPERATOR_COOKIE}=${encodeURIComponent(body.key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}` } },
  );
}

export async function DELETE() {
  return json({ ok: true }, { headers: { "Set-Cookie": `${OPERATOR_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } });
}
