import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit Configuration
 * Uses process.env directly to avoid needing compiled TypeScript.
 */
export default {
  schema: "./src/database/schema/*.schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "",
  },
  verbose: true,
  strict: true,
} satisfies Config;
