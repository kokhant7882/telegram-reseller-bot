/**
 * @file src/utils/logger.ts
 * @description Structured JSON logger using Pino.
 *
 * Pino is used because:
 *   - Extremely fast (minimal overhead in serverless)
 *   - Structured JSON output (searchable in Vercel logs)
 *   - Pretty-printing in development
 *
 * Usage:
 *   import { logger } from "@/utils/logger.js";
 *   logger.info({ userId: 123 }, "User registered");
 *   logger.error({ err }, "Failed to process payment");
 */

import pino from "pino";
import { env } from "../config/env.js";

// ─────────────────────────────────────────────────────────────────────────────
// Logger Configuration
// ─────────────────────────────────────────────────────────────────────────────

const isDev = env.NODE_ENV === "development";

/**
 * Main application logger.
 * In development: pretty-printed colored output
 * In production: JSON output for Vercel log aggregation
 */
const baseOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: env.NODE_ENV,
    service: "telegram-reseller-bot",
  },
  redact: {
    paths: [
      "BOT_TOKEN",
      "DATABASE_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "BINANCE_API_SECRET",
      "*.password",
      "*.token",
      "*.secret",
    ],
    remove: true,
  },
};

// Add pretty transport only in development
if (isDev) {
  baseOptions.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:HH:MM:ss",
      ignore: "pid,hostname",
      singleLine: false,
    },
  };
}

export const logger = pino(baseOptions);

// ─────────────────────────────────────────────────────────────────────────────
// Child Loggers (module-scoped)
// ─────────────────────────────────────────────────────────────────────────────

/** Create a child logger for a specific module */
export function createLogger(module: string) {
  return logger.child({ module });
}

/** Bot-specific logger */
export const botLogger = createLogger("bot");

/** Database logger */
export const dbLogger = createLogger("database");

/** Payment logger */
export const paymentLogger = createLogger("payment");

/** Cron logger */
export const cronLogger = createLogger("cron");
