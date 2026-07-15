/**
 * @file src/database/schema/products.schema.ts
 * @description Drizzle ORM schemas for product-related tables.
 *
 * Tables defined here:
 *   - categories    — Product categories
 *   - products      — Main products catalog
 *   - productKeys   — Digital keys for instant delivery
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/** How a product is delivered after purchase */
export const deliveryTypeEnum = pgEnum("delivery_type", [
  "instant", // Key/code sent from stock immediately
  "manual", // Admin manually delivers after payment
]);

// ─────────────────────────────────────────────────────────────────────────────
// Categories Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Product categories for organizing the shop.
 * Each product belongs to exactly one category.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Display name of the category (e.g., "Netflix", "Spotify") */
    name: varchar("name", { length: 100 }).notNull().unique(),

    /** Emoji icon displayed next to category name */
    icon: varchar("icon", { length: 8 }).notNull().default("📦"),

    /** Whether this category is visible to users */
    isActive: boolean("is_active").notNull().default(true),

    /** Display order (lower = shown first) */
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex("categories_name_idx").on(table.name),
    sortOrderIdx: index("categories_sort_order_idx").on(table.sortOrder),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Products Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main products catalog.
 *
 * Price fields are stored as integers in MMK.
 * If a product has delivery_type = 'instant', stock is managed via productKeys.
 * If delivery_type = 'manual', stock field is decremented manually.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** FK to categories.id */
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),

    /** Product display name */
    name: varchar("name", { length: 100 }).notNull(),

    /** Detailed description shown on product page */
    description: text("description").notNull().default(""),

    /**
     * Retail price in MMK — what regular users pay.
     * Stored as integer (multiply by 100 if you need decimals — we don't for MMK)
     */
    price: bigint("price", { mode: "number" }).notNull(),

    /**
     * Wholesale price in MMK — what resellers pay.
     * Must be <= price (validated in service layer)
     */
    wholesalePrice: bigint("wholesale_price", { mode: "number" }).notNull(),

    /** Cloudinary URL for product image (optional) */
    imageUrl: varchar("image_url", { length: 500 }),

    /**
     * Available stock count.
     *   -1 = unlimited stock (for manual delivery)
     *   0  = out of stock
     *   >0 = available units
     *
     * For instant delivery, this auto-updates from productKeys table.
     */
    stock: integer("stock").notNull().default(0),

    /** How this product is delivered after purchase */
    deliveryType: deliveryTypeEnum("delivery_type").notNull().default("manual"),

    /** Whether this product is visible and purchasable */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    categoryIdx: index("products_category_id_idx").on(table.categoryId),
    isActiveIdx: index("products_is_active_idx").on(table.isActive),
    // Full text search index (PostgreSQL)
    nameIdx: index("products_name_idx").on(table.name),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Product Keys Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Digital product keys/codes for instant delivery.
 *
 * When a user purchases a product with delivery_type = 'instant':
 * 1. The system finds an unused key for that product
 * 2. Marks it as used with the order_id
 * 3. Sends the key_value to the user
 *
 * Admin can bulk-import keys or generate them.
 */
export const productKeys = pgTable(
  "product_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** FK to products.id */
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    /**
     * The actual key/code value.
     * Could be an activation key, account credentials, serial number, etc.
     * Stored encrypted in production — encryption handled in service layer.
     */
    keyValue: text("key_value").notNull(),

    /** Whether this key has been sold */
    isUsed: boolean("is_used").notNull().default(false),

    /**
     * FK to orders.id — set when this key is assigned to an order.
     * Defined as varchar to avoid circular imports; FK set in orders schema.
     */
    orderId: uuid("order_id"),

    /** When this key was sold (orderId set) */
    usedAt: timestamp("used_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    productIdIdx: index("product_keys_product_id_idx").on(table.productId),
    // Critical index: finding available keys for a product
    availableIdx: index("product_keys_available_idx").on(
      table.productId,
      table.isUsed
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  keys: many(productKeys),
}));

export const productKeysRelations = relations(productKeys, ({ one }) => ({
  product: one(products, {
    fields: [productKeys.productId],
    references: [products.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductKey = typeof productKeys.$inferSelect;
export type NewProductKey = typeof productKeys.$inferInsert;
