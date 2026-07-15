/**
 * @file src/utils/pagination.ts
 * @description Pagination utilities for inline keyboard navigation.
 *
 * Creates "◀ Prev | Page X/Y | Next ▶" style navigation
 * for any paginated list in the bot.
 */

import { InlineKeyboard } from "grammy";
import { PAGINATION } from "../config/constants.js";
import type { PaginatedResult } from "../types/database.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate pagination metadata from total count and current page.
 *
 * @param total - Total number of items
 * @param page - Current page (1-indexed)
 * @param pageSize - Items per page
 */
export function calculatePagination(
  total: number,
  page: number,
  pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE
): Omit<PaginatedResult<never>, "data"> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    total,
    page: safePage,
    pageSize,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}

/**
 * Calculate the SQL OFFSET for a given page.
 *
 * @param page - Current page (1-indexed)
 * @param pageSize - Items per page
 */
export function getOffset(page: number, pageSize: number): number {
  return (Math.max(1, page) - 1) * pageSize;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Keyboard Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build pagination navigation buttons and append to an InlineKeyboard.
 *
 * The callback data format is: `{prefix}:{page}`
 * e.g., for prefix "products:cat:abc", page 2 → "products:cat:abc:2"
 *
 * @param keyboard - The InlineKeyboard to append pagination to
 * @param pagination - Pagination metadata (from calculatePagination)
 * @param callbackPrefix - Prefix for page navigation callback data
 *
 * @example
 * const kb = new InlineKeyboard();
 * addPaginationButtons(kb, { page: 2, totalPages: 5, hasNext: true, hasPrev: true }, "prod:list");
 * // Adds: [◀ Prev] [Page 2/5] [Next ▶]
 */
export function addPaginationButtons(
  keyboard: InlineKeyboard,
  pagination: {
    page: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  },
  callbackPrefix: string
): InlineKeyboard {
  if (pagination.totalPages <= 1) {
    // No pagination needed for single-page results
    return keyboard;
  }

  const buttons: Parameters<InlineKeyboard["row"]> = [];

  // Previous page button
  if (pagination.hasPrev) {
    buttons.push({
      text: "◀️ Prev",
      callback_data: `${callbackPrefix}:${pagination.page - 1}`,
    });
  }

  // Current page indicator (non-clickable)
  buttons.push({
    text: `📄 ${pagination.page}/${pagination.totalPages}`,
    callback_data: "noop", // No-operation callback
  });

  // Next page button
  if (pagination.hasNext) {
    buttons.push({
      text: "Next ▶️",
      callback_data: `${callbackPrefix}:${pagination.page + 1}`,
    });
  }

  // Build row directly with spread
  keyboard.row(...buttons as [typeof buttons[number], ...typeof buttons]);
  return keyboard;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard Navigation Footer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add standard navigation footer to any keyboard.
 * Every bot page should have Back, Home, and optionally Refresh.
 *
 * @param keyboard - Keyboard to add navigation to
 * @param options - Which buttons to include and their callback data
 */
export function addNavFooter(
  keyboard: InlineKeyboard,
  options: {
    showBack?: boolean;
    backCallbackData?: string;
    showHome?: boolean;
    showRefresh?: boolean;
    refreshCallbackData?: string;
  } = {}
): InlineKeyboard {
  const {
    showBack = true,
    backCallbackData = "nav:back",
    showHome = true,
    showRefresh = false,
    refreshCallbackData = "nav:refresh",
  } = options;

  const navButtons: Parameters<InlineKeyboard["row"]> = [];

  if (showBack) {
    navButtons.push({ text: "◀️ Back", callback_data: backCallbackData });
  }

  if (showHome) {
    navButtons.push({ text: "🏠 Home", callback_data: "nav:home" });
  }

  if (showRefresh) {
    navButtons.push({ text: "🔄 Refresh", callback_data: refreshCallbackData });
  }

  if (navButtons.length > 0) {
    keyboard.row(...navButtons as [typeof navButtons[number], ...typeof navButtons]);
  }

  return keyboard;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm Dialog Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a confirmation dialog keyboard.
 * Used for any destructive or important actions.
 *
 * @example
 * const kb = buildConfirmKeyboard("order:cancel:ORD-123", "nav:home");
 * // Creates: [✅ Confirm] [❌ Cancel]
 */
export function buildConfirmKeyboard(
  confirmCallbackData: string,
  cancelCallbackData: string,
  options: {
    confirmText?: string;
    cancelText?: string;
  } = {}
): InlineKeyboard {
  const { confirmText = "✅ Confirm", cancelText = "❌ Cancel" } = options;

  return new InlineKeyboard().row(
    { text: confirmText, callback_data: confirmCallbackData },
    { text: cancelText, callback_data: cancelCallbackData }
  );
}
