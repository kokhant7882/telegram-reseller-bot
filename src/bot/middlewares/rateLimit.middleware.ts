/**
 * @file src/bot/middlewares/rateLimit.middleware.ts
 * @description Rate limiting using Upstash Redis.
 *
 * Prevents spam and flood attacks by limiting how many
 * requests a user can make per minute.
 *
 * Uses @upstash/ratelimit with sliding window algorithm.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { BotMiddleware } from "../../config/bot.config.js";
import { env } from "../../config/env.js";
import { createLogger } from "../../utils/logger.js";
import { EMOJI } from "../../config/constants.js";

const log = createLogger("rate-limit");

// ─────────────────────────────────────────────────────────────────────────────
// Redis + Rate Limiter Setup
// ─────────────────────────────────────────────────────────────────────────────

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Sliding window rate limiter.
 * Allows RATE_LIMIT_PER_MINUTE requests per user per 60 seconds.
 */
const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(env.RATE_LIMIT_PER_MINUTE, "60 s"),
  analytics: false, // Disable analytics to reduce Redis usage
  prefix: "rl:bot",
});

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rate limit middleware.
 * Blocks users who exceed RATE_LIMIT_PER_MINUTE requests/minute.
 * Admin users are exempt from rate limiting.
 */
export const rateLimitMiddleware: BotMiddleware = async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return next();

  // Exempt admins from rate limiting
  if (ctx.session.role === "admin" || ctx.session.role === "super_admin") {
    return next();
  }

  // Check rate limit
  const { success, remaining, reset } = await rateLimiter.limit(
    String(telegramId)
  );

  if (!success) {
    const resetIn = Math.ceil((reset - Date.now()) / 1000);

    log.warn({ telegramId, remaining }, "Rate limit exceeded");

    await ctx.reply(
      `${EMOJI.WARNING} Too many requests! Please wait ${resetIn} seconds.`,
      { parse_mode: "HTML" }
    );

    return; // Block further processing
  }

  return next();
};
