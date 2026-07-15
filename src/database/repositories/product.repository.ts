/**
 * @file src/database/repositories/product.repository.ts
 * @description Data access layer for categories, products, and product keys.
 */

import { eq, desc, asc, sql, and, ilike } from "drizzle-orm";
import type { Database } from "../db.js";
import {
  categories,
  products,
  productKeys,
  type Category,
  type NewCategory,
  type Product,
  type NewProduct,
  type ProductKey,
  type NewProductKey,
} from "../schema/index.js";
import { getOffset, calculatePagination } from "../../utils/pagination.js";
import type { PaginatedResult } from "../../types/database.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Category Repository
// ─────────────────────────────────────────────────────────────────────────────

export class CategoryRepository {
  constructor(private readonly db: Database) {}

  /** Get all active categories ordered by sortOrder */
  async findActive(): Promise<Category[]> {
    return await this.db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  /** Get all categories (including inactive — admin view) */
  async findAll(): Promise<Category[]> {
    return await this.db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder));
  }

  /** Find category by ID */
  async findById(id: string): Promise<Category | null> {
    const result = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /** Create a new category */
  async create(data: NewCategory): Promise<Category> {
    const result = await this.db
      .insert(categories)
      .values(data)
      .returning();
    const cat = result[0];
    if (!cat) throw new Error("Failed to create category");
    return cat;
  }

  /** Update category */
  async update(id: string, data: Partial<NewCategory>): Promise<Category> {
    const result = await this.db
      .update(categories)
      .set(data)
      .where(eq(categories.id, id))
      .returning();
    const cat = result[0];
    if (!cat) throw new Error(`Category ${id} not found`);
    return cat;
  }

  /** Delete category (fails if products exist — FK constraint) */
  async delete(id: string): Promise<void> {
    await this.db.delete(categories).where(eq(categories.id, id));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Repository
// ─────────────────────────────────────────────────────────────────────────────

export class ProductRepository {
  constructor(private readonly db: Database) {}

  /** Find product by ID */
  async findById(id: string): Promise<Product | null> {
    const result = await this.db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /** Get active products in a category (paginated) */
  async findByCategory(
    categoryId: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<Product>> {
    const offset = getOffset(page, pageSize);
    const where = and(
      eq(products.categoryId, categoryId),
      eq(products.isActive, true)
    );

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(products)
        .where(where)
        .orderBy(asc(products.name))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(where),
    ]);

    return {
      data,
      ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize),
    };
  }

  /** Search products by name (paginated) */
  async search(
    query: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<Product>> {
    const offset = getOffset(page, pageSize);
    const where = and(
      ilike(products.name, `%${query}%`),
      eq(products.isActive, true)
    );

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(products)
        .where(where)
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(where),
    ]);

    return {
      data,
      ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize),
    };
  }

  /** Get all products (admin view, paginated) */
  async findAll(page: number, pageSize: number): Promise<PaginatedResult<Product>> {
    const offset = getOffset(page, pageSize);

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(products)
        .orderBy(desc(products.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(products),
    ]);

    return {
      data,
      ...calculatePagination(countResult[0]?.count ?? 0, page, pageSize),
    };
  }

  /** Create a new product */
  async create(data: NewProduct): Promise<Product> {
    const result = await this.db
      .insert(products)
      .values(data)
      .returning();
    const product = result[0];
    if (!product) throw new Error("Failed to create product");
    return product;
  }

  /** Update product */
  async update(id: string, data: Partial<NewProduct>): Promise<Product> {
    const result = await this.db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    const product = result[0];
    if (!product) throw new Error(`Product ${id} not found`);
    return product;
  }

  /** Soft delete — set isActive = false */
  async deactivate(id: string): Promise<void> {
    await this.db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(products.id, id));
  }

  /**
   * Decrement stock count by quantity.
   * Returns the updated product (with new stock count).
   */
  async decrementStock(id: string, qty: number): Promise<Product> {
    const result = await this.db
      .update(products)
      .set({
        stock: sql`${products.stock} - ${qty}`,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), sql`${products.stock} >= ${qty}`))
      .returning();

    const product = result[0];
    if (!product) throw new Error("Insufficient stock or product not found");
    return product;
  }

  /** Increment stock (for refunds or manual additions) */
  async incrementStock(id: string, qty: number): Promise<void> {
    await this.db
      .update(products)
      .set({
        stock: sql`${products.stock} + ${qty}`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));
  }

  /** Sync stock count from available keys (for instant delivery products) */
  async syncStockFromKeys(productId: string): Promise<void> {
    const countResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(productKeys)
      .where(
        and(
          eq(productKeys.productId, productId),
          eq(productKeys.isUsed, false)
        )
      );

    const count = countResult[0]?.count ?? 0;
    await this.db
      .update(products)
      .set({ stock: count, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Key Repository
// ─────────────────────────────────────────────────────────────────────────────

export class ProductKeyRepository {
  constructor(private readonly db: Database) {}

  /**
   * Get one unused key for a product (FIFO — oldest first).
   * Returns null if no keys available.
   */
  async getAvailableKey(productId: string): Promise<ProductKey | null> {
    const result = await this.db
      .select()
      .from(productKeys)
      .where(
        and(
          eq(productKeys.productId, productId),
          eq(productKeys.isUsed, false)
        )
      )
      .orderBy(asc(productKeys.createdAt))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Mark a key as used and link it to an order.
   */
  async markUsed(keyId: string, orderId: string): Promise<ProductKey> {
    const result = await this.db
      .update(productKeys)
      .set({ isUsed: true, orderId, usedAt: new Date() })
      .where(eq(productKeys.id, keyId))
      .returning();

    const key = result[0];
    if (!key) throw new Error(`Key ${keyId} not found`);
    return key;
  }

  /** Bulk insert keys */
  async bulkCreate(
    productId: string,
    keyValues: string[]
  ): Promise<{ count: number }> {
    if (keyValues.length === 0) return { count: 0 };

    const data: NewProductKey[] = keyValues.map((keyValue) => ({
      productId,
      keyValue,
      isUsed: false,
    }));

    // Insert in chunks of 100 to avoid query size limits
    const chunkSize = 100;
    let inserted = 0;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await this.db.insert(productKeys).values(chunk);
      inserted += chunk.length;
    }

    return { count: inserted };
  }

  /** Count available keys for a product */
  async countAvailable(productId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(productKeys)
      .where(
        and(
          eq(productKeys.productId, productId),
          eq(productKeys.isUsed, false)
        )
      );
    return result[0]?.count ?? 0;
  }

  /** Delete all unused keys for a product */
  async deleteUnused(productId: string): Promise<number> {
    const result = await this.db
      .delete(productKeys)
      .where(
        and(
          eq(productKeys.productId, productId),
          eq(productKeys.isUsed, false)
        )
      )
      .returning({ id: productKeys.id });
    return result.length;
  }
}
