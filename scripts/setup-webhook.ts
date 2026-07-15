#!/usr/bin/env node
/**
 * @file scripts/setup-webhook.ts
 * @description Register Telegram webhook with Vercel deployment URL.
 *
 * Run after deploying to Vercel:
 *   npx tsx scripts/setup-webhook.ts
 */

import "dotenv/config";

const BOT_TOKEN = process.env["BOT_TOKEN"]!;
const VERCEL_URL = process.env["VERCEL_URL"]!; // e.g., https://your-bot.vercel.app
const WEBHOOK_SECRET = process.env["WEBHOOK_SECRET"] ?? "";

if (!BOT_TOKEN || !VERCEL_URL) {
  console.error("❌ BOT_TOKEN and VERCEL_URL are required");
  process.exit(1);
}

const webhookUrl = `${VERCEL_URL}/api/webhook`;

async function setWebhook() {
  console.log(`📡 Setting webhook to: ${webhookUrl}`);

  const params = new URLSearchParams({
    url: webhookUrl,
    allowed_updates: JSON.stringify([
      "message",
      "callback_query",
      "inline_query",
      "my_chat_member",
    ]),
    drop_pending_updates: "true",
  });

  if (WEBHOOK_SECRET) {
    params.set("secret_token", WEBHOOK_SECRET);
    console.log("🔒 Webhook secret token configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?${params}`
  );
  const data = await response.json() as { ok: boolean; description?: string };

  if (data.ok) {
    console.log("✅ Webhook registered successfully!");
    console.log(`   URL: ${webhookUrl}`);
  } else {
    console.error("❌ Failed to set webhook:", data.description);
    process.exit(1);
  }
}

async function getWebhookInfo() {
  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
  );
  const data = await response.json() as { result: unknown };
  console.log("\n📋 Current webhook info:");
  console.log(JSON.stringify(data.result, null, 2));
}

setWebhook().then(getWebhookInfo);
