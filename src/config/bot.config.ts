/**
 * @file src/config/bot.config.ts
 * @description Bot-level configuration, context types, and bot factory.
 *
 * Defines the custom BotContext that flows through every handler.
 * Flavors applied:
 *   - ParseModeFlavor  — ctx.replyFmt() for HTML/Markdown
 *   - ConversationFlavor — multi-step conversation support
 *   - SessionFlavor    — Redis-backed session storage
 */

import { Bot, Context, SessionFlavor, type Middleware } from "grammy";
import { type ConversationFlavor } from "@grammyjs/conversations";
import { type ParseModeFlavor } from "@grammyjs/parse-mode";
import { env } from "./env.js";
import type { UserRecord } from "../types/database.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Session Data
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionData {
  step?: string | undefined;
  role?: "user" | "reseller" | "admin" | "super_admin" | undefined;
  language?: "my" | "en" | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  temp?: Record<string, any> | undefined;
  lastMenuMessageId?: number | undefined;
}

export function getDefaultSession(): SessionData {
  return { language: env.DEFAULT_LANGUAGE };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Container (DI) — generic to avoid circular imports
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceContainer = Record<string, any>;

// ─────────────────────────────────────────────────────────────────────────────
// Custom Context
// ─────────────────────────────────────────────────────────────────────────────

export type BotContext = ParseModeFlavor<
  ConversationFlavor<Context & SessionFlavor<SessionData>>
> & {
  dbUser: UserRecord | null;
  services: ServiceContainer;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Bot Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createBot(): Bot<BotContext> {
  return new Bot<BotContext>(env.BOT_TOKEN);
}

export type BotMiddleware = Middleware<BotContext>;
