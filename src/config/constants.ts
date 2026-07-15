/**
 * @file src/config/constants.ts
 * @description Application-wide constants.
 *
 * Centralized place for all magic strings, limits, and enumerations.
 * Using const enums and frozen objects to prevent accidental mutations.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Order Status
// ─────────────────────────────────────────────────────────────────────────────

/** All possible states an order can be in */
export const ORDER_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Types & Status
// ─────────────────────────────────────────────────────────────────────────────

/** Types of wallet transactions */
export const TRANSACTION_TYPE = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  PURCHASE: "purchase",
  REFUND: "refund",
  REFERRAL_REWARD: "referral_reward",
  ADMIN_ADJUSTMENT: "admin_adjustment",
  RESELLER_COMMISSION: "reseller_commission",
} as const;

export type TransactionType =
  (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

/** Payment/transaction verification status */
export const TRANSACTION_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  AUTO_VERIFIED: "auto_verified",
} as const;

export type TransactionStatus =
  (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];

// ─────────────────────────────────────────────────────────────────────────────
// Payment Methods
// ─────────────────────────────────────────────────────────────────────────────

/** Supported payment providers */
export const PAYMENT_METHOD = {
  KBZPAY: "kbzpay",
  WAVEPAY: "wavepay",
  AYAPAY: "ayapay",
  BINANCE: "binance",
  TRC20: "trc20",
  WALLET: "wallet", // Internal wallet balance
} as const;

export type PaymentMethod =
  (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

/** Human-readable display names for payment methods */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  kbzpay: "🏦 KBZPay",
  wavepay: "🌊 WavePay",
  ayapay: "🏛️ AYA Pay",
  binance: "🟡 Binance Pay",
  trc20: "💎 TRC20 USDT",
  wallet: "💰 Wallet Balance",
};

// ─────────────────────────────────────────────────────────────────────────────
// Delivery Types
// ─────────────────────────────────────────────────────────────────────────────

/** How products are delivered after purchase */
export const DELIVERY_TYPE = {
  INSTANT: "instant", // Key/code sent immediately from stock
  MANUAL: "manual", // Admin manually delivers
} as const;

export type DeliveryType = (typeof DELIVERY_TYPE)[keyof typeof DELIVERY_TYPE];

// ─────────────────────────────────────────────────────────────────────────────
// User Roles
// ─────────────────────────────────────────────────────────────────────────────

