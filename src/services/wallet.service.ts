/**
 * @file src/services/wallet.service.ts
 * @description Wallet management and deposit processing.
 */

import { WalletRepository } from "../database/repositories/user.repository.js";
import { TransactionRepository } from "../database/repositories/transaction.repository.js";
import type { Wallet, Transaction } from "../database/schema/index.js";
import type { PaginatedResult } from "../types/database.types.js";
import {
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
} from "../config/constants.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("wallet-service");

export class WalletService {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly txRepo: TransactionRepository
  ) {}

  /** Get wallet by user ID */
  async getWallet(userId: string): Promise<Wallet | null> {
    return this.walletRepo.findByUserId(userId);
  }

  /** Get transaction history (paginated) */
  async getHistory(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<Transaction>> {
    return this.txRepo.findByUser(userId, page, pageSize);
  }

  /**
   * Submit a manual deposit proof for admin review.
   * Creates a pending transaction record.
   */
  async submitDepositProof(params: {
    userId: string;
    amountMmk: number;
    paymentMethod: string;
    txReference?: string;
    screenshotFileId?: string;
  }): Promise<Transaction> {
    const wallet = await this.walletRepo.findByUserId(params.userId);
    if (!wallet) throw new Error("Wallet not found");

    const tx = await this.txRepo.create({
      userId: params.userId,
      type: TRANSACTION_TYPE.DEPOSIT,
      amount: params.amountMmk,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // Will be updated when approved
      paymentMethod: params.paymentMethod,
      txReference: params.txReference ?? null,
      screenshotFileId: params.screenshotFileId ?? null,
      status: TRANSACTION_STATUS.PENDING,
    });

    log.info(
      { userId: params.userId, amount: params.amountMmk, method: params.paymentMethod },
      "Deposit proof submitted"
    );

    return tx;
  }

  /**
   * Admin approves a pending deposit.
   * Credits wallet and updates transaction status.
   */
  async approveDeposit(
    transactionId: string,
    adminId: string
  ): Promise<{ transaction: Transaction; wallet: Wallet }> {
    const tx = await this.txRepo.findById(transactionId);
    if (!tx) throw new Error("Transaction not found");
    if (tx.status !== TRANSACTION_STATUS.PENDING) {
      throw new Error("Transaction is not pending");
    }

    // Get current wallet balance (may have changed since tx was created)
    const wallet = await this.walletRepo.findByUserId(tx.userId);
    if (!wallet) throw new Error("Wallet not found");

    // Credit wallet
    const updatedWallet = await this.walletRepo.adjustBalance(
      tx.userId,
      tx.amount
    );

    // Update transaction with actual balance values
    const updatedTx = await this.txRepo.updateStatus(
      transactionId,
      TRANSACTION_STATUS.APPROVED,
      { verifiedBy: adminId }
    );

    // Patch balance fields in transaction
    await this.txRepo.updateStatus(transactionId, TRANSACTION_STATUS.APPROVED, {
      verifiedBy: adminId,
    });

    log.info({ transactionId, adminId, amount: tx.amount }, "Deposit approved");

    return { transaction: updatedTx, wallet: updatedWallet };
  }

  /**
   * Admin rejects a pending deposit.
   */
  async rejectDeposit(
    transactionId: string,
    adminId: string,
    reason: string
  ): Promise<Transaction> {
    const tx = await this.txRepo.findById(transactionId);
    if (!tx) throw new Error("Transaction not found");
    if (tx.status !== TRANSACTION_STATUS.PENDING) {
      throw new Error("Transaction is not pending");
    }

    const updated = await this.txRepo.updateStatus(
      transactionId,
      TRANSACTION_STATUS.REJECTED,
      { verifiedBy: adminId, notes: reason }
    );

    log.info({ transactionId, adminId, reason }, "Deposit rejected");
    return updated;
  }

  /**
   * Auto-approve deposit (for Binance Pay / TRC20).
   * Skips admin verification step.
   */
  async autoApproveDeposit(
    transactionId: string,
    txReference: string
  ): Promise<{ transaction: Transaction; wallet: Wallet }> {
    const tx = await this.txRepo.findById(transactionId);
    if (!tx) throw new Error("Transaction not found");

    const wallet = await this.walletRepo.findByUserId(tx.userId);
    if (!wallet) throw new Error("Wallet not found");

    const updatedWallet = await this.walletRepo.adjustBalance(tx.userId, tx.amount);

    const updatedTx = await this.txRepo.updateStatus(
      transactionId,
      TRANSACTION_STATUS.AUTO_VERIFIED,
      { notes: `Auto-verified. Ref: ${txReference}` }
    );

    log.info({ transactionId, txReference, amount: tx.amount }, "Deposit auto-approved");

    return { transaction: updatedTx, wallet: updatedWallet };
  }

  /**
   * Admin manually adjusts a user's wallet balance.
   */
  async adminAdjust(
    userId: string,
    amount: number,
    adminId: string,
    notes?: string
  ): Promise<Wallet> {
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) throw new Error("Wallet not found");

    const updated = await this.walletRepo.adjustBalance(userId, amount);

    await this.txRepo.create({
      userId,
      type: TRANSACTION_TYPE.ADMIN_ADJUSTMENT,
      amount,
      balanceBefore: wallet.balance,
      balanceAfter: updated.balance,
      paymentMethod: "admin",
      status: TRANSACTION_STATUS.AUTO_VERIFIED,
      verifiedBy: adminId,
      notes: notes ?? `Admin adjustment`,
    });

    log.info({ userId, amount, adminId }, "Admin wallet adjustment");
    return updated;
  }

  /** Get all pending transactions (for admin review queue) */
  async getPendingDeposits(
    page: number,
    pageSize: number
  ) {
    return this.txRepo.findPending(page, pageSize);
  }

  async getPendingCount(): Promise<number> {
    return this.txRepo.countPending();
  }

  /** Get TRC20 pending transactions (for cron monitoring) */
  async getPendingTrc20(): Promise<Transaction[]> {
    return this.txRepo.findPendingTrc20();
  }
}
