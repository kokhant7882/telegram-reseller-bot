/**
 * @file src/database/db.ts
 * @description Neon + Drizzle ORM database connection.
 *
 * Uses @neondatabase/serverless which communicates via HTTP instead of TCP.
 * This is required for Vercel serverless functions where TCP connections
 * would be closed between invocations, causing "connection terminated" errors.
 *
 * The connection is created once per serverless function invocation
 * (Vercel caches module-level variables within the same instance).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Database Connection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Neon HTTP client.
 * Uses HTTP/1.1 or HTTP/2 to communicate with Neon's serverless proxy.
 * No persistent connection required — perfect for serverless.
 */
const sql = neon(env.DATABASE_URL);

/**
 * Drizzle ORM instance with all schemas registered.
 *
 * Export and use this `db` object in all repositories.
 * Never create multiple db instances.
 *
 * @example
 *   import { db } from "@/database/db.js";
 *   const users = await db.select().from(schema.users);
 */
export const db = drizzle(sql, {
  schema,
  // Enable query logging in development
  logger: env.NODE_ENV === "development",
});

/** Type of the Drizzle ORM instance — useful for typing constructor params */
export type Database = typeof db;

/** Re-export schema for convenience */
export { schema };
