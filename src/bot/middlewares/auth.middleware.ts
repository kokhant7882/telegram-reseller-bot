/**
 * @file src/bot/middlewares/auth.middleware.ts
 * @description Authentication middleware.
 *
 * For every incoming update:
 * 1. Finds or creates the user in the database
 * 2. Checks if user is banned
 * 3. Sets ctx.dbUser and ctx.session.role
 * 4. Injects the translation function ctx.t
 */

import type { BotMiddleware } from "../../config/bot.config.js";
import { UserService } from "../../services/user.service.js";
import { createLogger } from "../../utils/logger.js";
import { EMOJI } from "../../config/constants.js";

const log = createLogger("auth-middleware");

// Flat translation map type
type TranslationMap = Record<string, unknown>;

/**
 * Simple JSON i18n — loads locale files and resolves dot-notation keys.
 * e.g., t("wallet.balance") → "💰 Balance: {balance}"
 */
function loadTranslations(lang: string): TranslationMap {
  try {
    // Dynamic import based on language
    // In production these are bundled, so require() works
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(`../../locales/${lang}.json`) as TranslationMap;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("../../locales/en.json") as TranslationMap;
  }
}

function resolveKey(map: TranslationMap, key: string): string {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = map;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return key;
    current = current[part as keyof typeof current];
  }
  return typeof current === "string" ? current : key;
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    template
  );
}

/**
 * Auth middleware factory — requires UserService to be available.
 */
export function createAuthMiddleware(userService: UserService): BotMiddleware {
  return async (ctx, next) => {
    const from = ctx.from;
    if (!from) {
      // Non-user updates (channel posts, etc.) — pass through
      return next();
    }

    try {
      // 1. Register or retrieve user
      const { user, isNew } = await userService.register({
        telegramId: from.id,
        ...(from.username ? { username: from.username } : {}),
        firstName: from.first_name,
        ...(from.last_name ? { lastName: from.last_name } : {}),
        ...(from.language_code ? { languageCode: from.language_code } : {}),
      });

      // 2. Set dbUser in context
      ctx.dbUser = user;

      // 3. Check if banned
      if (user.isBanned) {
        await ctx.reply(
          `${EMOJI.BAN} Your account has been suspended.\n\nReason: ${user.banReason ?? "Policy violation"}`,
          { parse_mode: "HTML" }
        );
        return; // Stop processing
      }

      // 4. Set role in session (cache to avoid repeated DB lookups)
      const role = await userService.getRole(from.id, user.id);
      ctx.session.role = role;

      // 5. Set language (from session override or user preference)
      const lang = ctx.session.language ?? user.languageCode ?? "my";
      const translations = loadTranslations(lang);

      // 6. Inject translation function
      ctx.t = (key: string, vars?: Record<string, string | number>) => {
        const template = resolveKey(translations, key);
        return interpolate(template, vars);
      };

      if (isNew) {
        log.info({ telegramId: from.id }, "New user auto-registered");
      }
    } catch (err) {
      log.error({ err, telegramId: from?.id }, "Auth middleware error");
      ctx.dbUser = null;

      // Provide fallback translation function
      ctx.t = (key: string) => key;
    }

    return next();
  };
}
