import { db, schema } from "@/lib/db";
import type { ConsoleEventType } from "@/lib/contracts";

/** Appends to the event log that the operator console streams over SSE. */
export async function emit(
  type: ConsoleEventType,
  ids: { businessId: string; conversationId?: string | null },
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(schema.events).values({
    type,
    businessId: ids.businessId,
    conversationId: ids.conversationId ?? null,
    payload,
  });
}
