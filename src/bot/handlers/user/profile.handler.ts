/**
 * @file src/bot/handlers/user/profile.handler.ts
 */
import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import { CB, EMOJI } from "../../../config/constants.js";
import { formatProfile } from "../../../utils/formatters.js";
import { addNavFooter } from "../../../utils/pagination.js";

export function registerProfileHandlers(bot: Bot<BotContext>): void {
  bot.callbackQuery(CB.USER_PROFILE, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { user, wallet, stats } = await ctx.services.user.getProfile(ctx.dbUser!.id);
    const [orderCount, totalSpend] = await Promise.all([
      ctx.services.order.getUserOrderCount(ctx.dbUser!.id),
      ctx.services.order.getUserTotalSpend(ctx.dbUser!.id),
    ]);

    const text = formatProfile(user, wallet, {
      totalOrders: orderCount,
      totalSpent: totalSpend,
      referralCount: stats.referralCount,
    });

    const kb = new InlineKeyboard()
      .text("🌐 Change Language", CB.USER_LANGUAGE)
      .row();
    addNavFooter(kb, { showBack: false });

    await ctx.editMessageText(text, { reply_markup: kb });
  });

  // Language selection
  bot.callbackQuery(CB.USER_LANGUAGE, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "🌐 Select Language / ဘာသာစကားရွေးချယ်ပါ:",
      {
        reply_markup: new InlineKeyboard()
          .text("🇲🇲 Myanmar (မြန်မာ)", "lang:my")
          .text("🇬🇧 English", "lang:en")
          .row()
          .text("◀️ Back", CB.USER_PROFILE),
      }
    );
  });

  bot.callbackQuery(/^lang:(my|en)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const lang = ctx.match[1] as "my" | "en";
    ctx.session.language = lang;
    await ctx.services.user.setLanguage(ctx.dbUser!.id, lang);
    await ctx.editMessageText(
      `${EMOJI.SUCCESS} Language changed to ${lang === "my" ? "Myanmar" : "English"}!`,
      { reply_markup: new InlineKeyboard().text(`${EMOJI.HOME} Home`, CB.NAV_HOME) }
    );
  });
}
