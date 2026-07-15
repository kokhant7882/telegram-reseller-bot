/**
 * @file src/database/repositories/transaction.repository.ts
 * @description Data access layer for transactions and coupons.
 */

import { eq, desc, sql, and } from "drizzle-orm";
import type { Database } from "../db.js";
import {
  transactions,
  coupons,
  couponUsages,
  type Transaction,
  type NewTransaction,
  type Coupon,
  type NewCoupon,
  type CouponUsage,
} from "../schema/index.js";
import { getOffset, calculatePagination } from "../../utils/pagination.js";
import type { PaginatedResult } from "../../types/database.types.js";
import type { TransactionStatus } from "../../config/constants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Repository
// ─────────────────────────────────────────────────────────────────────────────

export class TransactionRepository {
  constructor(private readonly db: Database) {}

  /** Find transaction by ID */
  async findById(id: string): Promise<Transaction | null> {
    const result = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /** Find transaction by external reference (TRC20 hash, Binance prepay ID) */
  async findByReference(txReference: string): Promise<Transaction | null> {
    const result = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.txReference, txReference))
      .limit(1);
    return result[0] ?? null;
  }

  /** Create a new transaction record */
  async create(data: NewTransaction): Promise<Transaction> {
    const result = await this.db
      .insert(transactions)
      .values(data)
      .returning();
    const tx = result[0];
    if (!tx) throw new Error("Failed to create transaction");
    return tx;
  }

  /** Update transaction status */
  async updateStatus(
    id: string,
    status: TransactionStatus,
    extra?: { verifiedBy?: string; notes?: string }
  ): Promise<Transaction> {
    const result = await this.db
      .update(transactions)
      .set({
        status,
        ...extra,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id))
      .returning();

    const tx = result[0];
    if (!tx) throw new Error(`Transaction ${id} not found`);
    return tx;
  }

  /** Get user's transaction history (paginated) */
  async findByUser(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<Transaction>> {
    const offset = getOffset(page, pageSize);
    const where = eq(transactions.userId, userId);

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(desc(transactions.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(transactions)
        .where(where),
    ]);

    return {
      data,
      ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize),
    };
  }

  /** Get pending transactions (admin — payment verification queue) */
  async findPending(page: number, pageSize: number): Promise<PaginatedResult<Transaction>> {
    const offset = getOffset(page, pageSize);
    const where = eq(transactions.status, "pending");

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(desc(transactions.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(transactions)
        .where(where),
    ]);

    return {
      data,
      ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize),
    };
  }

  /** Count pending transactions */
  async countPending(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.status, "pending"));
    return result[0]?.count ?? 0;
  }

  /** Get all pending TRC20 transactions (for cron monitoring) */
  async findPendingTrc20(): Promise<Transaction[]> {
    return await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.status, "pending"),
          eq(transactions.paymentMethod, "trc20")
        )
      )
      .orderBy(desc(transactions.createdAt));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Coupon Repository
// ─────────────────────────────────────────────────────────────────────────────

export class CouponRepository {
  constructor(private readonly db: Database) {}

  /** Find active coupon by code (case-insensitive) */
  async findByCode(code: string): Promise<Coupon | null> {
    const result = await this.db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.code, code.toUpperCase()),
          eq(coupons.isActive, true)
        )
      )
      .limit(1);
    return result[0] ?? null;
  }

  /** Find coupon by ID */
  async findById(id: string): Promise<Coupon | null> {
    const result = await this.db
      .select()
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /** Create a new coupon */
  async create(data: NewCoupon): Promise<Coupon> {
    const result = await this.db
      .insert(coupons)
      .values(data)
      .returning();
    const coupon = result[0];
    if (!coupon) throw new Error("Failed to create coupon");
    return coupon;
  }

  /** Increment usedCount atomically */
  async incrementUsage(id: string): Promise<void> {
    await this.db
      .update(coupons)
      .set({ usedCount: sql`${coupons.usedCount} + 1` })
      .where(eq(coupons.id, id));
  }

  /** Deactivate a coupon */
  async deactivate(id: string): Promise<void> {
    await this.db
      .update(coupons)
      .set({ isActive: false })
      .where(eq(coupons.id, id));
  }

  /** Get all active coupons (admin view) */
  async findAll(page: number, pageSize: number): Promise<PaginatedResult<Coupon>> {
    const offset = getOffset(page, pageSize);

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(coupons)
        .orderBy(desc(coupons.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(coupons),
    ]);

    return {
      data,
      ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize),
    };
  }

  /** Check if user has already used a coupon */
  async hasUserUsed(couponId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: couponUsages.id })
      .from(couponUsages)
      .where(
        and(
          eq(couponUsages.couponId, couponId),
          eq(couponUsages.userId, userId)
        )
      )
      .limit(1);
    return result.length > 0;
  }

  /** Record coupon usage */
  async recordUsage(
    couponId: string,
    userId: string,
    orderId?: string
  ): Promise<CouponUsage> {
    const result = await this.db
      .insert(couponUsages)
      .values({ couponId, userId, orderId })
      .returning();
    const usage = result[0];
    if (!usage) throw new Error("Failed to record coupon usage");
    return usage;
  }
}
