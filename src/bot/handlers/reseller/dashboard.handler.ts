/**
 * @file src/bot/handlers/reseller/dashboard.handler.ts
 * @description Reseller panel handlers.
 */

import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import { isReseller } from "../../filters/admin.filter.js";
import { EMOJI, PAGINATION, CB } from "../../../config/constants.js";
import { bold, divider, sectionHeader } from "../../../utils/formatters.js";
import { formatMmk } from "../../../utils/helpers.js";
import { addNavFooter, addPaginationButtons } from "../../../utils/pagination.js";

export function registerResellerHandlers(bot: Bot<BotContext>): void {
  // /reseller command
  bot.command("reseller", async (ctx, next) => {
    if (!isReseller(ctx)) return next();
    await showResellerDashboard(ctx);
  });

  bot.callbackQuery("reseller:dashboard", async (ctx) => {
    if (!isReseller(ctx)) { await ctx.answerCallbackQuery("No access"); return; }
    await ctx.answerCallbackQuery();
    await showResellerDashboard(ctx, true);
  });

  // ── Reseller Sales (Sell at wholesale price) ───────────────────────────────
  bot.callbackQuery("reseller:sell", async (ctx) => {
    if (!isReseller(ctx)) return;
    await ctx.answerCallbackQuery();

    // Same product browser but with wholesale prices
    // Override session to mark as reseller purchase
    ctx.session.temp = { ...ctx.session.temp, asReseller: true };

    const categories = await ctx.services.product.getActiveCategories();
    const kb = new InlineKeyboard();
    for (let i = 0; i < categories.length; i += 2) {
      const row = categories.slice(i, i + 2);
      kb.row(...row.map((c: typeof categories[number]) => ({
        text: `${c.icon} ${c.name}`,
        callback_data: `${CB.PROD_CAT}:${c.id}:1`,
      })) as [ReturnType<typeof row.map>[0], ...ReturnType<typeof row.map>]);
    }
    addNavFooter(kb, { backCallbackData: "reseller:dashboard" });

    await ctx.editMessageText(
      [sectionHeader("🛍️", "Sell Products"), divider(), "Select category (Wholesale Prices):"].join("\n"),
      { reply_markup: kb }
    );
  });

  // ── Reseller Orders ────────────────────────────────────────────────────────
  bot.callbackQuery([`reseller:orders`, /^reseller:orders:(\d+)$/], async (ctx) => {
    if (!isReseller(ctx)) return;
    await ctx.answerCallbackQuery();

    const pageMatch = typeof ctx.match === "object" ? ctx.match[1] : undefined;
    const page = parseInt(pageMatch ?? "1", 10);

    const reseller = await ctx.services.user.getResellerRecord?.(ctx.dbUser!.id);
    if (!reseller) return;

    const result = await ctx.services.order.getResellerOrders(reseller.id, page, PAGINATION.ORDERS_PER_PAGE);

    const kb = new InlineKeyboard();
    for (const order of result.data) {
      kb.row({ text: `${order.orderId} — ${order.status}`, callback_data: `order:view:${order.id}` });
    }
    addPaginationButtons(kb, result, "reseller:orders");
    addNavFooter(kb, { backCallbackData: "reseller:dashboard" });

    await ctx.editMessageText(
      [sectionHeader("📦", "My Sales"), `${result.total} orders:`].join("\n"),
      { reply_markup: kb }
    );
  });

  // ── Reseller Wallet ────────────────────────────────────────────────────────
  bot.callbackQuery("reseller:wallet", async (ctx) => {
    if (!isReseller(ctx)) return;
    await ctx.answerCallbackQuery();
    // Reuse wallet handler
    ctx.callbackQuery.data = CB.USER_WALLET;
    await ctx.editMessageText("Redirecting...");
  });
}

async function showResellerDashboard(ctx: BotContext, edit = false) {
  const wallet = await ctx.services.wallet.getWallet(ctx.dbUser!.id);

  const text = [
    sectionHeader("🏪", "Reseller Dashboard"),
    divider(),
    `${bold("Wallet:")} ${formatMmk(wallet?.balance ?? 0)}`,
    "",
    "Sell products at wholesale prices and earn the margin!",
  ].join("\n");

  const kb = new InlineKeyboard()
    .text("🛍️ Sell Products", "reseller:sell")
    .text("📦 My Orders", "reseller:orders")
    .row()
    .text(`${EMOJI.WALLET} Wallet`, CB.USER_WALLET)
    .text("📊 Reports", "reseller:reports")
    .row()
    .text("👥 My Customers", "reseller:customers")
    .text("🔗 My Referral", CB.USER_REFERRAL)
    .row()
    .text(`${EMOJI.HOME} Home`, CB.NAV_HOME);

  if (edit) {
    await ctx.editMessageText(text, { reply_markup: kb });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}
