import { runAfter } from "@/lib/background";
import { runFollowUpMaintenance } from "@/lib/followups";

const INTERVAL_MS = 60_000;
const state = globalThis as unknown as { suryoMaintenanceAt?: number };

/**
 * Runs follow up delivery and abandonment detection at most once a minute per
 * instance, piggybacking on console traffic so the demo works without a paid cron.
 */
export function maybeRunMaintenance(): void {
  const now = Date.now();
  if (state.suryoMaintenanceAt && now - state.suryoMaintenanceAt < INTERVAL_MS) return;
  state.suryoMaintenanceAt = now;
  void runAfter(async () => {
    const result = await runFollowUpMaintenance();
    if (result.abandoned.closed || result.followUps.processed) console.info("[maintenance]", JSON.stringify(result));
  });
}
