/**
 * @file src/database/repositories/user.repository.ts
 * @description Data access layer for users, wallets, admins, and resellers.
 *
 * Repository Pattern:
 *   - All raw SQL/Drizzle queries live here
 *   - Service layer calls repositories — never queries DB directly
 *   - Methods are async and return typed results
 */

import { eq, desc, sql, and } from "drizzle-orm";
import type { Database } from "../db.js";
import {
  users,
  wallets,
  admins,
  resellers,
  referrals,
  type User,
  type NewUser,
  type Wallet,
  type Reseller,
  type Admin,
  type Referral,
} from "../schema/index.js";
import { getOffset, calculatePagination } from "../../utils/pagination.js";
import type { PaginatedResult } from "../../types/database.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// User Repository
// ─────────────────────────────────────────────────────────────────────────────

export class UserRepository {
  constructor(private readonly db: Database) {}

  /** Find a user by their Telegram ID (most common lookup) */
  async findByTelegramId(telegramId: number): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    return result[0] ?? null;
  }

  /** Find a user by their internal UUID */
  async findById(id: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  /** Find a user by referral code */
  async findByReferralCode(code: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.referralCode, code.toUpperCase()))
      .limit(1);

    return result[0] ?? null;
  }

  /** Find a user by Telegram username (without @) */
  async findByUsername(username: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username.replace("@", "")))
      .limit(1);

    return result[0] ?? null;
  }

  /** Create a new user record */
  async create(data: NewUser): Promise<User> {
    const result = await this.db
      .insert(users)
      .values(data)
      .returning();

    const user = result[0];
    if (!user) throw new Error("Failed to create user");
    return user;
  }

  /** Update user fields */
  async update(id: string, data: Partial<NewUser>): Promise<User> {
    const result = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    const user = result[0];
    if (!user) throw new Error(`User ${id} not found`);
    return user;
  }

  /** Ban a user */
  async ban(id: string, reason: string): Promise<void> {
    await this.db
      .update(users)
      .set({ isBanned: true, banReason: reason, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  /** Unban a user */
  async unban(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ isBanned: false, banReason: null, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  /** Get total user count */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    return result[0]?.count ?? 0;
  }

  /** Get paginated list of all users with optional search */
  async findAll(
    page: number,
    pageSize: number,
    search?: string
  ): Promise<PaginatedResult<User>> {
    const offset = getOffset(page, pageSize);

    const whereClause = search
      ? sql`(${users.username} ILIKE ${`%${search}%`} OR ${users.firstName} ILIKE ${`%${search}%`} OR ${sql`${users.telegramId}::text`} LIKE ${`%${search}%`})`
      : undefined;

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset),

      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return { data, ...calculatePagination(total, page, pageSize) };
  }

  async getAllTelegramIds(): Promise<number[]> {
    const query = this.db
      .select({ telegramId: users.telegramId })
      .from(users)
      .where(eq(users.isBanned, false));

    const result = await query;
    return result.map((r) => r.telegramId);
  }

  /** Get today's new user count */
  async countToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.createdAt} >= ${today}`);

    return result[0]?.count ?? 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet Repository
// ─────────────────────────────────────────────────────────────────────────────

export class WalletRepository {
  constructor(private readonly db: Database) {}

  /** Get wallet by user ID */
  async findByUserId(userId: string): Promise<Wallet | null> {
    const result = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    return result[0] ?? null;
  }

  /** Create a wallet for a new user (balance starts at 0) */
  async create(userId: string): Promise<Wallet> {
    const result = await this.db
      .insert(wallets)
      .values({ userId, balance: 0 })
      .returning();

    const wallet = result[0];
    if (!wallet) throw new Error("Failed to create wallet");
    return wallet;
  }

  /**
   * Update wallet balance.
   * Uses Postgres arithmetic to avoid race conditions.
   *
   * @param userId - User's internal ID
   * @param delta - Positive = credit, negative = debit
   */
  async adjustBalance(userId: string, delta: number): Promise<Wallet> {
    const result = await this.db
      .update(wallets)
      .set({
        balance: sql`${wallets.balance} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId))
      .returning();

    const wallet = result[0];
    if (!wallet) throw new Error(`Wallet not found for user ${userId}`);
    return wallet;
  }

  /** Set wallet balance to an exact amount (admin action) */
  async setBalance(userId: string, amount: number): Promise<Wallet> {
    const result = await this.db
      .update(wallets)
      .set({ balance: amount, updatedAt: new Date() })
      .where(eq(wallets.userId, userId))
      .returning();

    const wallet = result[0];
    if (!wallet) throw new Error(`Wallet not found for user ${userId}`);
    return wallet;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Repository
// ─────────────────────────────────────────────────────────────────────────────

export class AdminRepository {
  constructor(private readonly db: Database) {}

  /** Check if a user is an admin */
  async findByUserId(userId: string): Promise<Admin | null> {
    const result = await this.db
      .select()
      .from(admins)
      .where(eq(admins.userId, userId))
      .limit(1);

    return result[0] ?? null;
  }

  /** Add a new admin */
  async create(userId: string, permissionLevel = 1): Promise<Admin> {
    const result = await this.db
      .insert(admins)
      .values({ userId, permissionLevel })
      .returning();

    const admin = result[0];
    if (!admin) throw new Error("Failed to create admin");
    return admin;
  }

  /** Remove admin status */
  async delete(userId: string): Promise<void> {
    await this.db.delete(admins).where(eq(admins.userId, userId));
  }

  /** Get all admins with user info */
  async findAll(): Promise<Admin[]> {
    return await this.db.select().from(admins);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reseller Repository
// ─────────────────────────────────────────────────────────────────────────────

export class ResellerRepository {
  constructor(private readonly db: Database) {}

  /** Find reseller by user ID */
  async findByUserId(userId: string): Promise<Reseller | null> {
    const result = await this.db
      .select()
      .from(resellers)
      .where(eq(resellers.userId, userId))
      .limit(1);

    return result[0] ?? null;
  }

  /** Find reseller by internal ID */
  async findById(id: string): Promise<Reseller | null> {
    const result = await this.db
      .select()
      .from(resellers)
      .where(eq(resellers.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  /** Create a new reseller application */
  async create(userId: string): Promise<Reseller> {
    const result = await this.db
      .insert(resellers)
      .values({ userId, isApproved: false })
      .returning();

    const reseller = result[0];
    if (!reseller) throw new Error("Failed to create reseller");
    return reseller;
  }

  /** Approve reseller */
  async approve(id: string, approvedBy: string): Promise<Reseller> {
    const result = await this.db
      .update(resellers)
      .set({ isApproved: true, approvedBy })
      .where(eq(resellers.id, id))
      .returning();

    const reseller = result[0];
    if (!reseller) throw new Error(`Reseller ${id} not found`);
    return reseller;
  }

  /** Update commission rate */
  async updateCommission(id: string, rate: number): Promise<void> {
    await this.db
      .update(resellers)
      .set({ commissionRate: rate })
      .where(eq(resellers.id, id));
  }

  /** Add profit to reseller's total */
  async addProfit(id: string, amount: number): Promise<void> {
    await this.db
      .update(resellers)
      .set({ totalProfit: sql`${resellers.totalProfit} + ${amount}` })
      .where(eq(resellers.id, id));
  }

  /** Get all approved resellers (paginated) */
  async findApproved(page: number, pageSize: number): Promise<PaginatedResult<Reseller>> {
    const offset = getOffset(page, pageSize);
    const where = eq(resellers.isApproved, true);

    const [data, countResult] = await Promise.all([
      this.db.select().from(resellers).where(where).orderBy(desc(resellers.totalProfit)).limit(pageSize).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(resellers).where(where),
    ]);

    return { data, ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize) };
  }

  /** Get pending reseller applications */
  async findPending(): Promise<Reseller[]> {
    return await this.db
      .select()
      .from(resellers)
      .where(eq(resellers.isApproved, false))
      .orderBy(desc(resellers.createdAt));
  }

  /** Count approved resellers */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(resellers)
      .where(eq(resellers.isApproved, true));
    return result[0]?.count ?? 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral Repository
// ─────────────────────────────────────────────────────────────────────────────

export class ReferralRepository {
  constructor(private readonly db: Database) {}

  /** Create a new referral record */
  async create(referrerId: string, referredId: string, rewardAmount: number): Promise<Referral> {
    const result = await this.db
      .insert(referrals)
      .values({ referrerId, referredId, rewardAmount, rewardPaid: false })
      .returning();

    const referral = result[0];
    if (!referral) throw new Error("Failed to create referral");
    return referral;
  }

  /** Mark referral reward as paid */
  async markPaid(id: string): Promise<void> {
    await this.db
      .update(referrals)
      .set({ rewardPaid: true })
      .where(eq(referrals.id, id));
  }

  /** Count how many people a user referred */
  async countByReferrer(referrerId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals)
      .where(eq(referrals.referrerId, referrerId));
    return result[0]?.count ?? 0;
  }

  /** Get total reward earned by referrer */
  async totalEarned(referrerId: string): Promise<number> {
    const result = await this.db
      .select({ total: sql<number>`coalesce(sum(${referrals.rewardAmount}), 0)::int` })
      .from(referrals)
      .where(and(eq(referrals.referrerId, referrerId), eq(referrals.rewardPaid, true)));
    return result[0]?.total ?? 0;
  }
}
