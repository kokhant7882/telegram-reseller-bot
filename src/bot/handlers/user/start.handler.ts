/**
 * @file src/bot/handlers/user/start.handler.ts
 * @description /start command handler — entry point for all users.
 */

import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import { CB, EMOJI } from "../../../config/constants.js";
import { bold, divider } from "../../../utils/formatters.js";
import { formatMmk } from "../../../utils/helpers.js";

export function registerStartHandlers(bot: Bot<BotContext>): void {
  // /start command — with optional referral code
  bot.command("start", async (ctx) => {
    const payload = ctx.match; // e.g., "REF-XXXXXXXX" from deep link
    const from = ctx.from!;

    const { isNew } = await ctx.services.user.register({
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      referralCode: payload || undefined,
    });

    if (isNew) {
      await ctx.reply(
        [
          `${EMOJI.SUCCESS} ${bold("Welcome to Reseller Bot!")}`,
          divider(),
          "🛍️ Buy premium digital products",
          "💰 Manage your wallet",
          "🔗 Earn from referrals",
          "",
          "Use the menu below to get started:",
        ].join("\n"),
        { reply_markup: buildMainMenu() }
      );
    } else {
      // Returning user
      const wallet = await ctx.services.wallet.getWallet(ctx.dbUser!.id);
      await ctx.reply(
        [
          `${EMOJI.HOME} ${bold(`Welcome back, ${from.first_name}!`)}`,
          "",
          `💰 Wallet: ${bold(formatMmk(wallet?.balance ?? 0))}`,
          "",
          "What can I help you with?",
        ].join("\n"),
        { reply_markup: buildMainMenu() }
      );
    }
  });

  // Home navigation callback
  bot.callbackQuery(CB.NAV_HOME, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wallet = await ctx.services.wallet.getWallet(ctx.dbUser!.id);
    await ctx.editMessageText(
      [
        `${EMOJI.HOME} ${bold("Main Menu")}`,
        "",
        `💰 Wallet: ${bold(formatMmk(wallet?.balance ?? 0))}`,
      ].join("\n"),
      { reply_markup: buildMainMenu() }
    );
  });
}

/** Build the main menu inline keyboard */
function buildMainMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${EMOJI.USER} Profile`, CB.USER_PROFILE)
    .text(`${EMOJI.WALLET} Wallet`, CB.USER_WALLET)
    .row()
    .text("🛍️ Products", CB.USER_PRODUCTS)
    .text(`${EMOJI.PRODUCT} My Orders`, CB.USER_ORDERS)
    .row()
    .text("🎫 Redeem", CB.USER_REDEEM)
    .text("🔗 Referral", CB.USER_REFERRAL)
    .row()
    .text(`${EMOJI.BELL} Notifications`, CB.USER_NOTIFICATIONS)
    .text(`${EMOJI.LOCK} Support`, CB.USER_SUPPORT)
    .row()
    .text("🌐 Language", CB.USER_LANGUAGE)
    .text("⚙️ Settings", "user:settings");
}
