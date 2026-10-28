import { z } from "zod";
import { failure, guard, parseBody } from "@/lib/console/http";
import { DEFAULT_OPERATOR, suggestReplies } from "@/lib/console/operator";
import { json } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  operator: z.string().trim().min(2).max(60).default(DEFAULT_OPERATOR),
});

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  if (!rateLimit(`suggest:${clientKey(req)}`, 30, 60_000)) return json({ error: "Too many requests" }, { status: 429 });
  const body = await parseBody(req, bodySchema);
  if (body instanceof Response) return body;
  const started = Date.now();
  try {
    const replies = await suggestReplies(body.conversationId, body.operator);
    return json({ replies, ms: Date.now() - started });
  } catch (err) {
    return failure(err, "suggest");
  }
}
