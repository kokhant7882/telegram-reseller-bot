/**
 * @file src/database/schema/index.ts
 * @description Central export for all database schemas.
 *
 * This is the file pointed to by drizzle.config.ts for migrations.
 * Import from here to get all schema tables in one place.
 *
 * Usage:
 *   import { users, products, orders } from "@/database/schema/index.js";
 */

// User-related schemas
export {
  users,
  wallets,
  admins,
  resellers,
  customers,
  referrals,
  settings,
  logs,
  logLevelEnum,
  // Types
  type User,
  type NewUser,
  type Wallet,
  type NewWallet,
  type Admin,
  type NewAdmin,
  type Reseller,
  type NewReseller,
  type Customer,
  type NewCustomer,
  type Referral,
  type NewReferral,
  type Setting,
  type Log,
  type NewLog,
  // Relations
  usersRelations,
  walletsRelations,
  resellersRelations,
  customersRelations,
  referralsRelations,
} from "./users.schema.js";

// Product-related schemas
export {
  categories,
  products,
  productKeys,
  deliveryTypeEnum,
  // Types
  type Category,
  type NewCategory,
  type Product,
  type NewProduct,
  type ProductKey,
  type NewProductKey,
  // Relations
  categoriesRelations,
  productsRelations,
  productKeysRelations,
} from "./products.schema.js";

// Order schemas
export {
  orders,
  orderStatusEnum,
  // Types
  type Order,
  type NewOrder,
  // Relations
  ordersRelations,
  productKeyOrderRelation,
} from "./orders.schema.js";

// Transaction & coupon schemas
export {
  transactions,
  coupons,
  couponUsages,
  transactionTypeEnum,
  transactionStatusEnum,
  couponTypeEnum,
  // Types
  type Transaction,
  type NewTransaction,
  type Coupon,
  type NewCoupon,
  type CouponUsage,
  type NewCouponUsage,
  // Relations
  transactionsRelations,
  couponsRelations,
  couponUsagesRelations,
} from "./transactions.schema.js";
