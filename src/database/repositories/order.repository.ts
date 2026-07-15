/**
 * @file src/database/repositories/order.repository.ts
 * @description Data access layer for orders.
 */

import { eq, desc, sql, and, inArray } from "drizzle-orm";
import type { Database } from "../db.js";
import {
  orders,
  type Order,
  type NewOrder,
} from "../schema/index.js";
import { getOffset, calculatePagination } from "../../utils/pagination.js";
import type { PaginatedResult } from "../../types/database.types.js";
import type { OrderStatus } from "../../config/constants.js";

export class OrderRepository {
  constructor(private readonly db: Database) {}

  /** Find order by internal ID */
  async findById(id: string): Promise<Order | null> {
    const result = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /** Find order by human-readable order ID (e.g., ORD-20241015-A3F2) */
  async findByOrderId(orderId: string): Promise<Order | null> {
    const result = await this.db
      .select()
      .from(orders)
      .where(eq(orders.orderId, orderId.toUpperCase()))
      .limit(1);
    return result[0] ?? null;
  }

  /** Create a new order */
  async create(data: NewOrder): Promise<Order> {
    const result = await this.db
      .insert(orders)
      .values(data)
      .returning();
    const order = result[0];
    if (!order) throw new Error("Failed to create order");
    return order;
  }

  /** Update order status */
  async updateStatus(
    id: string,
    status: OrderStatus,
    extra?: { deliveryData?: string; notes?: string; deliveredAt?: Date }
  ): Promise<Order> {
    const result = await this.db
      .update(orders)
      .set({
        status,
        ...extra,
        updatedAt: new Date(),
        ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
      })
      .where(eq(orders.id, id))
      .returning();

    const order = result[0];
    if (!order) throw new Error(`Order ${id} not found`);
    return order;
  }

  /** Get user's orders (paginated) */
  async findByUser(
    userId: string,
    page: number,
    pageSize: number,
    status?: OrderStatus
  ): Promise<PaginatedResult<Order>> {
    const offset = getOffset(page, pageSize);
    const where = status
      ? and(eq(orders.userId, userId), eq(orders.status, status))
      : eq(orders.userId, userId);

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(where),
    ]);

    return {
      data,
      ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize),
    };
  }

  /** Get reseller's orders (paginated) */
  async findByReseller(
    resellerId: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<Order>> {
    const offset = getOffset(page, pageSize);
    const where = eq(orders.resellerId, resellerId);

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(where),
    ]);

    return {
      data,
      ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize),
    };
  }

  /** Get all orders with optional status filter (admin view, paginated) */
  async findAll(
    page: number,
    pageSize: number,
    status?: OrderStatus
  ): Promise<PaginatedResult<Order>> {
    const offset = getOffset(page, pageSize);
    const where = status ? eq(orders.status, status) : undefined;

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(where),
    ]);

    return {
      data,
      ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize),
    };
  }

  /** Count orders by status */
  async countByStatus(status: OrderStatus): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.status, status));
    return result[0]?.count ?? 0;
  }

  /** Get today's revenue (sum of delivered order totals) */
  async todayRevenue(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.db
      .select({
        total: sql<number>`coalesce(sum(${orders.totalPrice}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.status, ["paid", "delivered"]),
          sql`${orders.createdAt} >= ${today}`
        )
      );

    return result[0]?.total ?? 0;
  }

  /** Get user's total spend */
  async userTotalSpend(userId: string): Promise<number> {
    const result = await this.db
      .select({
        total: sql<number>`coalesce(sum(${orders.totalPrice}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          inArray(orders.status, ["paid", "delivered"])
        )
      );
    return result[0]?.total ?? 0;
  }

  /** Count user's total orders */
  async userTotalOrders(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.userId, userId));
    return result[0]?.count ?? 0;
  }
}
