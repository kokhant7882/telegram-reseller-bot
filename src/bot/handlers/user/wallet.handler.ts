/**
 * @file src/bot/handlers/user/wallet.handler.ts
 * @description Wallet, deposit, and transaction history handlers.
 */

import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../../../config/bot.config.js";
import {
  CB,
  EMOJI,
  PAYMENT_METHOD,
  PAYMENT_METHOD_LABELS,
} from "../../../config/constants.js";
import {
  bold, divider, sectionHeader, successMsg, errorMsg,
} from "../../../utils/formatters.js";
import { formatMmk } from "../../../utils/helpers.js";
import { addNavFooter, addPaginationButtons } from "../../../utils/pagination.js";
import { env } from "../../../config/env.js";
import { PAGINATION } from "../../../config/constants.js";

export function registerWalletHandlers(bot: Bot<BotContext>): void {
  // ── Wallet Main Page ───────────────────────────────────────────────────────
  bot.callbackQuery(CB.USER_WALLET, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wallet = await ctx.services.wallet.getWallet(ctx.dbUser!.id);
    const balance = wallet?.balance ?? 0;

    const kb = new InlineKeyboard()
      .text(`${EMOJI.DEPOSIT} Deposit`, CB.USER_DEPOSIT)
      .text("📋 History", CB.USER_HISTORY)
      .row();
    addNavFooter(kb, { showBack: false });

    await ctx.editMessageText(
      [
        sectionHeader(EMOJI.WALLET, "My Wallet"),
        divider(),
        `${bold("Balance:")} ${bold(formatMmk(balance))}`,
        "",
        "💡 Deposit to buy products",
      ].join("\n"),
      { reply_markup: kb }
    );
  });

  // ── Deposit — Select Payment Method ───────────────────────────────────────
  bot.callbackQuery(CB.USER_DEPOSIT, async (ctx) => {
    await ctx.answerCallbackQuery();

    const kb = new InlineKeyboard();

    // Show only enabled payment methods
    const methods = [
      { id: PAYMENT_METHOD.KBZPAY, enabled: env.KBZPAY_ENABLED },
      { id: PAYMENT_METHOD.WAVEPAY, enabled: env.WAVEPAY_ENABLED },
      { id: PAYMENT_METHOD.AYAPAY, enabled: env.AYAPAY_ENABLED },
      { id: PAYMENT_METHOD.BINANCE, enabled: env.BINANCE_ENABLED },
      { id: PAYMENT_METHOD.TRC20, enabled: env.TRC20_ENABLED },
    ].filter((m) => m.enabled);

    for (let i = 0; i < methods.length; i += 2) {
      const row = methods.slice(i, i + 2);
      const buttons = row.map((m) => ({
        text: PAYMENT_METHOD_LABELS[m.id] ?? m.id,
        callback_data: `${CB.PAY_METHOD}:${m.id}`,
      }));
      kb.row(...buttons as [typeof buttons[0], ...typeof buttons]);
    }

    addNavFooter(kb, { backCallbackData: CB.USER_WALLET });

    await ctx.editMessageText(
      [
        sectionHeader(EMOJI.DEPOSIT, "Deposit"),
        divider(),
        "Select your payment method:",
      ].join("\n"),
      { reply_markup: kb }
    );
  });

  // ── Deposit — Enter Amount ─────────────────────────────────────────────────
  bot.callbackQuery(/^pay:method:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const method = ctx.match[1]!;

    // Store selected method in session
    ctx.session.temp = { ...ctx.session.temp, depositMethod: method };
    ctx.session.step = "deposit:amount";

    await ctx.editMessageText(
      [
        sectionHeader(EMOJI.DEPOSIT, "Enter Amount"),
        divider(),
        `Method: ${bold(PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method)}`,
        "",
        `Enter the amount in MMK:`,
        `Min: ${bold(formatMmk(env.MIN_DEPOSIT_AMOUNT))}`,
        `Max: ${bold(formatMmk(env.MAX_DEPOSIT_AMOUNT))}`,
      ].join("\n"),
      {
        reply_markup: new InlineKeyboard().text(
          "❌ Cancel",
          CB.USER_WALLET
        ),
      }
    );
  });

  // ── Handle Amount Input ────────────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "deposit:amount") return next();

    const amountStr = ctx.message.text.trim().replace(/,/g, "");
    const amount = parseInt(amountStr, 10);

    if (isNaN(amount) || amount < env.MIN_DEPOSIT_AMOUNT || amount > env.MAX_DEPOSIT_AMOUNT) {
      await ctx.reply(
        errorMsg(
          "Invalid Amount",
          `Please enter between ${formatMmk(env.MIN_DEPOSIT_AMOUNT)} and ${formatMmk(env.MAX_DEPOSIT_AMOUNT)}`
        )
      );
      return;
    }

    const method = ctx.session.temp?.["depositMethod"] as string ?? "kbzpay";
    ctx.session.temp = { ...ctx.session.temp, depositAmount: amount };
    ctx.session.step = "deposit:proof";

    // Show payment instructions
    const instructions = getPaymentInstructions(method, amount);
    await ctx.reply(instructions, {
      reply_markup: new InlineKeyboard()
        .text("❌ Cancel", CB.USER_WALLET),
    });
  });

  // ── Handle Screenshot Upload ───────────────────────────────────────────────
  bot.on("message:photo", async (ctx, next) => {
    if (ctx.session.step !== "deposit:proof") return next();

    const method = ctx.session.temp?.["depositMethod"] as string ?? "kbzpay";
    const amount = ctx.session.temp?.["depositAmount"] as number ?? 0;
    const photoFileId = ctx.message.photo.at(-1)?.file_id ?? "";

    // Submit deposit proof
    await ctx.services.wallet.submitDepositProof({
      userId: ctx.dbUser!.id,
      amountMmk: amount,
      paymentMethod: method,
      screenshotFileId: photoFileId,
    });

    // Reset session state
    ctx.session.step = undefined;
    ctx.session.temp = {};

    await ctx.reply(
      successMsg(
        "Deposit Submitted!",
        [
          `Amount: ${bold(formatMmk(amount))}`,
          `Method: ${bold(method.toUpperCase())}`,
          "",
          `${EMOJI.LOADING} Waiting for admin approval...`,
          "",
          "You will be notified when approved.",
        ].join("\n")
      ),
      { reply_markup: new InlineKeyboard().text(`${EMOJI.HOME} Home`, CB.NAV_HOME) }
    );
  });

  // ── Transaction History ────────────────────────────────────────────────────
  bot.callbackQuery([CB.USER_HISTORY, /^tx:history:(\d+)$/], async (ctx) => {
    await ctx.answerCallbackQuery();

    const pageMatch = typeof ctx.match === "object" ? ctx.match[1] : undefined;
    const page = parseInt(pageMatch ?? "1", 10);

    const result = await ctx.services.wallet.getHistory(
      ctx.dbUser!.id,
      page,
      PAGINATION.ORDERS_PER_PAGE
    );

    if (result.data.length === 0) {
      await ctx.editMessageText(
        `${EMOJI.INFO} No transactions yet.`,
        { reply_markup: new InlineKeyboard().text(`${EMOJI.HOME} Home`, CB.NAV_HOME) }
      );
      return;
    }

    const lines = [
      sectionHeader("📋", "Transaction History"),
      divider(),
      ...result.data.map((item: typeof result.data[number], i: number) =>
        `${bold(`${(page - 1) * PAGINATION.ORDERS_PER_PAGE + i + 1}.`)} ` +
        `${item.type} — ${item.amount > 0 ? "+" : ""}${formatMmk(item.amount)}`
      ),
    ];

    const kb = new InlineKeyboard();
    addPaginationButtons(kb, result, "tx:history");
    addNavFooter(kb, { backCallbackData: CB.USER_WALLET });

    await ctx.editMessageText(lines.join("\n"), { reply_markup: kb });
  });
}

