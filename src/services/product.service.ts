/**
 * @file src/services/product.service.ts
 * @description Business logic for products and categories.
 */

import {
  CategoryRepository,
  ProductRepository,
  ProductKeyRepository,
} from "../database/repositories/product.repository.js";
import type { Category, Product } from "../database/schema/index.js";
import type { PaginatedResult } from "../types/database.types.js";
import { createLogger } from "../utils/logger.js";
import { bulkKeysSchema, validate } from "../utils/validators.js";

const log = createLogger("product-service");

export class ProductService {
  constructor(
    private readonly categoryRepo: CategoryRepository,
    private readonly productRepo: ProductRepository,
    private readonly keyRepo: ProductKeyRepository
  ) {}

  // ── Categories ────────────────────────────────────────────────────────────

  async getActiveCategories(): Promise<Category[]> {
    return this.categoryRepo.findActive();
  }

  async getAllCategories(): Promise<Category[]> {
    return this.categoryRepo.findAll();
  }

  async getCategoryById(id: string): Promise<Category | null> {
    return this.categoryRepo.findById(id);
  }

  async createCategory(data: {
    name: string;
    icon?: string;
    sortOrder?: number;
  }): Promise<Category> {
    return this.categoryRepo.create({
      name: data.name,
      icon: data.icon ?? "📦",
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
    });
  }

  async updateCategory(
    id: string,
    data: Partial<{ name: string; icon: string; isActive: boolean; sortOrder: number }>
  ): Promise<Category> {
    return this.categoryRepo.update(id, data);
  }

  async deleteCategory(id: string): Promise<void> {
    await this.categoryRepo.delete(id);
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async getProductById(id: string): Promise<Product | null> {
    return this.productRepo.findById(id);
  }

  async getProductsByCategory(
    categoryId: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<Product>> {
    return this.productRepo.findByCategory(categoryId, page, pageSize);
  }

  async searchProducts(
    query: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<Product>> {
    return this.productRepo.search(query, page, pageSize);
  }

  async getAllProducts(
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<Product>> {
    return this.productRepo.findAll(page, pageSize);
  }

  async createProduct(data: {
    categoryId: string;
    name: string;
    description?: string;
    price: number;
    wholesalePrice: number;
    imageUrl?: string;
    stock?: number;
    deliveryType: "instant" | "manual";
  }): Promise<Product> {
    const product = await this.productRepo.create({
      categoryId: data.categoryId,
      name: data.name,
      description: data.description ?? "",
      price: data.price,
      wholesalePrice: data.wholesalePrice,
      imageUrl: data.imageUrl ?? null,
      stock: data.stock ?? 0,
      deliveryType: data.deliveryType,
      isActive: true,
    });

    log.info({ productId: product.id, name: product.name }, "Product created");
    return product;
  }

  async updateProduct(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      price: number;
      wholesalePrice: number;
      imageUrl: string;
      stock: number;
      categoryId: string;
      isActive: boolean;
    }>
  ): Promise<Product> {
    return this.productRepo.update(id, data);
  }

  async deleteProduct(id: string): Promise<void> {
    await this.productRepo.deactivate(id);
    log.info({ productId: id }, "Product deactivated");
  }

  // ── Keys Management ───────────────────────────────────────────────────────

  /**
   * Bulk import keys for a product.
   * @param productId - Product to add keys for
   * @param rawInput - Newline-separated key values
   * @returns Number of keys imported
   */
  async importKeys(productId: string, rawInput: string): Promise<number> {
    const validation = validate(bulkKeysSchema, rawInput);
    if (!validation.success) {
      throw new Error(validation.error);
    }

    const { count } = await this.keyRepo.bulkCreate(productId, validation.data);

    // Sync stock count
    await this.productRepo.syncStockFromKeys(productId);

    log.info({ productId, count }, "Keys imported");
    return count;
  }

  /** Count available keys for a product */
  async getKeyCount(productId: string): Promise<number> {
    return this.keyRepo.countAvailable(productId);
  }

  /** Clear all unused keys for a product */
  async clearKeys(productId: string): Promise<number> {
    const deleted = await this.keyRepo.deleteUnused(productId);
    await this.productRepo.syncStockFromKeys(productId);
    return deleted;
  }

  /**
   * Get stock overview for all products (admin inventory view).
   */
  async getInventoryOverview(): Promise<
    Array<{ product: Product; availableKeys: number }>
  > {
    const { data: allProducts } = await this.productRepo.findAll(1, 100);

    const overview = await Promise.all(
      allProducts.map(async (product) => {
        const availableKeys =
          product.deliveryType === "instant"
            ? await this.keyRepo.countAvailable(product.id)
            : product.stock;
        return { product, availableKeys };
      })
    );

    return overview;
  }
}
