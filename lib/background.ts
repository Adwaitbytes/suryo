import { after } from "next/server";

/**
 * Runs work after the response is sent when inside a Next.js request, so the
 * customer never waits on summaries or bookkeeping. Outside a request (scripts,
 * evals) it runs without being awaited.
 */
export async function runAfter(task: () => Promise<unknown>): Promise<void> {
  const guarded = () =>
    task().catch((err: unknown) => {
      console.error("[background]", err);
    });
  try {
    after(guarded);
  } catch {
    // Outside a request (scripts, evals) the work still runs, just without blocking the caller.
    void guarded();
  }
}
