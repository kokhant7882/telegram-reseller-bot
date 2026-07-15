/**
 * @file src/bot/handlers/admin/dashboard.handler.ts
 * @description Admin panel — dashboard, user management, payment verification, 
 *              order delivery, product management, broadcast, coupons.
 */

import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import { EMOJI, PAGINATION } from "../../../config/constants.js";
import { isAdmin } from "../../filters/admin.filter.js";
import {
  bold, code, divider, sectionHeader, errorMsg, successMsg,
} from "../../../utils/formatters.js";
import { formatMmk, formatDate } from "../../../utils/helpers.js";
import { addNavFooter, addPaginationButtons, buildConfirmKeyboard } from "../../../utils/pagination.js";

// ─────────────────────────────────────────────────────────────────────────────
// Admin Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export function registerAdminHandlers(bot: Bot<BotContext>): void {
  // /admin command
  bot.command("admin", async (ctx, next) => {
    if (!isAdmin(ctx)) return next();
    await showAdminDashboard(ctx);
  });

  bot.callbackQuery("admin:dashboard", async (ctx) => {
    if (!isAdmin(ctx)) { await ctx.answerCallbackQuery("No access"); return; }
    await ctx.answerCallbackQuery();
    await showAdminDashboard(ctx, true);
  });

  // ── Stats Refresh ──────────────────────────────────────────────────────────
  bot.callbackQuery("admin:stats", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();

    const [userCount, todayRevenue, pendingPayments] = await Promise.all([
      ctx.services.user.getTotalCount(),
      ctx.services.order.getTodayRevenue(),
      ctx.services.wallet.getPendingCount(),
    ]);

    await ctx.editMessageText(
      [
        sectionHeader("👑", "Admin Dashboard"),
        divider(),
        sectionHeader("📊", "Today's Statistics"),
        `${bold("Users:")} ${userCount}`,
        `${bold("Today Revenue:")} ${formatMmk(todayRevenue)}`,
        `${bold("Pending Payments:")} ${pendingPayments}`,
        "",
        `Updated: ${formatDate(new Date())}`,
      ].join("\n"),
      { reply_markup: buildAdminMenu() }
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Payment Verification
  // ─────────────────────────────────────────────────────────────────────────

  bot.callbackQuery([`admin:payments`, /^admin:payments:(\d+)$/], async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();

    const pageMatch = typeof ctx.match === "object" ? ctx.match[1] : undefined;
    const page = parseInt(pageMatch ?? "1", 10);

    const result = await ctx.services.wallet.getPendingDeposits(page, PAGINATION.ADMIN_PER_PAGE);

    if (result.data.length === 0) {
      await ctx.editMessageText(
        `${EMOJI.SUCCESS} No pending payments!`,
        { reply_markup: new InlineKeyboard().text("◀️ Back", "admin:dashboard") }
      );
      return;
    }

    const kb = new InlineKeyboard();
    for (const tx of result.data) {
      kb.row({
        text: `💰 ${formatMmk(tx.amount)} — ${tx.paymentMethod.toUpperCase()} — ID: ${tx.id.slice(0, 8)}`,
        callback_data: `admin:payment:view:${tx.id}`,
      });
    }

    addPaginationButtons(kb, result, "admin:payments");
    addNavFooter(kb, { backCallbackData: "admin:dashboard" });

    await ctx.editMessageText(
      [sectionHeader("💰", "Pending Payments"), divider(), `${result.total} pending:`].join("\n"),
      { reply_markup: kb }
    );
  });

  bot.callbackQuery(/^admin:payment:view:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    const txId = ctx.match[1]!;

    // Show payment details and screenshot if available
    await ctx.editMessageText(
      [
        sectionHeader("💰", "Payment Review"),
        divider(),
        `TX ID: ${code(txId)}`,
        "",
        "Action:",
      ].join("\n"),
      {
        reply_markup: new InlineKeyboard()
          .text("✅ Approve", `admin:payment:approve:${txId}`)
          .text("❌ Reject", `admin:payment:reject:${txId}`)
          .row()
          .text("◀️ Back", "admin:payments"),
      }
    );
  });

  bot.callbackQuery(/^admin:payment:approve:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery("Approving...");
    const txId = ctx.match[1]!;

    try {
      const { transaction, wallet } = await ctx.services.wallet.approveDeposit(txId, ctx.dbUser!.id);

      // Notify user
      const userRecord = await ctx.services.user.findByInternalId?.(transaction.userId);
      if (userRecord) {
        await ctx.services.notification.notifyDepositApproved(
          userRecord.telegramId, transaction.amount, wallet.balance
        );
      }

      await ctx.editMessageText(
        successMsg("Deposit Approved!", `Amount: ${formatMmk(transaction.amount)}`)
      );
    } catch (err) {
      await ctx.editMessageText(errorMsg("Error", (err as Error).message));
    }
  });

  bot.callbackQuery(/^admin:payment:reject:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    const txId = ctx.match[1]!;

    ctx.session.step = "admin:reject:reason";
    ctx.session.temp = { ...ctx.session.temp, rejectTxId: txId };
    await ctx.reply("Enter rejection reason:");
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "admin:reject:reason") return next();
    const txId = ctx.session.temp?.["rejectTxId"] as string;
    ctx.session.step = undefined;
    ctx.session.temp = {};

    await ctx.services.wallet.rejectDeposit(txId, ctx.dbUser!.id, ctx.message.text);
    await ctx.reply(successMsg("Payment Rejected", ctx.message.text));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Order Management (Manual Delivery)
  // ─────────────────────────────────────────────────────────────────────────

  bot.callbackQuery([`admin:orders`, /^admin:orders:(\d+)$/], async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();

    const pageMatch = typeof ctx.match === "object" ? ctx.match[1] : undefined;
    const page = parseInt(pageMatch ?? "1", 10);

    const result = await ctx.services.order.getAllOrders(page, PAGINATION.ADMIN_PER_PAGE, "paid");

    if (result.data.length === 0) {
      await ctx.editMessageText(
        `${EMOJI.SUCCESS} No pending orders!`,
        { reply_markup: new InlineKeyboard().text("◀️ Back", "admin:dashboard") }
      );
      return;
    }

    const kb = new InlineKeyboard();
    for (const order of result.data) {
      kb.row({
        text: `📦 ${order.orderId} — ${order.status}`,
        callback_data: `admin:order:deliver:${order.id}`,
      });
    }

    addPaginationButtons(kb, result, "admin:orders");
    addNavFooter(kb, { backCallbackData: "admin:dashboard" });

    await ctx.editMessageText(
      [sectionHeader("📦", "Pending Orders"), `${result.total} orders to deliver:`].join("\n"),
      { reply_markup: kb }
    );
  });

  bot.callbackQuery(/^admin:order:deliver:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1]!;
    ctx.session.step = "admin:deliver:data";
    ctx.session.temp = { ...ctx.session.temp, deliverOrderId: orderId };
    await ctx.reply("Enter delivery data (license key, account credentials, etc.):\n\nMultiple lines allowed.");
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "admin:deliver:data") return next();
    const orderId = ctx.session.temp?.["deliverOrderId"] as string;
    ctx.session.step = undefined;
    ctx.session.temp = {};

    const order = await ctx.services.order.adminDeliver(orderId, ctx.message.text);
    const product = await ctx.services.product.getProductById(order.productId);
    const user = await ctx.services.user.findUserById?.(order.userId);

    if (user) {
      await ctx.services.notification.notifyOrderDelivered(
        user.telegramId, order.orderId, product?.name ?? "Product", ctx.message.text
      );
    }

    await ctx.reply(successMsg("Order Delivered!", `Order ${order.orderId} delivered.`));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Product Management
  // ─────────────────────────────────────────────────────────────────────────

  bot.callbackQuery("admin:products", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();

    const kb = new InlineKeyboard()
      .text("📂 Manage Categories", "admin:categories")
      .row()
      .text("➕ Add Product", "admin:product:add")
      .text("📋 All Products", "admin:product:list:1")
      .row()
      .text("🔑 Import Keys", "admin:keys:import")
      .row();
    addNavFooter(kb, { backCallbackData: "admin:dashboard" });

    await ctx.editMessageText(
      sectionHeader("🛍️", "Product Management"),
      { reply_markup: kb }
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // User Management
  // ─────────────────────────────────────────────────────────────────────────

  bot.callbackQuery("admin:users", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    ctx.session.step = "admin:user:search";
    await ctx.reply("Enter Telegram ID or @username to search:");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Broadcast
  // ─────────────────────────────────────────────────────────────────────────

  bot.callbackQuery("admin:broadcast", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    ctx.session.step = "admin:broadcast:message";
    await ctx.reply(
      "📢 Enter broadcast message (HTML supported):\n\n⚠️ This will be sent to ALL users!",
      { reply_markup: new InlineKeyboard().text("❌ Cancel", "admin:dashboard") }
    );
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "admin:broadcast:message") return next();
    ctx.session.step = undefined;

    const message = ctx.message.text;
    await ctx.reply(
      `Preview:\n\n${message}\n\nSend to all users?`,
      { reply_markup: buildConfirmKeyboard(`admin:broadcast:confirm:${Buffer.from(message).toString("base64").slice(0, 50)}`, "admin:dashboard") }
    );

    ctx.session.temp = { ...ctx.session.temp, broadcastMsg: message };
  });

  bot.callbackQuery(/^admin:broadcast:confirm:.*$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery("Broadcasting...");

    const message = ctx.session.temp?.["broadcastMsg"] as string ?? "";
    ctx.session.temp = {};

    const telegramIds = await ctx.services.user.getAllTelegramIds();
    await ctx.reply(`📢 Sending to ${telegramIds.length} users...`);

    const { sent, failed } = await ctx.services.notification.broadcast(telegramIds, message);
    await ctx.reply(successMsg("Broadcast Complete!", `Sent: ${sent}\nFailed: ${failed}`));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function showAdminDashboard(ctx: BotContext, edit = false) {
  const [userCount, todayRevenue, pendingPayments] = await Promise.all([
    ctx.services.user.getTotalCount(),
    ctx.services.order.getTodayRevenue(),
    ctx.services.wallet.getPendingCount(),
  ]);

  const text = [
    sectionHeader("👑", "Admin Dashboard"),
    divider(),
    `${bold("Total Users:")} ${userCount}`,
    `${bold("Today Revenue:")} ${formatMmk(todayRevenue)}`,
    `${bold("Pending Payments:")} ${pendingPayments}`,
  ].join("\n");

  if (edit) {
    await ctx.editMessageText(text, { reply_markup: buildAdminMenu() });
  } else {
    await ctx.reply(text, { reply_markup: buildAdminMenu() });
  }
}

function buildAdminMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("💰 Payments", "admin:payments")
    .text("📦 Orders", "admin:orders")
    .row()
    .text("👥 Users", "admin:users")
    .text("🛍️ Products", "admin:products")
    .row()
    .text("📢 Broadcast", "admin:broadcast")
    .text("🎫 Coupons", "admin:coupons")
    .row()
    .text("🏪 Resellers", "admin:resellers")
    .text("📊 Stats", "admin:stats")
    .row()
    .text("⚙️ Settings", "admin:settings");
}
