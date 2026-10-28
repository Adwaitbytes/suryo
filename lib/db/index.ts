import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { suryoPool?: Pool };

// One pool per process; interactive transactions need the WebSocket driver.
const pool = globalForDb.suryoPool ?? new Pool({ connectionString: env().DATABASE_URL });
if (process.env.NODE_ENV !== "production") globalForDb.suryoPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
