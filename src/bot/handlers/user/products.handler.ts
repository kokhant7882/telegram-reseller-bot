/**
 * @file src/bot/handlers/user/products.handler.ts
 * @description Product browsing and purchase handlers.
 */

import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import { CB, EMOJI, PAGINATION } from "../../../config/constants.js";
import {
  bold, divider, sectionHeader, formatProduct, successMsg, errorMsg,
} from "../../../utils/formatters.js";
import { formatMmk } from "../../../utils/helpers.js";
import { addNavFooter, addPaginationButtons, buildConfirmKeyboard } from "../../../utils/pagination.js";

export function registerProductHandlers(bot: Bot<BotContext>): void {
  // ── Browse Categories ──────────────────────────────────────────────────────
  bot.callbackQuery(CB.USER_PRODUCTS, async (ctx) => {
    await ctx.answerCallbackQuery();
    const categories = await ctx.services.product.getActiveCategories();

    if (categories.length === 0) {
      await ctx.editMessageText(
        `${EMOJI.INFO} No products available yet.`,
        { reply_markup: new InlineKeyboard().text(`${EMOJI.HOME} Home`, CB.NAV_HOME) }
      );
      return;
    }

    const kb = new InlineKeyboard();
    for (let i = 0; i < categories.length; i += 2) {
      const row = categories.slice(i, i + 2);
      kb.row(
        ...row.map((c: typeof categories[number]) => ({
          text: `${c.icon} ${c.name}`,
          callback_data: `${CB.PROD_CAT}:${c.id}:1`,
        })) as [ReturnType<typeof row.map>[0], ...ReturnType<typeof row.map>]
      );
    }

    // Add search button
    kb.row({ text: "🔍 Search Products", callback_data: "prod:search" });
    addNavFooter(kb, { showBack: false });

    await ctx.editMessageText(
      [sectionHeader("🛍️", "Products"), divider(), "Select a category:"].join("\n"),
      { reply_markup: kb }
    );
  });

  // ── Product List in Category ───────────────────────────────────────────────
  bot.callbackQuery(/^prod:cat:(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const categoryId = ctx.match[1]!;
    const page = parseInt(ctx.match[2]!, 10);
    const isReseller = ctx.session.role === "reseller";

    const [result, category] = await Promise.all([
      ctx.services.product.getProductsByCategory(categoryId, page, PAGINATION.PRODUCTS_PER_PAGE),
      ctx.services.product.getCategoryById(categoryId),
    ]);

    if (!category) {
      await ctx.answerCallbackQuery("Category not found");
      return;
    }

    if (result.data.length === 0) {
      await ctx.editMessageText(
        `${EMOJI.INFO} No products in this category.`,
        { reply_markup: new InlineKeyboard().text("◀️ Back", CB.USER_PRODUCTS) }
      );
      return;
    }

    const kb = new InlineKeyboard();
    for (const product of result.data) {
      const price = isReseller ? product.wholesalePrice : product.price;
      const stockIcon = product.stock === 0 ? "❌" : "✅";
      kb.row({
        text: `${stockIcon} ${product.name} — ${formatMmk(price)}`,
        callback_data: `${CB.PROD_VIEW}:${product.id}`,
      });
    }

    addPaginationButtons(kb, result, `prod:cat:${categoryId}`);
    addNavFooter(kb, { backCallbackData: CB.USER_PRODUCTS });

    await ctx.editMessageText(
      [
        sectionHeader(category.icon, category.name),
        divider(),
        `${result.total} products available:`,
      ].join("\n"),
      { reply_markup: kb }
    );
  });

  // ── Product Detail ─────────────────────────────────────────────────────────
  bot.callbackQuery(/^prod:view:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const productId = ctx.match[1]!;
    const isReseller = ctx.session.role === "reseller";

    const product = await ctx.services.product.getProductById(productId);
    if (!product || !product.isActive) {
      await ctx.answerCallbackQuery("Product not available");
      return;
    }

    const category = await ctx.services.product.getCategoryById(product.categoryId);
    const text = formatProduct(product, category?.name ?? "Unknown", isReseller);

    const kb = new InlineKeyboard();
    if (product.stock !== 0) {
      kb.row({ text: "🛒 Buy Now", callback_data: `${CB.PROD_BUY}:${product.id}` });
    }
    addNavFooter(kb, { backCallbackData: `${CB.PROD_CAT}:${product.categoryId}:1` });

    if (product.imageUrl) {
      await ctx.replyWithPhoto(product.imageUrl, {
        caption: text,
        reply_markup: kb,
      });
    } else {
      await ctx.editMessageText(text, { reply_markup: kb });
    }
  });

  // ── Buy Now — Enter Quantity ───────────────────────────────────────────────
  bot.callbackQuery(/^prod:buy:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const productId = ctx.match[1]!;
    const product = await ctx.services.product.getProductById(productId);
    if (!product) return;

    ctx.session.step = "buy:quantity";
    ctx.session.temp = { ...ctx.session.temp, buyProductId: productId };

    const stockText = product.stock === -1 ? "Unlimited" : String(product.stock);
    await ctx.reply(
      [
        sectionHeader("🛒", `Buy: ${product.name}`),
        divider(),
        `Price: ${bold(formatMmk(product.price))} per unit`,
        `Stock: ${stockText}`,
        "",
        "Enter quantity:",
      ].join("\n"),
      { reply_markup: new InlineKeyboard().text("❌ Cancel", CB.USER_PRODUCTS) }
    );
  });

  // ── Handle Quantity Input → Confirm Dialog ─────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "buy:quantity") return next();

    const qty = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(qty) || qty < 1 || qty > 100) {
      await ctx.reply(errorMsg("Invalid quantity", "Enter a number between 1 and 100"));
      return;
    }

    const productId = ctx.session.temp?.["buyProductId"] as string;
    const product = await ctx.services.product.getProductById(productId);
    if (!product) return;

    const total = product.price * qty;
    const wallet = await ctx.services.wallet.getWallet(ctx.dbUser!.id);

    ctx.session.temp = { ...ctx.session.temp, buyQty: qty };
    ctx.session.step = "buy:confirm";

    await ctx.reply(
      [
        sectionHeader("🛒", "Confirm Order"),
        divider(),
        `Product: ${bold(product.name)}`,
        `Quantity: ${bold(String(qty))}`,
        `Unit Price: ${bold(formatMmk(product.price))}`,
        `Total: ${bold(formatMmk(total))}`,
        "",
        `Your Balance: ${bold(formatMmk(wallet?.balance ?? 0))}`,
        wallet && wallet.balance >= total
          ? `${EMOJI.SUCCESS} Sufficient balance`
          : `${EMOJI.ERROR} Insufficient balance — please deposit first`,
      ].join("\n"),
      {
        reply_markup: buildConfirmKeyboard(
          `buy:confirm:wallet`,
          CB.USER_PRODUCTS,
          { confirmText: "✅ Buy with Wallet", cancelText: "❌ Cancel" }
        ),
      }
    );
  });

  // ── Confirm Purchase ───────────────────────────────────────────────────────
  bot.callbackQuery("buy:confirm:wallet", async (ctx) => {
    await ctx.answerCallbackQuery("Processing...");

    const productId = ctx.session.temp?.["buyProductId"] as string;
    const qty = ctx.session.temp?.["buyQty"] as number ?? 1;

    ctx.session.step = undefined;
    ctx.session.temp = {};

    try {
      const result = await ctx.services.order.purchaseWithWallet({
        userId: ctx.dbUser!.id,
        productId,
        quantity: qty,
      });

      const product = await ctx.services.product.getProductById(productId);

      if (result.isInstant) {
        await ctx.editMessageText(
          successMsg(
            "Order Delivered! 🎉",
            [
              `Order ID: ${bold(result.order.orderId)}`,
              `Product: ${product?.name}`,
              "",
              `${bold("🎁 Your Product:")}`,
              `<pre>${result.deliveryData}</pre>`,
            ].join("\n")
          )
        );
      } else {
        await ctx.editMessageText(
          successMsg(
            "Order Placed!",
            [
              `Order ID: ${bold(result.order.orderId)}`,
              `Product: ${product?.name}`,
              "",
              `${EMOJI.LOADING} Admin will deliver shortly.`,
            ].join("\n")
          )
        );
      }
    } catch (err) {
      await ctx.editMessageText(
        errorMsg("Purchase Failed", (err as Error).message)
      );
    }
  });

  // ── Search Products ────────────────────────────────────────────────────────
  bot.callbackQuery("prod:search", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "search:query";
    await ctx.reply("🔍 Enter product name to search:");
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "search:query") return next();
    ctx.session.step = undefined;

    const result = await ctx.services.product.searchProducts(ctx.message.text, 1, PAGINATION.PRODUCTS_PER_PAGE);

    if (result.data.length === 0) {
      await ctx.reply(`${EMOJI.INFO} No products found for "${ctx.message.text}"`);
      return;
    }

    const kb = new InlineKeyboard();
    for (const p of result.data) {
      kb.row({ text: `${p.name} — ${formatMmk(p.price)}`, callback_data: `${CB.PROD_VIEW}:${p.id}` });
    }
    addNavFooter(kb, { backCallbackData: CB.USER_PRODUCTS });
    await ctx.reply(`Found ${result.total} results:`, { reply_markup: kb });
  });
}
