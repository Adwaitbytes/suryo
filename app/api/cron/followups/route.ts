import { isOperator, error, json } from "@/lib/http";
import { runFollowUpMaintenance } from "@/lib/followups";

export const maxDuration = 60;

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; operators can trigger it from the console. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return isOperator(req);
}

async function run(req: Request) {
  if (!authorized(req)) return error(401, "Unauthorized");
  const started = Date.now();
  try {
    const result = await runFollowUpMaintenance();
    return json({ ok: true, ms: Date.now() - started, ...result });
  } catch (err) {
    console.error("[cron:followups]", err);
    return error(500, "Follow up run failed");
  }
}

export const GET = run;
export const POST = run;
