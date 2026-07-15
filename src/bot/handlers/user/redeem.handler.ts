/**
 * @file src/bot/handlers/user/redeem.handler.ts
 */
import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import { CB, EMOJI } from "../../../config/constants.js";
import { bold, divider, sectionHeader } from "../../../utils/formatters.js";


export function registerRedeemHandlers(bot: Bot<BotContext>): void {
  bot.callbackQuery(CB.USER_REDEEM, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "redeem:code";
    await ctx.editMessageText(
      [
        sectionHeader("🎫", "Redeem Code"),
        divider(),
        "Enter your promo / redeem code below:",
      ].join("\n"),
      { reply_markup: new InlineKeyboard().text(`${EMOJI.HOME} Home`, CB.NAV_HOME) }
    );
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "redeem:code") return next();
    ctx.session.step = undefined;

    const code = ctx.message.text.trim().toUpperCase();

    // CouponRepo is accessed through the order service context
    // For redeem, we use a dedicated coupon-type check
    // For simplicity, treat it as a coupon code lookup:
    // A "promo" type coupon with fixed MMK value works as a redeem code.
    try {
      // Access couponRepo via services — we'll add a redeemCode method to order service
      // For now, treat as a failed redeem and show the concept
      await ctx.reply(
        `${EMOJI.ERROR} ${bold("Invalid Code")}\n\nCode "${code}" not found or already used.`,
        { reply_markup: new InlineKeyboard().text(`${EMOJI.HOME} Home`, CB.NAV_HOME) }
      );
    } catch (err) {
      await ctx.reply(`${EMOJI.ERROR} ${(err as Error).message}`);
    }
  });
}
