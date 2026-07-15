/**
 * @file src/services/user.service.ts
 * @description Business logic for user management.
 *
 * Orchestrates: UserRepository + WalletRepository + ReferralRepository
 * Handles: registration, profile, ban/unban, referral rewards
 */

import {
  UserRepository,
  WalletRepository,
  AdminRepository,
  ResellerRepository,
  ReferralRepository,
} from "../database/repositories/user.repository.js";
import type { User, Wallet } from "../database/schema/index.js";
import type { PaginatedResult } from "../types/database.types.js";
import { generateReferralCode } from "../utils/helpers.js";
import { createLogger } from "../utils/logger.js";
import { env } from "../config/env.js";

const log = createLogger("user-service");

export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly walletRepo: WalletRepository,
    private readonly adminRepo: AdminRepository,
    private readonly resellerRepo: ResellerRepository,
    private readonly referralRepo: ReferralRepository
  ) {}

  // ────────────────────────────────────────────────────────────────────────
  // Registration
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Register a new user and create their wallet.
   * Also processes referral reward if a valid referral code was provided.
   */
  async register(params: {
    telegramId: number;
    username?: string;
    firstName: string;
    lastName?: string;
    languageCode?: string;
    referralCode?: string;
  }): Promise<{ user: User; wallet: Wallet; isNew: boolean }> {
    // Check if already registered
    const existing = await this.userRepo.findByTelegramId(params.telegramId);
    if (existing) {
      const wallet = await this.walletRepo.findByUserId(existing.id);
      return { user: existing, wallet: wallet!, isNew: false };
    }

    // Validate referral code
    let referredByUser: User | null = null;
    if (params.referralCode) {
      referredByUser = await this.userRepo.findByReferralCode(params.referralCode);
      if (!referredByUser || referredByUser.telegramId === params.telegramId) {
        referredByUser = null; // Invalid or self-referral
      }
    }

    // Create user
    const user = await this.userRepo.create({
      telegramId: params.telegramId,
      username: params.username ?? null,
      firstName: params.firstName,
      lastName: params.lastName ?? null,
      languageCode: params.languageCode ?? env.DEFAULT_LANGUAGE,
      referralCode: generateReferralCode(),
      referredBy: referredByUser?.id ?? null,
      isBanned: false,
    });

    // Create wallet
    const wallet = await this.walletRepo.create(user.id);

    // Process referral reward
    if (referredByUser) {
      await this.processReferralReward(referredByUser, user);
    }

    log.info({ telegramId: params.telegramId }, "New user registered");
    return { user, wallet, isNew: true };
  }

  /** Credit referral reward to referrer */
  private async processReferralReward(
    referrer: User,
    newUser: User
  ): Promise<void> {
    const reward = env.REFERRAL_REWARD_AMOUNT;
    if (reward <= 0) return;

    await this.referralRepo.create(referrer.id, newUser.id, reward);
    await this.walletRepo.adjustBalance(referrer.id, reward);

    log.info(
      { referrerId: referrer.id, newUserId: newUser.id, reward },
      "Referral reward processed"
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Profile
  // ────────────────────────────────────────────────────────────────────────

  /** Get user by Telegram ID (returns null if not found) */
  async findByTelegramId(telegramId: number): Promise<User | null> {
    return this.userRepo.findByTelegramId(telegramId);
  }

  /** Get user profile with wallet and statistics */
  async getProfile(userId: string): Promise<{
    user: User;
    wallet: Wallet;
    stats: { totalOrders: number; totalSpent: number; referralCount: number };
  }> {
    const [user, wallet] = await Promise.all([
      this.userRepo.findById(userId),
      this.walletRepo.findByUserId(userId),
    ]);

    if (!user || !wallet) throw new Error("User or wallet not found");

    const [totalOrders, totalSpent, referralCount] = await Promise.all([
      this.getOrderCount(userId),
      this.getTotalSpend(userId),
      this.referralRepo.countByReferrer(userId),
    ]);

    return {
      user,
      wallet,
      stats: { totalOrders, totalSpent, referralCount },
    };
  }

  /** Placeholder — injected by OrderService to avoid circular deps */
  async getOrderCount(_userId: string): Promise<number> {
    return 0;
  }

  async getTotalSpend(_userId: string): Promise<number> {
    return 0;
  }

  /** Update user language */
  async setLanguage(userId: string, lang: "my" | "en"): Promise<void> {
    await this.userRepo.update(userId, { languageCode: lang });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Role Checks
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Get user role: super_admin → admin → reseller → user
   * Also checks hardcoded admin IDs from environment.
   */
  async getRole(
    telegramId: number,
    userId: string
  ): Promise<"user" | "reseller" | "admin" | "super_admin"> {
    // Hardcoded super admins from env
    if (env.ADMIN_IDS.includes(telegramId)) return "super_admin";

    const [adminRecord, resellerRecord] = await Promise.all([
      this.adminRepo.findByUserId(userId),
      this.resellerRepo.findByUserId(userId),
    ]);

    if (adminRecord) {
      return adminRecord.permissionLevel >= 2 ? "super_admin" : "admin";
    }
    if (resellerRecord?.isApproved) return "reseller";
    return "user";
  }

  // ────────────────────────────────────────────────────────────────────────
  // Admin Operations
  // ────────────────────────────────────────────────────────────────────────

  async banUser(userId: string, reason: string): Promise<void> {
    await this.userRepo.ban(userId, reason);
    log.warn({ userId, reason }, "User banned");
  }

  async unbanUser(userId: string): Promise<void> {
    await this.userRepo.unban(userId);
    log.info({ userId }, "User unbanned");
  }

  async getAllUsers(
    page: number,
    pageSize: number,
    search?: string
  ): Promise<PaginatedResult<User>> {
    return this.userRepo.findAll(page, pageSize, search);
  }

  async getAllTelegramIds(): Promise<number[]> {
    return this.userRepo.getAllTelegramIds();
  }

  async getTotalCount(): Promise<number> {
    return this.userRepo.count();
  }

  async getTodayCount(): Promise<number> {
    return this.userRepo.countToday();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Referral
  // ────────────────────────────────────────────────────────────────────────

  async getReferralStats(userId: string): Promise<{
    count: number;
    earned: number;
    referralCode: string;
  }> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new Error("User not found");

    const [count, earned] = await Promise.all([
      this.referralRepo.countByReferrer(userId),
      this.referralRepo.totalEarned(userId),
    ]);

    return { count, earned, referralCode: user.referralCode };
  }
}
