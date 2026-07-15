/**
 * @file api/webhook.ts
 * @description Vercel serverless function — receives Telegram webhook updates.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildBot } from "../src/bot/bot.js";
import { createLogger } from "../src/utils/logger.js";
import type { Update } from "grammy/types";

const log = createLogger("webhook");

let botPromise: ReturnType<typeof buildBot> | null = null;

function getBot() {
  if (!botPromise) {
    botPromise = buildBot();
  }
  return botPromise;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const secretToken = process.env["WEBHOOK_SECRET"];
  if (secretToken) {
    const headerToken = req.headers["x-telegram-bot-api-secret-token"];
    if (headerToken !== secretToken) {
      log.warn("Invalid webhook secret token");
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  try {
    const bot = await getBot();
    const update = req.body as Update;

    await bot.handleUpdate(update);
    res.status(200).json({ ok: true });
  } catch (err) {
    log.error({ err }, "Webhook handler error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
