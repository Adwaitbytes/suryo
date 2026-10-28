import { z } from "zod";
import { failure, guard, parseBody } from "@/lib/console/http";
import { DEFAULT_OPERATOR, sendHumanReply } from "@/lib/console/operator";
import { json } from "@/lib/http";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  operator: z.string().trim().min(2).max(60).default(DEFAULT_OPERATOR),
  content: z.string().trim().min(1).max(2000),
  suggested: z.boolean().default(false),
});

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, bodySchema);
  if (body instanceof Response) return body;
  try {
    return json(await sendHumanReply(body.conversationId, body.operator, body.content, body.suggested));
  } catch (err) {
    return failure(err, "reply");
  }
}
