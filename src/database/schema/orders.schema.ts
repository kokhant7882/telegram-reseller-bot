/**
 * @file src/database/schema/orders.schema.ts
 * @description Drizzle ORM schemas for the order system.
 *
 * Tables defined here:
 *   - orders — Purchase orders
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  bigint,
  integer,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, resellers } from "./users.schema.js";
import { products, productKeys } from "./products.schema.js";
import { coupons } from "./transactions.schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/** All possible order states */
export const orderStatusEnum = pgEnum("order_status", [
  "pending", // Created, awaiting payment
  "paid", // Payment confirmed, awaiting delivery
  "delivered", // Product delivered to customer
  "cancelled", // Cancelled by user or admin
  "refunded", // Refunded to wallet
]);

// ─────────────────────────────────────────────────────────────────────────────
// Orders Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Purchase orders.
 *
 * Order lifecycle:
 *   pending → paid → delivered (success path)
 *   pending → cancelled (user/admin cancels)
 *   delivered → refunded (admin issues refund)
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Human-readable order ID displayed to users.
     * Format: ORD-YYYYMMDD-XXXX (e.g., ORD-20241015-0001)
     * Generated in service layer.
     */
    orderId: varchar("order_id", { length: 30 }).notNull().unique(),

    /** FK to users.id — who placed this order */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    /**
     * FK to resellers.id — which reseller sold this order.
     * NULL if order was placed directly by user (not via reseller).
     */
    resellerId: uuid("reseller_id").references(() => resellers.id, {
      onDelete: "set null",
    }),

    /** FK to products.id — which product was purchased */
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),

    /** Number of units purchased */
    quantity: integer("quantity").notNull().default(1),

    /**
     * Price per unit at time of purchase in MMK.
     * Stored separately because product price may change later.
     */
    unitPrice: bigint("unit_price", { mode: "number" }).notNull(),

    /**
     * Total amount charged (after discount) in MMK.
     * = (unitPrice * quantity) - discountAmount
     */
    totalPrice: bigint("total_price", { mode: "number" }).notNull(),

    /** Current order status */
    status: orderStatusEnum("status").notNull().default("pending"),

    /**
     * Payment method used for this order.
     * One of: kbzpay | wavepay | ayapay | binance | trc20 | wallet
     */
    paymentMethod: varchar("payment_method", { length: 20 }).notNull(),

    /** FK to coupons.id — coupon applied to this order (if any) */
    couponId: uuid("coupon_id").references(() => coupons.id, {
      onDelete: "set null",
    }),

    /** Discount amount in MMK (0 if no coupon) */
    discountAmount: bigint("discount_amount", { mode: "number" })
      .notNull()
      .default(0),

    /**
     * Delivered product data — populated when order is delivered.
     * For instant delivery: the key/code
     * For manual delivery: delivery notes from admin
     */
    deliveryData: text("delivery_data"),

    /** Admin notes or internal delivery information */
    notes: text("notes"),

    /** When the order was delivered */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Fast lookup by human-readable order ID
    orderIdIdx: index("orders_order_id_idx").on(table.orderId),
    // User's order history
    userIdIdx: index("orders_user_id_idx").on(table.userId),
    // Reseller's orders
    resellerIdIdx: index("orders_reseller_id_idx").on(table.resellerId),
    // Filter by status (pending orders, etc.)
    statusIdx: index("orders_status_idx").on(table.status),
    // Date-based queries
    createdAtIdx: index("orders_created_at_idx").on(table.createdAt),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  reseller: one(resellers, {
    fields: [orders.resellerId],
    references: [resellers.id],
  }),
  product: one(products, {
    fields: [orders.productId],
    references: [products.id],
  }),
  coupon: one(coupons, {
    fields: [orders.couponId],
    references: [coupons.id],
  }),
}));

// Also add orders relation to productKeys for tracking which key went to which order
export const productKeyOrderRelation = relations(productKeys, ({ one }) => ({
  order: one(orders, {
    fields: [productKeys.orderId],
    references: [orders.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