export const USER_ROLE = {
  USER: "user",
  RESELLER: "reseller",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

// ─────────────────────────────────────────────────────────────────────────────
// Cache Keys (Redis)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redis key generators — keeps cache key format consistent across the app.
 * All keys follow the pattern: namespace:identifier
 */
export const CACHE_KEYS = {
  // User cache
  user: (telegramId: number) => `user:${telegramId}`,
  userWallet: (userId: string) => `wallet:${userId}`,

  // Product cache
  products: (page: number) => `products:page:${page}`,
  product: (id: string) => `product:${id}`,
  categories: () => "categories:all",

  // Session data
  session: (telegramId: number) => `session:${telegramId}`,

  // Rate limiting
  rateLimit: (telegramId: number) => `ratelimit:${telegramId}`,

  // Bot settings
  settings: () => "settings:all",

  // Pending payments (for TRC20 monitoring)
  pendingTrc20: () => "payments:trc20:pending",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Cache TTL (Time-To-Live) in seconds
// ─────────────────────────────────────────────────────────────────────────────

export const CACHE_TTL = {
  USER: 300, // 5 minutes
  PRODUCT: 600, // 10 minutes
  CATEGORIES: 3600, // 1 hour
  SETTINGS: 1800, // 30 minutes
  SESSION: 86400, // 24 hours
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 5,
  MAX_PAGE_SIZE: 10,
  PRODUCTS_PER_PAGE: 6,
  ORDERS_PER_PAGE: 5,
  USERS_PER_PAGE: 8,
  ADMIN_PER_PAGE: 8,
  LOGS_PER_PAGE: 10,
} as const;


// ─────────────────────────────────────────────────────────────────────────────
// Callback Query Prefixes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prefix constants for callback query data.
 * Keeps inline keyboard callback data organized and collision-free.
 *
 * Format: PREFIX:action:param1:param2
 */
export const CB = {
  // Navigation
  NAV_HOME: "nav:home",
  NAV_BACK: "nav:back",
  NAV_REFRESH: "nav:refresh",

  // User panel
  USER_PROFILE: "user:profile",
  USER_WALLET: "user:wallet",
  USER_DEPOSIT: "user:deposit",
  USER_HISTORY: "user:history",
  USER_PRODUCTS: "user:products",
  USER_ORDERS: "user:orders",
  USER_REFERRAL: "user:referral",
  USER_REDEEM: "user:redeem",
  USER_SUPPORT: "user:support",
  USER_NOTIFICATIONS: "user:notifications",
  USER_LANGUAGE: "user:language",

  // Payment prefixes
  PAY_METHOD: "pay:method", // pay:method:kbzpay
  PAY_CONFIRM: "pay:confirm",
  PAY_CANCEL: "pay:cancel",

  // Product prefixes
  PROD_CAT: "prod:cat", // prod:cat:categoryId
  PROD_VIEW: "prod:view", // prod:view:productId
  PROD_BUY: "prod:buy", // prod:buy:productId

  // Order prefixes
  ORDER_VIEW: "order:view", // order:view:orderId
  ORDER_CANCEL: "order:cancel",

  // Admin prefixes
  ADMIN_DASHBOARD: "admin:dashboard",
  ADMIN_PRODUCTS: "admin:products",
  ADMIN_ADD_PRODUCT: "admin:product:add",
  ADMIN_EDIT_PRODUCT: "admin:product:edit",
  ADMIN_DELETE_PRODUCT: "admin:product:delete",
  ADMIN_ORDERS: "admin:orders",
  ADMIN_USERS: "admin:users",
  ADMIN_RESELLERS: "admin:resellers",
  ADMIN_STATS: "admin:stats",
  ADMIN_COUPONS: "admin:coupons",
  ADMIN_BROADCAST: "admin:broadcast",
  ADMIN_SETTINGS: "admin:settings",
  ADMIN_LOGS: "admin:logs",
  ADMIN_APPROVE: "admin:approve",
  ADMIN_REJECT: "admin:reject",
  ADMIN_BAN: "admin:ban",
  ADMIN_UNBAN: "admin:unban",
  ADMIN_REFUND: "admin:refund",

  // Reseller prefixes
  RESELLER_DASHBOARD: "reseller:dashboard",
  RESELLER_CUSTOMERS: "reseller:customers",
  RESELLER_SELL: "reseller:sell",
  RESELLER_WALLET: "reseller:wallet",
  RESELLER_REPORTS: "reseller:reports",

  // Pagination
  PAGE: "page", // page:type:pageNumber

  // Confirm dialog
  CONFIRM_YES: "confirm:yes",
  CONFIRM_NO: "confirm:no",

  // Language
  LANG_MY: "lang:my",
  LANG_EN: "lang:en",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Validation Limits
// ─────────────────────────────────────────────────────────────────────────────

export const LIMITS = {
  /** Max product name length */
  PRODUCT_NAME_MAX: 100,
  /** Max product description length */
  PRODUCT_DESC_MAX: 2000,
  /** Max coupon code length */
  COUPON_CODE_MAX: 20,
  /** Min coupon code length */
  COUPON_CODE_MIN: 4,
  /** Max broadcast message length */
  BROADCAST_MSG_MAX: 4096,
  /** Max support message length */
  SUPPORT_MSG_MAX: 1000,
  /** Max quantity per order */
  ORDER_QTY_MAX: 100,
  /** Max keys per bulk import */
  KEYS_BULK_MAX: 500,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Emoji Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Consistent emoji usage across all messages */
export const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  LOADING: "⏳",
  MONEY: "💰",
  PRODUCT: "📦",
  ORDER: "🧾",
  USER: "👤",
  ADMIN: "👑",
  RESELLER: "🏪",
  WALLET: "💳",
  DEPOSIT: "➕",
  STATS: "📊",
  BELL: "🔔",
  KEY: "🔑",
  LOCK: "🔒",
  BACK: "◀️",
  HOME: "🏠",
  REFRESH: "🔄",
  SEARCH: "🔍",
  BAN: "🚫",
  GIFT: "🎁",
} as const;
