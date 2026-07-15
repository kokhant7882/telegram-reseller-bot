/**
 * @file src/types/database.types.ts
 * @description TypeScript types derived from database schema.
 *
 * These types represent the data shapes as they exist in the database.
 * They are inferred from Drizzle schema definitions (in Module 2).
 * For now, we define the interfaces manually; they will be replaced
 * with `typeof schema.$inferSelect` after schemas are created.
 */

// ─────────────────────────────────────────────────────────────────────────────
// User Types
// ─────────────────────────────────────────────────────────────────────────────

/** Full user record as stored in database */
export interface UserRecord {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  languageCode: string;
  isBanned: boolean;
  referralCode: string;
  referredBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Wallet record linked 1:1 to user */
export interface WalletRecord {
  id: string;
  userId: string;
  balance: number; // Stored in MMK (integer, no decimals)
  updatedAt: Date;
}

/** Reseller record extending user */
export interface ResellerRecord {
  id: string;
  userId: string;
  commissionRate: number; // Percentage 0-100
  totalProfit: number;
  isApproved: boolean;
  approvedBy: string | null;
  createdAt: Date;
}

/** Admin record */
export interface AdminRecord {
  id: string;
  userId: string;
  permissionLevel: number; // 1=admin, 2=super_admin
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Types
// ─────────────────────────────────────────────────────────────────────────────

/** Category record */
export interface CategoryRecord {
  id: string;
  name: string;
  icon: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
}

/** Full product record */
export interface ProductRecord {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number; // Retail price in MMK
  wholesalePrice: number; // Reseller price in MMK
  imageUrl: string | null;
  stock: number; // -1 = unlimited
  deliveryType: "instant" | "manual";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Product key (for instant delivery) */
export interface ProductKeyRecord {
  id: string;
  productId: string;
  keyValue: string;
  isUsed: boolean;
  orderId: string | null;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Types
// ─────────────────────────────────────────────────────────────────────────────

/** Full order record */
export interface OrderRecord {
  id: string;
  orderId: string; // Human-readable order ID e.g. ORD-20241015-0001
  userId: string;
  resellerId: string | null;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: "pending" | "paid" | "delivered" | "cancelled" | "refunded";
  paymentMethod: string;
  couponId: string | null;
  discountAmount: number;
  notes: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Types
// ─────────────────────────────────────────────────────────────────────────────

/** Financial transaction record */
export interface TransactionRecord {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  paymentMethod: string | null;
  txReference: string | null;
  screenshotUrl: string | null;
  status: "pending" | "approved" | "rejected" | "auto_verified";
  verifiedBy: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coupon Types
// ─────────────────────────────────────────────────────────────────────────────

/** Coupon/promo code record */
export interface CouponRecord {
  id: string;
  code: string;
  type: "percentage" | "fixed" | "promo"; // promo = free balance top-up
  value: number; // Percentage or fixed MMK amount
  maxUses: number | null; // null = unlimited
  usedCount: number;
  minOrderAmount: number;
  isActive: boolean;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

/** Tracks which users used which coupons */
export interface CouponUsageRecord {
  id: string;
  couponId: string;
  userId: string;
  orderId: string | null;
  usedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral Types
// ─────────────────────────────────────────────────────────────────────────────

/** Referral relationship record */
export interface ReferralRecord {
  id: string;
  referrerId: string;
  referredId: string;
  rewardAmount: number;
  rewardPaid: boolean;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Types
// ─────────────────────────────────────────────────────────────────────────────

/** Key-value settings record */
export interface SettingRecord {
  key: string;
  value: string;
  description: string | null;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Types
// ─────────────────────────────────────────────────────────────────────────────

/** Application log record */
export interface LogRecord {
  id: string;
  level: "info" | "warn" | "error" | "debug";
  action: string;
  userId: number | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Types
// ─────────────────────────────────────────────────────────────────────────────

/** Generic paginated result wrapper */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
