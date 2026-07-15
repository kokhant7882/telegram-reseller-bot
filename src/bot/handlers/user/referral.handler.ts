/**
 * @file src/bot/handlers/user/referral.handler.ts
 */
import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import { CB, EMOJI } from "../../../config/constants.js";
import { bold, divider, sectionHeader } from "../../../utils/formatters.js";
import { formatMmk } from "../../../utils/helpers.js";
import { env } from "../../../config/env.js";

export function registerReferralHandlers(bot: Bot<BotContext>): void {
  bot.callbackQuery(CB.USER_REFERRAL, async (ctx) => {
    await ctx.answerCallbackQuery();
    const stats = await ctx.services.user.getReferralStats(ctx.dbUser!.id);
    const botUsername = (await ctx.api.getMe()).username;
    const referralLink = `https://t.me/${botUsername}?start=${stats.referralCode}`;

    await ctx.editMessageText(
      [
        sectionHeader("🔗", "Referral System"),
        divider(),
        `Your Code: ${bold(stats.referralCode)}`,
        `Referral Link:`,
        referralLink,
        "",
        sectionHeader("📊", "Your Stats"),
        `Total Referred: ${bold(`${stats.count} people`)}`,
        `Total Earned: ${bold(formatMmk(stats.earned))}`,
        "",
        `💡 Earn ${bold(formatMmk(env.REFERRAL_REWARD_AMOUNT))} for each person you invite!`,
      ].join("\n"),
      {
        reply_markup: new InlineKeyboard()
          .url("📤 Share Link", `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=Join+this+bot!`)
          .row()
          .text(`${EMOJI.HOME} Home`, CB.NAV_HOME),
      }
    );
  });
}
