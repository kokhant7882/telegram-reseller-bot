/**
 * @file src/bot/middlewares/logger.middleware.ts
 * @description Request logging middleware.
 * Logs all incoming updates with user info and processing time.
 */

import type { BotMiddleware } from "../../config/bot.config.js";
import { botLogger } from "../../utils/logger.js";

export const loggerMiddleware: BotMiddleware = async (ctx, next) => {
  const start = Date.now();
  const telegramId = ctx.from?.id;

  // Determine update type from update object
  const updateType = Object.keys(ctx.update).find((k) => k !== "update_id") ?? "unknown";

  // Determine what action triggered this update
  const action =
    ctx.callbackQuery?.data ??
    (ctx.message?.text?.startsWith("/")
      ? ctx.message.text.split(" ")[0]
      : "message");

  await next();

  const duration = Date.now() - start;
  botLogger.info(
    { telegramId, updateType, action, durationMs: duration },
    "Update processed"
  );
};

