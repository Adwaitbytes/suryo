import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { suryoPool?: Pool };

// One pool per process; interactive transactions need the WebSocket driver.
// Short idle timeout: Neon drops idle WebSockets, and a pool that reuses a dead socket fails the next query.
const pool =
  globalForDb.suryoPool ?? new Pool({ connectionString: env().DATABASE_URL, max: 20, idleTimeoutMillis: 15_000, connectionTimeoutMillis: 10_000 });
if (!globalForDb.suryoPool) {
  pool.on("error", (err: Error) => {
    // An idle client died; the pool discards it and opens a fresh one on the next query.
    console.error("[db] idle client error", err.message);
  });
}
if (process.env.NODE_ENV !== "production") globalForDb.suryoPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
