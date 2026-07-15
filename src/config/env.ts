/**
 * @file src/config/env.ts
 * @description Environment variable validation and typed configuration.
 *
 * Uses Zod to parse and validate all environment variables at startup.
 * If any required variable is missing or invalid, the bot will fail fast
 * with a clear error message rather than crashing later with cryptic errors.
 *
 * Usage:
 *   import { env } from "@/config/env.js";
 *   console.log(env.BOT_TOKEN);
 */

import { z } from "zod";
import { config } from "dotenv";

// Load .env file in development
config();

// ─────────────────────────────────────────────────────────────────────────────
// Schema Definition
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // ── Bot ──────────────────────────────────────────────────────────────────
  BOT_TOKEN: z
    .string()
    .min(40, "BOT_TOKEN must be a valid Telegram bot token")
    .regex(/^\d+:[\w-]+$/, "BOT_TOKEN format is invalid"),

  /** Comma-separated Telegram user IDs of super admins */
  ADMIN_IDS: z
    .string()
    .transform((val) =>
      val
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map(Number)
    ),

  WEBHOOK_URL: z.string().url("WEBHOOK_URL must be a valid URL").optional(),
  WEBHOOK_SECRET: z.string().min(10).optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // ── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid PostgreSQL connection string"),

  // ── Upstash Redis ────────────────────────────────────────────────────────
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL is invalid"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),

  // ── Payments ─────────────────────────────────────────────────────────────
  KBZPAY_ACCOUNT_NUMBER: z.string().default(""),
  KBZPAY_ACCOUNT_NAME: z.string().default(""),
  KBZPAY_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  WAVEPAY_ACCOUNT_NUMBER: z.string().default(""),
  WAVEPAY_ACCOUNT_NAME: z.string().default(""),
  WAVEPAY_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  AYAPAY_ACCOUNT_NUMBER: z.string().default(""),
  AYAPAY_ACCOUNT_NAME: z.string().default(""),
  AYAPAY_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  BINANCE_API_KEY: z.string().default(""),
  BINANCE_API_SECRET: z.string().default(""),
  BINANCE_MERCHANT_ID: z.string().default(""),
  BINANCE_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  TRC20_WALLET_ADDRESS: z.string().default(""),
  TRONGRID_API_KEY: z.string().default(""),
  TRC20_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  USDT_MMK_RATE: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default("3500"),

  // ── Cloudinary ───────────────────────────────────────────────────────────
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  CLOUDINARY_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // ── Cron Security ────────────────────────────────────────────────────────
  CRON_SECRET: z.string().min(10, "CRON_SECRET must be at least 10 chars").default("change_me_in_production"),

  // ── Logging ──────────────────────────────────────────────────────────────
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // ── Bot Settings ─────────────────────────────────────────────────────────
  MIN_DEPOSIT_AMOUNT: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default("1000"),

  MAX_DEPOSIT_AMOUNT: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default("10000000"),

  REFERRAL_REWARD_AMOUNT: z
    .string()
    .transform(Number)
    .pipe(z.number().nonnegative())
    .default("500"),

  DEFAULT_LANGUAGE: z.enum(["my", "en"]).default("my"),

  SUPPORT_CHANNEL: z.string().default(""),

  RATE_LIMIT_PER_MINUTE: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default("30"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Parse & Export
// ─────────────────────────────────────────────────────────────────────────────

/** Validate environment variables and exit if invalid */
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error("❌ Invalid environment variables:\n");
  console.error(parseResult.error.format());
  process.exit(1);
}

/**
 * Typed, validated environment variables.
 * Import this instead of using `process.env` directly.
 */
export const env = parseResult.data;

/** Type for the validated environment */
export type Env = typeof env;
