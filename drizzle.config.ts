import type { Config } from "drizzle-kit";
import { env } from "./src/config/env.js";

/**
 * Drizzle Kit Configuration
 * Used for database migrations, schema generation, and Drizzle Studio.
 *
 * Commands:
 *   npm run db:generate  — Generate migration files from schema changes
 *   npm run db:migrate   — Apply pending migrations to database
 *   npm run db:push      — Push schema directly (dev only)
 *   npm run db:studio    — Open Drizzle Studio GUI
 */
export default {
  // Path to your schema files
  schema: "./src/database/schema/index.ts",

  // Output directory for generated migration files
  out: "./drizzle/migrations",

  // Database dialect
  dialect: "postgresql",

  // Connection credentials
  dbCredentials: {
    url: env.DATABASE_URL,
  },

  // Print all SQL statements during migration
  verbose: true,

  // Strict mode — warns about breaking changes
  strict: true,
} satisfies Config;
