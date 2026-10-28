import { after } from "next/server";

/**
 * Runs work after the response is sent when inside a Next.js request, so the
 * customer never waits on summaries or bookkeeping. Outside a request (scripts,
 * evals) it simply awaits.
 */
export async function runAfter(task: () => Promise<unknown>): Promise<void> {
  const guarded = () =>
    task().catch((err: unknown) => {
      console.error("[background]", err);
    });
  try {
    after(guarded);
  } catch {
    await guarded();
  }
}
