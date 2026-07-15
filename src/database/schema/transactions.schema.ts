/**
 * @file src/database/schema/transactions.schema.ts
 * @description Drizzle ORM schemas for financial transactions and coupons.
 *
 * Tables defined here:
 *   - transactions  — All wallet movements (deposits, purchases, refunds)
 *   - coupons       — Discount and promo codes
 *   - couponUsages  — Tracks which user used which coupon
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  bigint,
  integer,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/** Types of wallet transactions */
export const transactionTypeEnum = pgEnum("transaction_type", [
  "deposit", // User deposited money
  "withdrawal", // User withdrew money (if supported)
  "purchase", // Deducted for product purchase
  "refund", // Refunded for cancelled/refunded order
  "referral_reward", // Earned from referral
  "admin_adjustment", // Admin manually adjusted balance
  "reseller_commission", // Reseller earned commission
]);

/** Payment/verification status */
export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending", // Awaiting verification
  "approved", // Manually approved by admin
  "rejected", // Rejected by admin
  "auto_verified", // Automatically verified (Binance/TRC20)
]);

/** Coupon type */
export const couponTypeEnum = pgEnum("coupon_type", [
  "percentage", // Discount as % of order total
  "fixed", // Fixed MMK discount
  "promo", // Free wallet credit (redeem code)
]);

// ─────────────────────────────────────────────────────────────────────────────
// Transactions Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete ledger of all wallet transactions.
 *
 * Every balance change must have a corresponding transaction record.
 * This ensures full audit trail and makes debugging balance issues easy.
 *
 * Balance integrity rule:
 *   wallet.balance == SUM of all transaction.amount where status != 'rejected'
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** FK to users.id — whose wallet is affected */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    /** Type of transaction */
    type: transactionTypeEnum("type").notNull(),

    /**
     * Transaction amount in MMK.
     * Positive = credit (money added to wallet)
     * Negative = debit (money removed from wallet)
     */
    amount: bigint("amount", { mode: "number" }).notNull(),

    /** Wallet balance before this transaction */
    balanceBefore: bigint("balance_before", { mode: "number" }).notNull(),

    /** Wallet balance after this transaction */
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),

    /**
     * Payment method used (for deposits).
     * One of: kbzpay | wavepay | ayapay | binance | trc20 | wallet | system
     */
    paymentMethod: varchar("payment_method", { length: 20 }),

    /**
     * External transaction reference.
     * KBZPay/WavePay: receipt number
     * Binance: prepay ID
     * TRC20: transaction hash
     */
    txReference: varchar("tx_reference", { length: 200 }),

    /**
     * Telegram file_id of payment screenshot.
     * Only set for manual payment verifications.
     */
    screenshotFileId: varchar("screenshot_file_id", { length: 200 }),

    /** Verification/processing status */
    status: transactionStatusEnum("status").notNull().default("pending"),

    /**
     * FK to users.id (admin) who verified this transaction.
     * NULL for auto-verified transactions.
     */
    verifiedBy: uuid("verified_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** When the transaction was verified */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    /** Additional notes (admin rejection reason, etc.) */
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("transactions_user_id_idx").on(table.userId),
    typeIdx: index("transactions_type_idx").on(table.type),
    statusIdx: index("transactions_status_idx").on(table.status),
    createdAtIdx: index("transactions_created_at_idx").on(table.createdAt),
    // Unique reference prevents duplicate transaction processing
    txReferenceIdx: index("transactions_tx_reference_idx").on(table.txReference),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Coupons Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discount coupons and promo codes.
 *
 * Types:
 *   percentage — Reduces order total by X%
 *   fixed      — Reduces order total by X MMK
 *   promo      — Credits X MMK to wallet (redeem code)
 */
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * The coupon code users enter.
     * Case-insensitive in application layer, stored uppercase.
     */
    code: varchar("code", { length: 20 }).notNull().unique(),

    /** Type of discount/reward */
    type: couponTypeEnum("type").notNull(),

    /**
     * Value of the coupon:
     *   percentage type: 1-100 (percent)
     *   fixed type: MMK amount
     *   promo type: MMK amount credited to wallet
     */
    value: bigint("value", { mode: "number" }).notNull(),

    /**
     * Maximum number of times this coupon can be used (globally).
     * NULL = unlimited uses.
     */
    maxUses: integer("max_uses"),

    /** How many times this coupon has been used */
    usedCount: integer("used_count").notNull().default(0),

    /** Minimum order amount to apply this coupon (in MMK) */
    minOrderAmount: bigint("min_order_amount", { mode: "number" })
      .notNull()
      .default(0),

    /** Whether this coupon is currently active */
    isActive: boolean("is_active").notNull().default(true),

    /** When this coupon expires — NULL = never expires */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    /** FK to users.id (admin) who created this coupon */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("coupons_code_idx").on(table.code),
    isActiveIdx: index("coupons_is_active_idx").on(table.isActive),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Coupon Usages Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks which users used which coupons.
 * Prevents duplicate usage and enables per-user coupon limits.
 */
export const couponUsages = pgTable(
  "coupon_usages",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** FK to orders.id — which order this coupon was used on */
    orderId: uuid("order_id"), // Set after order creation; no FK to avoid circular

    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Ensure each user can use a coupon only once
    uniqueUsageIdx: uniqueIndex("coupon_usages_unique_idx").on(
      table.couponId,
      table.userId
    ),
    couponIdIdx: index("coupon_usages_coupon_id_idx").on(table.couponId),
    userIdIdx: index("coupon_usages_user_id_idx").on(table.userId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  verifiedByUser: one(users, {
    fields: [transactions.verifiedBy],
    references: [users.id],
    relationName: "verified_by",
  }),
}));

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [coupons.createdBy],
    references: [users.id],
  }),
  usages: many(couponUsages),
}));

export const couponUsagesRelations = relations(couponUsages, ({ one }) => ({
  coupon: one(coupons, {
    fields: [couponUsages.couponId],
    references: [coupons.id],
  }),
  user: one(users, {
    fields: [couponUsages.userId],
    references: [users.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Coupon = typeof coupons.$inferSelect;
export type NewCoupon = typeof coupons.$inferInsert;
export type CouponUsage = typeof couponUsages.$inferSelect;
export type NewCouponUsage = typeof couponUsages.$inferInsert;
