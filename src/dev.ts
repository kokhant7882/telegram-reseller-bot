/**
 * @file src/dev.ts
 * @description Local development entry point using long polling.
 *
 * Run with: npm run dev
 * This uses grammY's built-in polling — no webhook setup needed for local dev.
 */

import { buildBot } from "./bot/bot.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("dev");

async function main() {
  log.info("Starting bot in development mode (long polling)...");

  const bot = await buildBot();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, "Shutting down...");
    await bot.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // Start polling
  await bot.start({
    onStart: (info) => {
      log.info(
        { username: info.username, id: info.id },
        `Bot @${info.username} is running in polling mode`
      );
      console.log(`\n✅ Bot @${info.username} is running!\nPress Ctrl+C to stop.\n`);
    },
    allowed_updates: [
      "message",
      "callback_query",
      "inline_query",
      "my_chat_member",
    ],
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
