/**
 * @file src/services/order.service.ts
 * @description Business logic for order processing.
 *
 * Handles the complete purchase flow:
 *   1. Validate stock
 *   2. Apply coupon
 *   3. Deduct wallet / create payment
 *   4. Create order record
 *   5. Handle instant delivery (assign key)
 *   6. Notify user
 */

import { OrderRepository } from "../database/repositories/order.repository.js";
import {
  ProductRepository,
  ProductKeyRepository,
} from "../database/repositories/product.repository.js";
import { WalletRepository } from "../database/repositories/user.repository.js";
import { TransactionRepository, CouponRepository } from "../database/repositories/transaction.repository.js";
import type { Order, Product, Coupon } from "../database/schema/index.js";
import type { PaginatedResult } from "../types/database.types.js";
import {
  ORDER_STATUS,
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  type OrderStatus,
} from "../config/constants.js";
import { generateOrderId } from "../utils/helpers.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("order-service");

// ─────────────────────────────────────────────────────────────────────────────
// Order Purchase Result
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseResult {
  order: Order;
  deliveryData?: string | undefined; // Set if instant delivery
  isInstant: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Service
// ─────────────────────────────────────────────────────────────────────────────

export class OrderService {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly productRepo: ProductRepository,
    private readonly keyRepo: ProductKeyRepository,
    private readonly walletRepo: WalletRepository,
    private readonly txRepo: TransactionRepository,
    private readonly couponRepo: CouponRepository
  ) {}

  /**
   * Calculate the total price for an order, applying coupon if provided.
   */
  async calculateTotal(
    product: Product,
    quantity: number,
    couponCode?: string,
    isReseller = false
  ): Promise<{
    unitPrice: number;
    subtotal: number;
    discountAmount: number;
    total: number;
    coupon?: Coupon;
  }> {
    const unitPrice = isReseller ? product.wholesalePrice : product.price;
    const subtotal = unitPrice * quantity;

    let discountAmount = 0;
    let coupon: Coupon | undefined;

    if (couponCode) {
      coupon = await this.couponRepo.findByCode(couponCode) ?? undefined;
      if (coupon && coupon.isActive) {
        if (subtotal >= Number(coupon.minOrderAmount)) {
          if (coupon.type === "percentage") {
            discountAmount = Math.round((subtotal * Number(coupon.value)) / 100);
          } else if (coupon.type === "fixed") {
            discountAmount = Math.min(Number(coupon.value), subtotal);
          }
        }
      }
    }

    return {
      unitPrice,
      subtotal,
      discountAmount,
      total: subtotal - discountAmount,
      ...(coupon ? { coupon } : {}),
    };
  }

  /**
   * Process a wallet-paid purchase.
   * Atomically: check balance → deduct → create order → deliver key
   */
  async purchaseWithWallet(params: {
    userId: string;
    productId: string;
    quantity: number;
    couponCode?: string;
    resellerId?: string;
    isReseller?: boolean;
  }): Promise<PurchaseResult> {
    const { userId, productId, quantity, couponCode, resellerId, isReseller = false } = params;

    // 1. Get product
    const product = await this.productRepo.findById(productId);
    if (!product || !product.isActive) {
      throw new Error("Product not found or unavailable");
    }

    // 2. Check stock
    if (product.stock !== -1 && product.stock < quantity) {
      throw new Error(`Insufficient stock. Available: ${product.stock}`);
    }

    // 3. Calculate total
    const pricing = await this.calculateTotal(product, quantity, couponCode, isReseller);

    // 4. Check wallet balance
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet || wallet.balance < pricing.total) {
      throw new Error(
        `Insufficient wallet balance. Required: ${pricing.total}, Available: ${wallet?.balance ?? 0}`
      );
    }

    // 5. Deduct wallet
    const updatedWallet = await this.walletRepo.adjustBalance(userId, -pricing.total);

    // 6. Create transaction record
    await this.txRepo.create({
      userId,
      type: TRANSACTION_TYPE.PURCHASE,
      amount: -pricing.total,
      balanceBefore: wallet.balance,
      balanceAfter: updatedWallet.balance,
      paymentMethod: "wallet",
      status: TRANSACTION_STATUS.AUTO_VERIFIED,
    });

    // 7. Create order
    const orderId = generateOrderId();
    const order = await this.orderRepo.create({
      orderId,
      userId,
      resellerId: resellerId ?? null,
      productId,
      quantity,
      unitPrice: pricing.unitPrice,
      totalPrice: pricing.total,
      status: ORDER_STATUS.PAID,
      paymentMethod: "wallet",
      couponId: pricing.coupon?.id ?? null,
      discountAmount: pricing.discountAmount,
    });

    // 8. Record coupon usage
    if (pricing.coupon) {
      await this.couponRepo.recordUsage(pricing.coupon.id, userId, order.id);
      await this.couponRepo.incrementUsage(pricing.coupon.id);
    }

    // 9. Handle delivery
    let deliveryData: string | undefined;
    const isInstant = product.deliveryType === "instant";

    if (isInstant) {
      deliveryData = await this.deliverInstant(order.id, productId, quantity);
      await this.orderRepo.updateStatus(order.id, ORDER_STATUS.DELIVERED, {
        deliveryData,
        deliveredAt: new Date(),
      });
    }

    // 10. Update stock
    if (product.stock !== -1) {
      await this.productRepo.decrementStock(productId, quantity);
    }

    // 11. Sync key stock for instant products
    if (isInstant) {
      await this.productRepo.syncStockFromKeys(productId);
    }

    log.info({ orderId: order.orderId, userId, total: pricing.total }, "Order placed");

    return {
      order: { ...order, status: isInstant ? ORDER_STATUS.DELIVERED : ORDER_STATUS.PAID },
      ...(deliveryData ? { deliveryData } : {}),
      isInstant,
    };
  }

  /** Deliver instant keys for an order */
  private async deliverInstant(
    orderId: string,
    productId: string,
    quantity: number
  ): Promise<string> {
    const keys: string[] = [];

    for (let i = 0; i < quantity; i++) {
      const key = await this.keyRepo.getAvailableKey(productId);
      if (!key) throw new Error("Ran out of keys during delivery");

      await this.keyRepo.markUsed(key.id, orderId);
      keys.push(key.keyValue);
    }

    return keys.join("\n");
  }

  // ────────────────────────────────────────────────────────────────────────
  // Order Queries
  // ────────────────────────────────────────────────────────────────────────

  async getOrderById(id: string): Promise<Order | null> {
    return this.orderRepo.findById(id);
  }

  async getOrderByOrderId(orderId: string): Promise<Order | null> {
    return this.orderRepo.findByOrderId(orderId);
  }

  async getUserOrders(
    userId: string,
    page: number,
    pageSize: number,
    status?: OrderStatus
  ): Promise<PaginatedResult<Order>> {
    return this.orderRepo.findByUser(userId, page, pageSize, status);
  }

  async getResellerOrders(
    resellerId: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<Order>> {
    return this.orderRepo.findByReseller(resellerId, page, pageSize);
  }

  async getAllOrders(
    page: number,
    pageSize: number,
    status?: OrderStatus
  ): Promise<PaginatedResult<Order>> {
    return this.orderRepo.findAll(page, pageSize, status);
  }

  async getUserOrderCount(userId: string): Promise<number> {
    return this.orderRepo.userTotalOrders(userId);
  }

  async getUserTotalSpend(userId: string): Promise<number> {
    return this.orderRepo.userTotalSpend(userId);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Admin Operations
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Admin manually delivers an order.
   */
  async adminDeliver(
    orderId: string,
    deliveryData: string
  ): Promise<Order> {
    return this.orderRepo.updateStatus(orderId, ORDER_STATUS.DELIVERED, {
      deliveryData,
      deliveredAt: new Date(),
    });
  }

  /**
   * Cancel an order and refund to wallet.
   */
  async cancelOrder(orderId: string, refund = true): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error("Order not found");

    if (!["pending", "paid"].includes(order.status)) {
      throw new Error("Only pending or paid orders can be cancelled");
    }

    // Refund to wallet
    if (refund && order.totalPrice > 0) {
      const wallet = await this.walletRepo.findByUserId(order.userId);
      if (wallet) {
        const updated = await this.walletRepo.adjustBalance(order.userId, order.totalPrice);
        await this.txRepo.create({
          userId: order.userId,
          type: TRANSACTION_TYPE.REFUND,
          amount: order.totalPrice,
          balanceBefore: wallet.balance,
          balanceAfter: updated.balance,
          paymentMethod: "wallet",
          status: TRANSACTION_STATUS.AUTO_VERIFIED,
          notes: `Refund for order ${order.orderId}`,
        });
      }
    }

    // Restore stock
    await this.productRepo.incrementStock(order.productId, order.quantity);

    return this.orderRepo.updateStatus(orderId, ORDER_STATUS.CANCELLED);
  }

  /**
   * Refund a delivered order.
   */
  async refundOrder(orderId: string, adminId: string): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error("Order not found");

    if (order.status === ORDER_STATUS.REFUNDED) {
      throw new Error("Order already refunded");
    }

    const wallet = await this.walletRepo.findByUserId(order.userId);
    if (!wallet) throw new Error("User wallet not found");

    const updated = await this.walletRepo.adjustBalance(order.userId, order.totalPrice);

    await this.txRepo.create({
      userId: order.userId,
      type: TRANSACTION_TYPE.REFUND,
      amount: order.totalPrice,
      balanceBefore: wallet.balance,
      balanceAfter: updated.balance,
      paymentMethod: "wallet",
      status: TRANSACTION_STATUS.AUTO_VERIFIED,
      verifiedBy: adminId,
      notes: `Admin refund for order ${order.orderId}`,
    });

    log.info({ orderId, adminId }, "Order refunded");
    return this.orderRepo.updateStatus(orderId, ORDER_STATUS.REFUNDED);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Statistics
  // ────────────────────────────────────────────────────────────────────────

  async getTodayRevenue(): Promise<number> {
    return this.orderRepo.todayRevenue();
  }

  async getPendingCount(): Promise<number> {
    return this.orderRepo.countByStatus(ORDER_STATUS.PENDING);
  }
}
