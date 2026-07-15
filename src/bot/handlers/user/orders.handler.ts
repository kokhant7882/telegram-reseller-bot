/**
 * @file src/bot/handlers/user/orders.handler.ts
 * @description Order history and management handlers.
 */

import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import { CB, EMOJI, PAGINATION, ORDER_STATUS } from "../../../config/constants.js";
import { sectionHeader, divider, formatOrder, bold } from "../../../utils/formatters.js";
import { addNavFooter, addPaginationButtons, buildConfirmKeyboard } from "../../../utils/pagination.js";

export function registerOrderHandlers(bot: Bot<BotContext>): void {
  // ── My Orders Main ─────────────────────────────────────────────────────────
  bot.callbackQuery(CB.USER_ORDERS, async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text("⏳ Active Orders", "orders:active:1")
      .row()
      .text("📋 Purchase History", "orders:history:1")
      .row();
    addNavFooter(kb, { showBack: false });
    await ctx.editMessageText(
      [sectionHeader(EMOJI.PRODUCT, "My Orders"), divider()].join("\n"),
      { reply_markup: kb }
    );
  });

  // ── Active Orders ──────────────────────────────────────────────────────────
  bot.callbackQuery(/^orders:active:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const page = parseInt(ctx.match[1]!, 10);
    const result = await ctx.services.order.getUserOrders(
      ctx.dbUser!.id, page, PAGINATION.ORDERS_PER_PAGE, ORDER_STATUS.PENDING
    );

    if (result.data.length === 0) {
      await ctx.editMessageText(
        `${EMOJI.INFO} No active orders.`,
        { reply_markup: new InlineKeyboard().text(`${EMOJI.HOME} Home`, CB.NAV_HOME) }
      );
      return;
    }

    const kb = new InlineKeyboard();
    for (const order of result.data) {
      kb.row({ text: `📦 ${order.orderId} — ${order.status}`, callback_data: `${CB.ORDER_VIEW}:${order.id}` });
    }
    addPaginationButtons(kb, result, "orders:active");
    addNavFooter(kb, { backCallbackData: CB.USER_ORDERS });

    await ctx.editMessageText(
      [sectionHeader("⏳", "Active Orders"), divider(), `${result.total} orders:`].join("\n"),
      { reply_markup: kb }
    );
  });

  // ── Purchase History ───────────────────────────────────────────────────────
  bot.callbackQuery(/^orders:history:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const page = parseInt(ctx.match[1]!, 10);
    const result = await ctx.services.order.getUserOrders(
      ctx.dbUser!.id, page, PAGINATION.ORDERS_PER_PAGE
    );

    if (result.data.length === 0) {
      await ctx.editMessageText(
        `${EMOJI.INFO} No purchase history yet.`,
        { reply_markup: new InlineKeyboard().text(`${EMOJI.HOME} Home`, CB.NAV_HOME) }
      );
      return;
    }

    const kb = new InlineKeyboard();
    for (const order of result.data) {
      kb.row({
        text: `${order.orderId} — ${order.status}`,
        callback_data: `${CB.ORDER_VIEW}:${order.id}`,
      });
    }
    addPaginationButtons(kb, result, "orders:history");
    addNavFooter(kb, { backCallbackData: CB.USER_ORDERS });

    await ctx.editMessageText(
      [sectionHeader("📋", "Purchase History"), divider()].join("\n"),
      { reply_markup: kb }
    );
  });

  // ── Order Detail ───────────────────────────────────────────────────────────
  bot.callbackQuery(/^order:view:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1]!;
    const order = await ctx.services.order.getOrderById(orderId);
    if (!order) { await ctx.answerCallbackQuery("Order not found"); return; }

    const product = await ctx.services.product.getProductById(order.productId);
    const text = formatOrder(order, product?.name ?? "Unknown Product");

    const kb = new InlineKeyboard();
    if (order.status === ORDER_STATUS.PENDING) {
      kb.row({ text: "❌ Cancel Order", callback_data: `order:cancel:${order.id}` });
    }
    addNavFooter(kb, { backCallbackData: "orders:history:1" });

    await ctx.editMessageText(text, { reply_markup: kb });
  });

  // ── Cancel Order ───────────────────────────────────────────────────────────
  bot.callbackQuery(/^order:cancel:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1]!;
    await ctx.editMessageText(
      `${EMOJI.WARNING} ${bold("Cancel this order?")} You will be refunded.`,
      { reply_markup: buildConfirmKeyboard(`order:cancel:confirm:${orderId}`, CB.USER_ORDERS) }
    );
  });

  bot.callbackQuery(/^order:cancel:confirm:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Cancelling...");
    const orderId = ctx.match[1]!;
    try {
      await ctx.services.order.cancelOrder(orderId);
      await ctx.editMessageText(`${EMOJI.SUCCESS} ${bold("Order cancelled and refunded to wallet.")}`);
    } catch (err) {
      await ctx.editMessageText(`${EMOJI.ERROR} ${(err as Error).message}`);
    }
  });
}
