/**
 * @file src/bot/handlers/user/support.handler.ts
 */
import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import { CB, EMOJI } from "../../../config/constants.js";
import { bold, divider, sectionHeader } from "../../../utils/formatters.js";
import { env } from "../../../config/env.js";

export function registerSupportHandlers(bot: Bot<BotContext>): void {
  bot.callbackQuery(CB.USER_SUPPORT, async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text("✉️ Send Message", "support:send")
      .row()
      .text("❓ FAQ", "support:faq")
      .row();
    if (env.SUPPORT_CHANNEL) {
      kb.url("💬 Support Channel", `https://t.me/${env.SUPPORT_CHANNEL.replace("@", "")}`).row();
    }
    kb.text(`${EMOJI.HOME} Home`, CB.NAV_HOME);

    await ctx.editMessageText(
      [sectionHeader(EMOJI.LOCK, "Support"), divider(), "How can we help?"].join("\n"),
      { reply_markup: kb }
    );
  });

  bot.callbackQuery("support:send", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "support:message";
    await ctx.reply(
      "✉️ Type your message below. It will be sent to our admin team:",
      { reply_markup: new InlineKeyboard().text("❌ Cancel", CB.USER_SUPPORT) }
    );
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "support:message") return next();
    ctx.session.step = undefined;

    // Forward message to admin
    const adminIds = env.ADMIN_IDS;
    const text = [
      `${EMOJI.LOCK} ${bold("Support Request")}`,
      divider(),
      `From: ${ctx.from?.first_name} (@${ctx.from?.username ?? "N/A"})`,
      `ID: ${ctx.from?.id}`,
      "",
      ctx.message.text,
    ].join("\n");

    for (const adminId of adminIds) {
      try {
        await ctx.api.sendMessage(adminId, text, { parse_mode: "HTML" });
      } catch { /* admin may not have started the bot */ }
    }

    await ctx.reply(`${EMOJI.SUCCESS} Message sent! We'll reply soon.`);
  });

  bot.callbackQuery("support:faq", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      [
        sectionHeader("❓", "FAQ"),
        divider(),
        bold("How to deposit?"),
        "Go to Wallet → Deposit → Select method → Upload screenshot",
        "",
        bold("How long does approval take?"),
        "Usually within 5-30 minutes during business hours.",
        "",
        bold("How to buy products?"),
        "Go to Products → Select category → Select product → Buy Now",
        "",
        bold("Contact us:"),
        env.SUPPORT_CHANNEL ? `Channel: ${env.SUPPORT_CHANNEL}` : "Use the Send Message option above",
      ].join("\n"),
      { reply_markup: new InlineKeyboard().text("◀️ Back", CB.USER_SUPPORT) }
    );
  });
}
