/**
 * @file src/types/payment.types.ts
 * @description TypeScript types for the payment system.
 *
 * Defines the contracts that all payment provider implementations
 * must follow via the IPaymentProvider interface.
 */

import type { PaymentMethod } from "../config/constants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Payment Intent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A payment intent created when user initiates a deposit.
 * Contains everything needed to display payment instructions.
 */
export interface PaymentIntent {
  /** Unique ID for this payment attempt */
  intentId: string;
  /** The payment method being used */
  method: PaymentMethod;
  /** Amount in MMK (for local methods) */
  amountMmk: number;
  /** Amount in USDT (for crypto methods) */
  amountUsdt?: number;
  /** USDT/MMK exchange rate at time of intent */
  usdtRate?: number;
  /** Payment destination (phone number, address, pay ID) */
  destination: string;
  /** Account name (for local bank/mobile money) */
  accountName?: string;
  /** QR code URL if available */
  qrCodeUrl?: string;
  /** Expiry timestamp for this payment intent */
  expiresAt: Date;
  /** Whether this payment can be auto-verified */
  isAutoVerify: boolean;
  /** Instructions to show user */
  instructions: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment Verification
// ─────────────────────────────────────────────────────────────────────────────

/** Result of a payment verification attempt */
export interface PaymentVerificationResult {
  /** Whether the payment is confirmed */
  isConfirmed: boolean;
  /** Amount received (may differ from expected) */
  amountReceived?: number;
  /** Transaction reference from the payment provider */
  txReference?: string;
  /** Error message if verification failed */
  error?: string;
}

/** Data submitted by user for manual payment verification */
export interface ManualPaymentProof {
  /** The payment intent this proof is for */
  intentId: string;
  /** Screenshot file ID (Telegram file_id) */
  screenshotFileId?: string;
  /** Transaction reference/hash */
  txReference?: string;
  /** Additional notes from user */
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment Provider Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contract that every payment provider must implement.
 * Use this interface for dependency injection in PaymentService.
 */
export interface IPaymentProvider {
  /** Unique identifier for this payment method */
  readonly method: PaymentMethod;

  /** Human-readable name */
  readonly name: string;

  /** Whether this provider is enabled */
  readonly isEnabled: boolean;

  /** Whether this provider supports automatic verification */
  readonly supportsAutoVerify: boolean;

  /**
   * Create a payment intent for a deposit.
   * @param userId - Internal user ID
   * @param amountMmk - Amount to deposit in MMK
   */
  createIntent(userId: string, amountMmk: number): Promise<PaymentIntent>;

  /**
   * Verify a payment (auto-verify providers only).
   * @param intentId - The payment intent to verify
   * @param txReference - Transaction reference from provider
   */
  verifyPayment?(
    intentId: string,
    txReference: string
  ): Promise<PaymentVerificationResult>;

  /**
   * Handle webhook callback from payment provider.
   * Called by the Vercel webhook endpoint.
   * @param payload - Raw webhook payload
   */
  handleWebhook?(payload: unknown): Promise<PaymentVerificationResult | null>;

  /**
   * Monitor for incoming payments (for TRC20 polling).
   * Called by the Vercel cron job.
   */
  pollPendingPayments?(): Promise<PaymentVerificationResult[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binance Pay Types
// ─────────────────────────────────────────────────────────────────────────────

/** Binance Pay order creation response */
export interface BinancePayOrder {
  status: string;
  code: string;
  data: {
    prepayId: string;
    terminalType: string;
    expireTime: number;
    qrcodeLink: string;
    qrContent: string;
    checkoutUrl: string;
    deeplink: string;
    universalUrl: string;
  };
}

/** Binance Pay webhook notification */
export interface BinanceWebhookPayload {
  bizType: "PAY";
  bizId: string;
  bizStatus: "PAY_SUCCESS" | "PAY_CLOSED";
  data: string; // JSON string
}

// ─────────────────────────────────────────────────────────────────────────────
// TRC20 Types
// ─────────────────────────────────────────────────────────────────────────────

/** TronGrid transaction record */
export interface TronTransaction {
  transaction_id: string;
  token_info: {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
  };
  from: string;
  to: string;
  type: string;
  value: string; // Raw amount (divide by 10^decimals for actual value)
  block_timestamp: number;
}

/** Pending TRC20 payment stored in Redis */
export interface PendingTrc20Payment {
  intentId: string;
  userId: string;
  amountUsdt: number;
  amountMmk: number;
  walletAddress: string;
  createdAt: number; // Unix timestamp
  expiresAt: number; // Unix timestamp
}
