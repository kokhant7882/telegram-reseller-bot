/**
 * @file src/utils/helpers.ts
 * @description General utility helper functions.
 *
 * Pure functions with no side effects — easy to test.
 */

import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";

// ─────────────────────────────────────────────────────────────────────────────
// ID Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a unique referral code.
 * Format: REF-XXXXXXXX (8 uppercase alphanumeric characters)
 */
export function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const code = Array.from({ length: 8 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
  return `REF-${code}`;
}

/**
 * Generate a human-readable order ID.
 * Format: ORD-YYYYMMDD-XXXX (4 random alphanumeric chars)
 *
 * @example ORD-20241015-A3F2
 */
export function generateOrderId(): string {
  const date = dayjs().format("YYYYMMDD");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const suffix = Array.from({ length: 4 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
  return `ORD-${date}-${suffix}`;
}

/** Generate a standard UUID v4 */
export function generateId(): string {
  return uuidv4();
}

// ─────────────────────────────────────────────────────────────────────────────
// Number Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a number as MMK currency.
 * @example formatMmk(1500000) → "1,500,000 MMK"
 */
export function formatMmk(amount: number): string {
  return `${amount.toLocaleString("en-US")} MMK`;
}

/**
 * Format a number as USDT.
 * @example formatUsdt(12.5) → "12.50 USDT"
 */
export function formatUsdt(amount: number): string {
  return `${amount.toFixed(2)} USDT`;
}

/**
 * Convert MMK to USDT using a given rate.
 * @param mmk - Amount in MMK
 * @param rate - USDT/MMK rate (e.g., 3500 means 1 USDT = 3500 MMK)
 */
export function mmkToUsdt(mmk: number, rate: number): number {
  return Math.round((mmk / rate) * 100) / 100; // Round to 2 decimals
}

/**
 * Convert USDT to MMK using a given rate.
 * @param usdt - Amount in USDT
 * @param rate - USDT/MMK rate
 */
export function usdtToMmk(usdt: number, rate: number): number {
  return Math.round(usdt * rate);
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a date for display in Telegram messages.
 * @example formatDate(new Date()) → "15 Jul 2024, 09:30"
 */
export function formatDate(date: Date): string {
  return dayjs(date).format("DD MMM YYYY, HH:mm");
}

/**
 * Format a date as relative time.
 * @example formatRelative(new Date()) → "2 hours ago"
 */
export function formatRelative(date: Date): string {
  const now = dayjs();
  const d = dayjs(date);
  const diffMins = now.diff(d, "minute");

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minutes ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} days ago`;
  return formatDate(date);
}

// ─────────────────────────────────────────────────────────────────────────────
// String Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape special characters for Telegram MarkdownV2.
 * Required when using parseMode: "MarkdownV2"
 */
export function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

/**
 * Truncate a string to a maximum length.
 * @example truncate("Hello World", 8) → "Hello..."
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Mask a phone number for privacy.
 * @example maskPhone("09123456789") → "0912****789"
 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  const start = phone.slice(0, 4);
  const end = phone.slice(-3);
  return `${start}****${end}`;
}

/**
 * Normalize a coupon code to uppercase.
 * Used when users enter coupon codes.
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the display name of a Telegram user.
 * Prefers username, falls back to first + last name.
 */
export function getTelegramDisplayName(user: {
  username?: string | null;
  firstName: string;
  lastName?: string | null;
}): string {
  if (user.username) return `@${user.username}`;
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.join(" ");
}

/**
 * Create a Telegram mention link.
 * @example userMention(123456789, "John") → "[John](tg://user?id=123456789)"
 */
export function userMention(telegramId: number, name: string): string {
  return `[${escapeMd(name)}](tg://user?id=${telegramId})`;
}

/**
 * Sleep for a given number of milliseconds.
 * Used in broadcasts to avoid hitting Telegram rate limits.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chunk an array into smaller arrays of a given size.
 * Used for batch operations (broadcast, key imports).
 *
 * @example chunk([1,2,3,4,5], 2) → [[1,2],[3,4],[5]]
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size)
  );
}
