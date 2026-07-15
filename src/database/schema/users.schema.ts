/**
 * @file src/database/schema/users.schema.ts
 * @description Drizzle ORM schemas for user-related tables.
 *
 * Tables defined here:
 *   - users        — Core user profiles
 *   - wallets      — User wallet balances
 *   - admins       — Admin accounts
 *   - resellers    — Reseller accounts
 *   - customers    — Customers created by resellers
 *   - referrals    — Referral tracking
 *   - logs         — Application event logs
 *   - settings     — Bot settings (key-value)
 */

import {
  pgTable,
  uuid,
  bigint,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  text,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/** Log level enum */
export const logLevelEnum = pgEnum("log_level", [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Users Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core users table.
 * Every Telegram user who interacts with the bot gets a record here.
 */
export const users = pgTable(
  "users",
  {
    /** Internal UUID — used as foreign key in all related tables */
    id: uuid("id").primaryKey().defaultRandom(),

    /** Telegram user ID — immutable unique identifier from Telegram */
    telegramId: bigint("telegram_id", { mode: "number" })
      .notNull()
      .unique(),

    /** Telegram username (without @) — may be null if user has no username */
    username: varchar("username", { length: 32 }),

    /** User's first name from Telegram profile */
    firstName: varchar("first_name", { length: 64 }).notNull(),

    /** User's last name from Telegram profile — may be null */
    lastName: varchar("last_name", { length: 64 }),

    /** Preferred language code: 'my' or 'en' */
    languageCode: varchar("language_code", { length: 8 })
      .notNull()
      .default("my"),

    /** Whether this user is banned from using the bot */
    isBanned: boolean("is_banned").notNull().default(false),

    /** Ban reason — only set if isBanned is true */
    banReason: text("ban_reason"),

    /** Unique referral code for this user (e.g., REF-XXXXXXXX) */
    referralCode: varchar("referral_code", { length: 20 }).notNull().unique(),

    /** ID of user who referred this user — null if no referral */
    referredBy: uuid("referred_by"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Index for fast telegram ID lookup (most common query)
    telegramIdIdx: uniqueIndex("users_telegram_id_idx").on(table.telegramId),
    // Index for referral code lookup
    referralCodeIdx: uniqueIndex("users_referral_code_idx").on(table.referralCode),
    // Index for finding referrals by referrer
    referredByIdx: index("users_referred_by_idx").on(table.referredBy),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Wallets Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User wallets — one per user.
 * Balances are stored in MMK as integers (no floating point).
 */
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** FK to users.id */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(), // One wallet per user

    /** Current balance in MMK (integer, no decimals) */
    balance: bigint("balance", { mode: "number" }).notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("wallets_user_id_idx").on(table.userId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Admins Table
// ─────────────────────────────────────────────────────────────────────────────

/** Admin accounts linked to users */
export const admins = pgTable(
  "admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),

    /**
     * Permission level:
     *   1 = Regular admin (manage products, orders, users)
     *   2 = Super admin (everything + manage other admins)
     */
    permissionLevel: integer("permission_level").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("admins_user_id_idx").on(table.userId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Resellers Table
// ─────────────────────────────────────────────────────────────────────────────

/** Reseller accounts with commission settings */
export const resellers = pgTable(
  "resellers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),

    /**
     * Commission rate as a percentage (0-100).
     * Reseller profit = (retail price - wholesale price) * commission rate / 100
     * Default: 100 (reseller keeps the full margin between retail and wholesale)
     */
    commissionRate: integer("commission_rate").notNull().default(100),

    /** Cumulative profit earned in MMK */
    totalProfit: bigint("total_profit", { mode: "number" }).notNull().default(0),

    /** Whether the admin has approved this reseller */
    isApproved: boolean("is_approved").notNull().default(false),

    /** Admin user ID who approved this reseller */
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("resellers_user_id_idx").on(table.userId),
    isApprovedIdx: index("resellers_is_approved_idx").on(table.isApproved),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Customers Table (Reseller's customers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Customers created by resellers.
 * These are different from regular users — they represent
 * the reseller's client list.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** FK to resellers.id — which reseller manages this customer */
    resellerId: uuid("reseller_id")
      .notNull()
      .references(() => resellers.id, { onDelete: "cascade" }),

    /** The customer's Telegram user ID (if they use the bot) */
    telegramId: bigint("telegram_id", { mode: "number" }),

    /** Customer display name */
    name: varchar("name", { length: 100 }).notNull(),

    /** Contact info (phone number, telegram username, etc.) */
    contact: varchar("contact", { length: 100 }),

    /** Notes about this customer */
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    resellerIdIdx: index("customers_reseller_id_idx").on(table.resellerId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Referrals Table
// ─────────────────────────────────────────────────────────────────────────────

/** Tracks referral relationships and rewards */
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** User who shared their referral link */
    referrerId: uuid("referrer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** User who registered using the referral link */
    referredId: uuid("referred_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(), // A user can only be referred once

    /** Reward amount in MMK credited to referrer */
    rewardAmount: bigint("reward_amount", { mode: "number" }).notNull().default(0),

    /** Whether the reward has been credited to referrer's wallet */
    rewardPaid: boolean("reward_paid").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    referrerIdIdx: index("referrals_referrer_id_idx").on(table.referrerId),
    referredIdIdx: uniqueIndex("referrals_referred_id_idx").on(table.referredId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Settings Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bot settings as key-value pairs.
 * Allows admins to change configuration without redeploying.
 */
export const settings = pgTable("settings", {
  /** Setting key (e.g., "min_deposit", "maintenance_mode") */
  key: varchar("key", { length: 100 }).primaryKey(),

  /** Setting value as string (parse as needed in application) */
  value: text("value").notNull(),

  /** Human-readable description of this setting */
  description: text("description"),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Logs Table
// ─────────────────────────────────────────────────────────────────────────────

/** Application event logs for admin review */
export const logs = pgTable(
  "logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    level: logLevelEnum("level").notNull().default("info"),

    /** Short action identifier (e.g., "user.banned", "order.created") */
    action: varchar("action", { length: 100 }).notNull(),

    /** Telegram user ID (not internal UUID) for easy correlation */
    telegramUserId: bigint("telegram_user_id", { mode: "number" }),

    /** Structured additional data */
    details: jsonb("details"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    levelIdx: index("logs_level_idx").on(table.level),
    actionIdx: index("logs_action_idx").on(table.action),
    createdAtIdx: index("logs_created_at_idx").on(table.createdAt),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  wallet: one(wallets, { fields: [users.id], references: [wallets.userId] }),
  admin: one(admins, { fields: [users.id], references: [admins.userId] }),
  reseller: one(resellers, { fields: [users.id], references: [resellers.userId] }),
  referralsGiven: many(referrals, { relationName: "referrer" }),
  referralReceived: one(referrals, {
    fields: [users.id],
    references: [referrals.referredId],
    relationName: "referred",
  }),
}));

export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
}));

export const resellersRelations = relations(resellers, ({ one, many }) => ({
  user: one(users, { fields: [resellers.userId], references: [users.id] }),
  customers: many(customers),
}));

export const customersRelations = relations(customers, ({ one }) => ({
  reseller: one(resellers, {
    fields: [customers.resellerId],
    references: [resellers.id],
  }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
    relationName: "referrer",
  }),
  referred: one(users, {
    fields: [referrals.referredId],
    references: [users.id],
    relationName: "referred",
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports (Drizzle inferred types)
// ─────────────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
export type Reseller = typeof resellers.$inferSelect;
export type NewReseller = typeof resellers.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
