/**
 * @file src/services/notification.service.ts
 * @description Send Telegram notifications to users.
 *
 * Handles broadcast messages with rate limiting (30 msg/sec Telegram limit),
 * and individual notifications for order/payment events.
 */

import { Bot } from "grammy";
import type { BotContext } from "../config/bot.config.js";
import { sleep, chunk } from "../utils/helpers.js";
import { createLogger } from "../utils/logger.js";
import { EMOJI } from "../config/constants.js";
import { bold, code } from "../utils/formatters.js";
import { formatMmk } from "../utils/helpers.js";

const log = createLogger("notification-service");

/** Telegram rate limit: 30 messages per second */
const RATE_LIMIT_DELAY_MS = 35; // slight buffer over 1000/30ms

export class NotificationService {
  constructor(private readonly bot: Bot<BotContext>) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Individual Notifications
  // ─────────────────────────────────────────────────────────────────────────

  /** Notify user that their deposit was approved */
  async notifyDepositApproved(
    telegramId: number,
    amount: number,
    balance: number
  ): Promise<void> {
    const text = [
      `${EMOJI.SUCCESS} ${bold("Deposit Approved!")}`,
      "",
      `Amount: ${code(formatMmk(amount))}`,
      `New Balance: ${code(formatMmk(balance))}`,
    ].join("\n");

    await this.sendSafe(telegramId, text);
  }

  /** Notify user that their deposit was rejected */
  async notifyDepositRejected(
    telegramId: number,
    amount: number,
    reason: string
  ): Promise<void> {
    const text = [
      `${EMOJI.ERROR} ${bold("Deposit Rejected")}`,
      "",
      `Amount: ${code(formatMmk(amount))}`,
      `Reason: ${reason}`,
      "",
      "Please contact support if you believe this is an error.",
    ].join("\n");

    await this.sendSafe(telegramId, text);
  }

  /** Notify user that their order was delivered */
  async notifyOrderDelivered(
    telegramId: number,
    orderId: string,
    productName: string,
    deliveryData?: string
  ): Promise<void> {
    const lines = [
      `${EMOJI.PRODUCT} ${bold("Order Delivered!")}`,
      "",
      `Order ID: ${code(orderId)}`,
      `Product: ${productName}`,
    ];

    if (deliveryData) {
      lines.push("", bold("Your product:"), `<pre>${deliveryData}</pre>`);
    }

    await this.sendSafe(telegramId, lines.join("\n"));
  }

  /** Notify user of a new order (for manual delivery products) */
  async notifyOrderReceived(
    telegramId: number,
    orderId: string,
    productName: string,
    total: number
  ): Promise<void> {
    const text = [
      `${EMOJI.SUCCESS} ${bold("Order Placed!")}`,
      "",
      `Order ID: ${code(orderId)}`,
      `Product: ${productName}`,
      `Total: ${code(formatMmk(total))}`,
      "",
      "⏳ Admin will deliver your order shortly.",
    ].join("\n");

    await this.sendSafe(telegramId, text);
  }

  /** Notify admin of a new pending payment */
  async notifyAdminPendingPayment(
    adminTelegramId: number,
    userTelegramId: number,
    amount: number,
    method: string,
    txId: string
  ): Promise<void> {
    const text = [
      `${EMOJI.MONEY} ${bold("New Deposit Request")}`,
      "",
      `User: ${code(String(userTelegramId))}`,
      `Amount: ${code(formatMmk(amount))}`,
      `Method: ${method.toUpperCase()}`,
      `TX ID: ${code(txId)}`,
      "",
      "Use /admin → Payment Verification to approve/reject.",
    ].join("\n");

    await this.sendSafe(adminTelegramId, text);
  }

  /** Notify admin of a new order needing manual delivery */
  async notifyAdminNewOrder(
    adminTelegramId: number,
    orderId: string,
    productName: string,
    userId: number
  ): Promise<void> {
    const text = [
      `${EMOJI.ORDER} ${bold("New Manual Order")}`,
      "",
      `Order ID: ${code(orderId)}`,
      `Product: ${productName}`,
      `User: ${code(String(userId))}`,
      "",
      "Use /admin → Orders to deliver.",
    ].join("\n");

    await this.sendSafe(adminTelegramId, text);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Broadcast
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Broadcast a message to multiple users.
   * Respects Telegram's 30 msg/sec rate limit using chunked delays.
   *
   * @returns Statistics: { sent, failed }
   */
  async broadcast(
    telegramIds: number[],
    message: string,
    photoFileId?: string
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    // Process in chunks of 25 to control rate
    const chunks = chunk(telegramIds, 25);

    for (const batch of chunks) {
      await Promise.allSettled(
        batch.map(async (telegramId) => {
          try {
            if (photoFileId) {
              await this.bot.api.sendPhoto(telegramId, photoFileId, {
                caption: message,
                parse_mode: "HTML",
              });
            } else {
              await this.bot.api.sendMessage(telegramId, message, {
                parse_mode: "HTML",
              });
            }
            sent++;
          } catch (err) {
            // User may have blocked bot — not a critical error
            failed++;
          }
        })
      );

      // Wait between batches to avoid rate limiting
      await sleep(RATE_LIMIT_DELAY_MS * batch.length);
    }

    log.info({ total: telegramIds.length, sent, failed }, "Broadcast completed");
    return { sent, failed };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Send a message safely — log errors instead of throwing */
  private async sendSafe(
    telegramId: number,
    text: string
  ): Promise<void> {
    try {
      await this.bot.api.sendMessage(telegramId, text, {
        parse_mode: "HTML",
      });
    } catch (err) {
      // User may have blocked the bot — just log
      log.warn(
        { telegramId, err: (err as Error).message },
        "Failed to send notification"
      );
    }
  }
}
