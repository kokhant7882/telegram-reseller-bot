/**
 * @file src/utils/formatters.ts
 * @description Message formatting utilities for Telegram HTML output.
 *
 * All bot messages use HTML parse mode for rich formatting.
 * These helpers produce consistent, visually appealing messages.
 *
 * Reference: https://core.telegram.org/bots/api#html-style
 */

import { EMOJI } from "../config/constants.js";
import { formatDate, formatMmk } from "./helpers.js";
import type { Order } from "../database/schema/orders.schema.js";
import type { Product } from "../database/schema/products.schema.js";
import type { Transaction } from "../database/schema/transactions.schema.js";
import type { User, Wallet } from "../database/schema/users.schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// HTML Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Wrap text in HTML bold */
export const bold = (text: string): string => `<b>${text}</b>`;

/** Wrap text in HTML italic */
export const italic = (text: string): string => `<i>${text}</i>`;

/** Wrap text in HTML code (monospace) */
export const code = (text: string): string => `<code>${text}</code>`;

/** Wrap text in a preformatted block */
export const pre = (text: string): string => `<pre>${text}</pre>`;

/** Create a hyperlink */
export const link = (text: string, url: string): string =>
  `<a href="${url}">${text}</a>`;

/** Horizontal separator line */
export const divider = (): string =>
  "━━━━━━━━━━━━━━━━━━━━━━";

/** Section header with emoji */
export const sectionHeader = (emoji: string, title: string): string =>
  `${emoji} ${bold(title)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Status Formatters
// ─────────────────────────────────────────────────────────────────────────────

/** Map order status to display emoji + label */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "⏳ Pending",
  paid: "✅ Paid",
  delivered: "📦 Delivered",
  cancelled: "❌ Cancelled",
  refunded: "💰 Refunded",
};

/** Map transaction status to display label */
export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  pending: "⏳ Pending",
  approved: "✅ Approved",
  rejected: "❌ Rejected",
  auto_verified: "🤖 Auto Verified",
};

// ─────────────────────────────────────────────────────────────────────────────
// Profile Formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format user profile message.
 */
export function formatProfile(
  user: User,
  wallet: Wallet,
  stats: {
    totalOrders: number;
    totalSpent: number;
    referralCount: number;
  }
): string {
  const name = user.username ? `@${user.username}` : `${user.firstName} ${user.lastName ?? ""}`.trim();

  return [
    sectionHeader(EMOJI.USER, "My Profile"),
    divider(),
    `${bold("Name:")} ${name}`,
    `${bold("ID:")} ${code(String(user.telegramId))}`,
    `${bold("Joined:")} ${formatDate(user.createdAt)}`,
    `${bold("Language:")} ${user.languageCode === "my" ? "🇲🇲 Myanmar" : "🇬🇧 English"}`,
    "",
    sectionHeader(EMOJI.WALLET, "Wallet"),
    `${bold("Balance:")} ${code(formatMmk(wallet.balance))}`,
    "",
    sectionHeader(EMOJI.STATS, "Statistics"),
    `${bold("Total Orders:")} ${stats.totalOrders}`,
    `${bold("Total Spent:")} ${formatMmk(stats.totalSpent)}`,
    `${bold("Referrals:")} ${stats.referralCount} people`,
    "",
    `${bold("Referral Code:")} ${code(user.referralCode)}`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a product detail message.
 */
export function formatProduct(
  product: Product,
  categoryName: string,
  isReseller: boolean = false
): string {
  const stockDisplay =
    product.stock === -1
      ? "♾️ Unlimited"
      : product.stock === 0
      ? "❌ Out of Stock"
      : `✅ ${product.stock} available`;

  const priceDisplay = isReseller
    ? [
        `${bold("Retail Price:")} ${code(formatMmk(product.price))}`,
        `${bold("Wholesale Price:")} ${code(formatMmk(product.wholesalePrice))}`,
        `${bold("Your Profit:")} ${code(formatMmk(product.price - product.wholesalePrice))} per unit`,
      ].join("\n")
    : `${bold("Price:")} ${code(formatMmk(product.price))}`;

  return [
    sectionHeader(EMOJI.PRODUCT, product.name),
    divider(),
    `${bold("Category:")} ${categoryName}`,
    priceDisplay,
    `${bold("Stock:")} ${stockDisplay}`,
    `${bold("Delivery:")} ${product.deliveryType === "instant" ? "⚡ Instant" : "🕐 Manual"}`,
    "",
    bold("Description:"),
    product.description || italic("No description available"),
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an order detail message.
 */
export function formatOrder(
  order: Order,
  productName: string
): string {
  const statusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;

  const lines = [
    sectionHeader(EMOJI.ORDER, `Order ${order.orderId}`),
    divider(),
    `${bold("Product:")} ${productName}`,
    `${bold("Quantity:")} ${order.quantity}`,
    `${bold("Unit Price:")} ${code(formatMmk(order.unitPrice))}`,
  ];

  if (order.discountAmount > 0) {
    lines.push(`${bold("Discount:")} -${code(formatMmk(order.discountAmount))}`);
  }

  lines.push(
    `${bold("Total:")} ${code(formatMmk(order.totalPrice))}`,
    `${bold("Payment:")} ${order.paymentMethod.toUpperCase()}`,
    `${bold("Status:")} ${statusLabel}`,
    `${bold("Date:")} ${formatDate(order.createdAt)}`
  );

  if (order.status === "delivered" && order.deliveryData) {
    lines.push(
      "",
      bold("🎁 Your Product:"),
      pre(order.deliveryData)
    );
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a transaction for history display.
 */
export function formatTransaction(tx: Transaction): string {
  const sign = tx.amount > 0 ? "+" : "";
  const statusLabel = TRANSACTION_STATUS_LABELS[tx.status] ?? tx.status;

  return [
    `${bold(tx.type.replace(/_/g, " ").toUpperCase())}`,
    `${bold("Amount:")} ${sign}${code(formatMmk(tx.amount))}`,
    `${bold("Balance:")} ${code(formatMmk(tx.balanceAfter))}`,
    `${bold("Status:")} ${statusLabel}`,
    `${bold("Date:")} ${formatDate(tx.createdAt)}`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Success/Error Message Formatters
// ─────────────────────────────────────────────────────────────────────────────

/** Format a success message */
export function successMsg(title: string, details?: string): string {
  const lines = [`${EMOJI.SUCCESS} ${bold(title)}`];
  if (details) lines.push("", details);
  return lines.join("\n");
}

/** Format an error message */
export function errorMsg(title: string, details?: string): string {
  const lines = [`${EMOJI.ERROR} ${bold(title)}`];
  if (details) lines.push("", italic(details));
  return lines.join("\n");
}

/** Format a warning message */
export function warningMsg(title: string, details?: string): string {
  const lines = [`${EMOJI.WARNING} ${bold(title)}`];
  if (details) lines.push("", details);
  return lines.join("\n");
}

/** Format a loading/processing message */
export function loadingMsg(text: string): string {
  return `${EMOJI.LOADING} ${italic(text)}`;
}