/** Generate payment instructions for each method */
function getPaymentInstructions(method: string, amount: number): string {
  const lines = [
    sectionHeader(EMOJI.MONEY, "Payment Instructions"),
    divider(),
    `Amount: ${bold(formatMmk(amount))}`,
    "",
  ];

  switch (method) {
    case "kbzpay":
      lines.push(
        `Send ${bold(formatMmk(amount))} to:`,
        `📱 KBZPay Number: ${bold(env.KBZPAY_ACCOUNT_NUMBER)}`,
        `👤 Name: ${bold(env.KBZPAY_ACCOUNT_NAME)}`,
        "",
        "✅ After payment, upload the screenshot below:"
      );
      break;
    case "wavepay":
      lines.push(
        `Send ${bold(formatMmk(amount))} to:`,
        `🌊 WavePay: ${bold(env.WAVEPAY_ACCOUNT_NUMBER)}`,
        `👤 Name: ${bold(env.WAVEPAY_ACCOUNT_NAME)}`,
        "",
        "✅ Upload payment screenshot:"
      );
      break;
    case "ayapay":
      lines.push(
        `Send ${bold(formatMmk(amount))} to:`,
        `🏛️ AYA Pay: ${bold(env.AYAPAY_ACCOUNT_NUMBER)}`,
        `👤 Name: ${bold(env.AYAPAY_ACCOUNT_NAME)}`,
        "",
        "✅ Upload payment screenshot:"
      );
      break;
    case "trc20":
      lines.push(
        `Send USDT (TRC20) to:`,
        `💎 Address: ${bold(env.TRC20_WALLET_ADDRESS)}`,
        `💵 Amount: ${bold(formatMmk(amount))} ≈ ${(amount / env.USDT_MMK_RATE).toFixed(2)} USDT`,
        "",
        "⚠️ Send only USDT (TRC20) to this address!",
        "",
        "After sending, upload tx hash screenshot:"
      );
      break;
    default:
      lines.push("Contact support for payment details.");
  }

  return lines.join("\n");
}
