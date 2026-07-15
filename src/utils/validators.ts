/**
 * @file src/utils/validators.ts
 * @description Input validation using Zod schemas.
 *
 * All user input validation logic lives here.
 * Returns typed results — never throws (use .safeParse()).
 */

import { z } from "zod";
import { LIMITS } from "../config/constants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Common Validators
// ─────────────────────────────────────────────────────────────────────────────

/** Validates a positive integer amount in MMK */
export const mmkAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Amount must be a whole number")
  .transform(Number)
  .pipe(z.number().positive("Amount must be greater than 0").int());

/** Validates a positive integer quantity */
export const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Quantity must be a whole number")
  .transform(Number)
  .pipe(
    z
      .number()
      .positive("Quantity must be at least 1")
      .int()
      .max(LIMITS.ORDER_QTY_MAX, `Maximum quantity is ${LIMITS.ORDER_QTY_MAX}`)
  );

/** Validates a Telegram user ID (large positive integer) */
export const telegramIdSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Telegram ID must be a number")
  .transform(Number)
  .pipe(z.number().positive().int());

// ─────────────────────────────────────────────────────────────────────────────
// User Validators
// ─────────────────────────────────────────────────────────────────────────────

/** Validates a user's display name input */
export const userNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(64, "Name must not exceed 64 characters")
  .regex(/^[\w\s\-.']+$/, "Name contains invalid characters");

// ─────────────────────────────────────────────────────────────────────────────
// Product Validators
// ─────────────────────────────────────────────────────────────────────────────

/** Validates product creation/edit input */
export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Product name too short")
    .max(LIMITS.PRODUCT_NAME_MAX, `Name must not exceed ${LIMITS.PRODUCT_NAME_MAX} chars`),

  description: z
    .string()
    .trim()
    .max(LIMITS.PRODUCT_DESC_MAX, `Description too long`)
    .default(""),

  price: z.number().positive("Price must be positive").int(),

  wholesalePrice: z
    .number()
    .nonnegative("Wholesale price cannot be negative")
    .int(),

  stock: z.number().min(-1, "Stock must be -1 (unlimited) or a positive number").int(),

  deliveryType: z.enum(["instant", "manual"]),
}).refine(
  (data) => data.wholesalePrice <= data.price,
  { message: "Wholesale price must be less than or equal to retail price", path: ["wholesalePrice"] }
);

// ─────────────────────────────────────────────────────────────────────────────
// Coupon Validators
// ─────────────────────────────────────────────────────────────────────────────

/** Validates a coupon code input from user */
export const couponCodeSchema = z
  .string()
  .trim()
  .min(LIMITS.COUPON_CODE_MIN, `Code must be at least ${LIMITS.COUPON_CODE_MIN} characters`)
  .max(LIMITS.COUPON_CODE_MAX, `Code must not exceed ${LIMITS.COUPON_CODE_MAX} characters`)
  .regex(/^[A-Z0-9\-_]+$/i, "Code can only contain letters, numbers, hyphens, and underscores")
  .transform((code) => code.toUpperCase());

/** Validates coupon creation by admin */
export const createCouponSchema = z.object({
  code: couponCodeSchema,
  type: z.enum(["percentage", "fixed", "promo"]),
  value: z.number().positive("Value must be positive"),
  maxUses: z.number().positive().int().nullable().default(null),
  minOrderAmount: z.number().nonnegative().int().default(0),
  expiresAt: z.date().nullable().default(null),
}).refine(
  (data) => {
    if (data.type === "percentage" && data.value > 100) {
      return false;
    }
    return true;
  },
  { message: "Percentage discount cannot exceed 100%", path: ["value"] }
);

// ─────────────────────────────────────────────────────────────────────────────
// Payment Validators
// ─────────────────────────────────────────────────────────────────────────────

/** Validates a deposit amount */
export const depositAmountSchema = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, "Please enter a valid amount (numbers only)")
    .transform(Number)
    .pipe(
      z
        .number()
        .int("Amount must be a whole number")
        .min(min, `Minimum deposit is ${min.toLocaleString()} MMK`)
        .max(max, `Maximum deposit is ${max.toLocaleString()} MMK`)
    );

/** Validates a TRC20 transaction hash */
export const trc20TxHashSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{64}$/, "Invalid TRC20 transaction hash format");

// ─────────────────────────────────────────────────────────────────────────────
// Admin Validators
// ─────────────────────────────────────────────────────────────────────────────

/** Validates a broadcast message */
export const broadcastMessageSchema = z
  .string()
  .trim()
  .min(1, "Message cannot be empty")
  .max(LIMITS.BROADCAST_MSG_MAX, `Message too long (max ${LIMITS.BROADCAST_MSG_MAX} chars)`);

/** Validates bulk key import (newline-separated) */
export const bulkKeysSchema = z
  .string()
  .trim()
  .transform((input) =>
    input
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
  )
  .pipe(
    z
      .array(z.string().min(1))
      .min(1, "At least one key required")
      .max(LIMITS.KEYS_BULK_MAX, `Maximum ${LIMITS.KEYS_BULK_MAX} keys per import`)
  );

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Validate and Return Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely validate data against a Zod schema.
 * Returns { success: true, data } or { success: false, error: string }
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Return first error message
  const firstError = result.error.errors[0];
  return {
    success: false,
    error: firstError?.message ?? "Invalid input",
  };
}
