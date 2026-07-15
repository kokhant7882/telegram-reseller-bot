/**
 * @file src/types/bot.types.ts
 * @description Bot-specific type definitions for handlers, keyboards,
 * and middleware.
 */

import type { InlineKeyboardMarkup } from "grammy/types";
import type { BotContext } from "../config/bot.config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Handler Types
// ─────────────────────────────────────────────────────────────────────────────

/** A generic async bot handler function */
export type BotHandler = (ctx: BotContext) => Promise<void>;

/** Handler with next middleware support */
export type BotMiddlewareFn = (
  ctx: BotContext,
  next: () => Promise<void>
) => Promise<void>;

// ─────────────────────────────────────────────────────────────────────────────
// Menu / Keyboard Types
// ─────────────────────────────────────────────────────────────────────────────

/** Inline keyboard button definition */
export interface InlineButton {
  text: string;
  callbackData?: string;
  url?: string;
}

/** A row of inline buttons */
export type ButtonRow = InlineButton[];

/** Complete keyboard layout */
export type KeyboardLayout = ButtonRow[];

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Types
// ─────────────────────────────────────────────────────────────────────────────

/** Standard navigation footer buttons added to all menus */
export interface NavFooter {
  showBack?: boolean;
  showHome?: boolean;
  showRefresh?: boolean;
  backCallbackData?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Types
// ─────────────────────────────────────────────────────────────────────────────

/** Pagination state for any paginated list */
export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  /** Callback prefix for page navigation buttons e.g. "page:products" */
  callbackPrefix: string;
}

/** Result of building paginated inline keyboard buttons */
export interface PaginationButtons {
  /** "◀ Prev" and "Next ▶" buttons row */
  navRow: InlineButton[];
  /** "Page X / Y" info button row */
  infoRow: InlineButton[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm Dialog Types
// ─────────────────────────────────────────────────────────────────────────────

/** Options for generating a confirm/cancel dialog keyboard */
export interface ConfirmDialogOptions {
  confirmText?: string;
  cancelText?: string;
  confirmCallbackData: string;
  cancelCallbackData: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Types
// ─────────────────────────────────────────────────────────────────────────────

/** Options for sending/editing a menu message */
export interface MenuMessageOptions {
  text: string;
  keyboard: InlineKeyboardMarkup;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Action Types
// ─────────────────────────────────────────────────────────────────────────────

/** Broadcast target audience */
export type BroadcastTarget = "all" | "users" | "resellers";

/** Admin verification action on a payment */
export type VerificationAction = "approve" | "reject";

// ─────────────────────────────────────────────────────────────────────────────
// Localization Types
// ─────────────────────────────────────────────────────────────────────────────

/** Supported languages */
export type Language = "my" | "en";

/** Translation function signature */
export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>
) => string;
