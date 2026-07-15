/**
 * @file src/bot/bot.ts
 * @description Main bot setup — wires all middleware, handlers, and services.
 *
 * This factory function creates a fully-configured Bot instance.
 * Called from api/webhook.ts (Vercel) or src/dev.ts (local polling).
 *
 * Architecture:
 *   Bot → Middleware Chain → Router → Handlers
 *         [Logger][Auth][RateLimit][Session]
 */

import { Bot, session } from "grammy";
import { conversations } from "@grammyjs/conversations";
import { hydrateReply, parseMode } from "@grammyjs/parse-mode";
import { Redis } from "@upstash/redis";
import { createBot, getDefaultSession, type BotContext } from "../config/bot.config.js";
import { env } from "../config/env.js";
import { db } from "../database/db.js";

// Repositories
import {
  UserRepository,
  WalletRepository,
  AdminRepository,
  ResellerRepository,
  ReferralRepository,
} from "../database/repositories/user.repository.js";
import {
  CategoryRepository,
  ProductRepository,
  ProductKeyRepository,
} from "../database/repositories/product.repository.js";
import { OrderRepository } from "../database/repositories/order.repository.js";
import {
  TransactionRepository,
  CouponRepository,
} from "../database/repositories/transaction.repository.js";

// Services
import { UserService } from "../services/user.service.js";
import { ProductService } from "../services/product.service.js";
import { OrderService } from "../services/order.service.js";
import { WalletService } from "../services/wallet.service.js";
import { NotificationService } from "../services/notification.service.js";

// Middlewares
import { createAuthMiddleware } from "./middlewares/auth.middleware.js";
import { rateLimitMiddleware } from "./middlewares/rateLimit.middleware.js";
import { loggerMiddleware } from "./middlewares/logger.middleware.js";

// Handlers
import { registerStartHandlers } from "./handlers/user/start.handler.js";
import { registerWalletHandlers } from "./handlers/user/wallet.handler.js";
import { registerProductHandlers } from "./handlers/user/products.handler.js";
import { registerOrderHandlers } from "./handlers/user/orders.handler.js";
import { registerProfileHandlers } from "./handlers/user/profile.handler.js";
import { registerSupportHandlers } from "./handlers/user/support.handler.js";
import { registerRedeemHandlers } from "./handlers/user/redeem.handler.js";
import { registerReferralHandlers } from "./handlers/user/referral.handler.js";
import { registerAdminHandlers } from "./handlers/admin/dashboard.handler.js";
import { registerResellerHandlers } from "./handlers/reseller/dashboard.handler.js";

import { createLogger } from "../utils/logger.js";

const log = createLogger("bot");

// ─────────────────────────────────────────────────────────────────────────────
// Bot Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and return a fully configured bot instance.
 * Creates repositories → services → bot → middlewares → handlers.
 *
 * @returns Configured Bot<BotContext> ready to handle updates
 */
export async function buildBot(): Promise<Bot<BotContext>> {
  // ── 1. Instantiate Repositories ──────────────────────────────────────────
  const userRepo = new UserRepository(db);
  const walletRepo = new WalletRepository(db);
  const adminRepo = new AdminRepository(db);
  const resellerRepo = new ResellerRepository(db);
  const referralRepo = new ReferralRepository(db);
  const categoryRepo = new CategoryRepository(db);
  const productRepo = new ProductRepository(db);
  const keyRepo = new ProductKeyRepository(db);
  const orderRepo = new OrderRepository(db);
  const txRepo = new TransactionRepository(db);
  const couponRepo = new CouponRepository(db);

  // ── 2. Instantiate Services ───────────────────────────────────────────────
  const userService = new UserService(
    userRepo, walletRepo, adminRepo, resellerRepo, referralRepo
  );
  const productService = new ProductService(categoryRepo, productRepo, keyRepo);
  const walletService = new WalletService(walletRepo, txRepo);
  const orderService = new OrderService(
    orderRepo, productRepo, keyRepo, walletRepo, txRepo, couponRepo
  );

  // ── 3. Create Bot ─────────────────────────────────────────────────────────
  const bot = createBot();

  // ── 4. Notification Service (needs bot reference) ─────────────────────────
  const notificationService = new NotificationService(bot);

  // ── 5. Session Middleware (Upstash Redis storage) ─────────────────────────
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  bot.use(
    session({
      initial: getDefaultSession,
      storage: {
        // Upstash Redis adapter for grammY sessions
        read: async (key) => {
          const val = await redis.get<string>(`session:${key}`);
          return val ? JSON.parse(val) : undefined;
        },
        write: async (key, value) => {
          await redis.set(`session:${key}`, JSON.stringify(value), { ex: 86400 });
        },
        delete: async (key) => {
          await redis.del(`session:${key}`);
        },
      },
    })
  );

  // ── 6. Parse Mode (HTML) ──────────────────────────────────────────────────
  bot.use(hydrateReply);
  bot.api.config.use(parseMode("HTML"));

  // ── 7. Conversations Plugin ───────────────────────────────────────────────
  bot.use(conversations());

  // ── 8. Logger Middleware ──────────────────────────────────────────────────
  bot.use(loggerMiddleware);

  // ── 9. Auth Middleware (registers user, sets role, injects t()) ───────────
  bot.use(createAuthMiddleware(userService));

  // ── 10. Rate Limiter ──────────────────────────────────────────────────────
  bot.use(rateLimitMiddleware);

  // ── 11. Inject Services into Context ─────────────────────────────────────
  bot.use(async (ctx, next) => {
    ctx.services = {
      user: userService,
      product: productService,
      order: orderService,
      wallet: walletService,
      notification: notificationService,
    };
    return next();
  });

  // ── 12. Register All Handlers ─────────────────────────────────────────────
  registerStartHandlers(bot);
  registerProfileHandlers(bot);
  registerWalletHandlers(bot);
  registerProductHandlers(bot);
  registerOrderHandlers(bot);
  registerSupportHandlers(bot);
  registerRedeemHandlers(bot);
  registerReferralHandlers(bot);
  registerAdminHandlers(bot);
  registerResellerHandlers(bot);

  // ── 13. Error Handler ─────────────────────────────────────────────────────
  bot.catch((err) => {
    const ctx = err.ctx;
    log.error(
      { telegramId: ctx.from?.id, err: err.error },
      "Unhandled bot error"
    );
  });

  // ── 14. Handle noop callbacks (pagination info buttons) ───────────────────
  bot.callbackQuery("noop", async (ctx) => {
    await ctx.answerCallbackQuery(); // Just dismiss the loading state
  });

  log.info("Bot configured and ready");
  return bot;
}
