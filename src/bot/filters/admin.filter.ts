/**
 * @file src/bot/filters/admin.filter.ts
 * @description Filter that only passes updates from admin users.
 * Use with bot.filter(isAdmin, ...) or bot.command("admin", isAdmin, handler)
 */

import type { BotContext } from "../../config/bot.config.js";

/** Returns true if the user is an admin or super_admin */
export function isAdmin(ctx: BotContext): boolean {
  return ctx.session.role === "admin" || ctx.session.role === "super_admin";
}

/** Returns true if the user is a super_admin only */
export function isSuperAdmin(ctx: BotContext): boolean {
  return ctx.session.role === "super_admin";
}

/** Returns true if the user is a reseller (approved) */
export function isReseller(ctx: BotContext): boolean {
  return (
    ctx.session.role === "reseller" ||
    ctx.session.role === "admin" ||
    ctx.session.role === "super_admin"
  );
}

/** Returns true if the user is registered (any role) */
export function isRegistered(ctx: BotContext): boolean {
  return ctx.dbUser !== null;
}

/** Returns true if the user is NOT banned */
export function isNotBanned(ctx: BotContext): boolean {
  return ctx.dbUser?.isBanned !== true;
}
