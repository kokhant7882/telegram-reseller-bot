/**
 * Direct database migration script
 * Runs all CREATE TABLE statements directly against Neon PostgreSQL
 */
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("🚀 Running database migration...\n");

  const statements = [
    // ENUMS
    `DO $$ BEGIN CREATE TYPE "payment_method" AS ENUM('kbzpay','wavepay','ayapay','trc20','binance'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "order_status" AS ENUM('pending','processing','completed','cancelled','refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "transaction_type" AS ENUM('deposit','withdrawal','purchase','refund','referral','adjustment','admin_topup'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "transaction_status" AS ENUM('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "user_role" AS ENUM('user','reseller','admin','super_admin'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "log_level" AS ENUM('trace','debug','info','warn','error','fatal'); EXCEPTION WHEN duplicate_object THEN null; END $$`,

    // USERS
    `CREATE TABLE IF NOT EXISTS "users" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "telegram_id" bigint NOT NULL UNIQUE,
      "username" varchar(32),
      "first_name" varchar(64) NOT NULL,
      "last_name" varchar(64),
      "language_code" varchar(8) DEFAULT 'my' NOT NULL,
      "is_banned" boolean DEFAULT false NOT NULL,
      "ban_reason" text,
      "referral_code" varchar(20) NOT NULL UNIQUE,
      "referred_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // WALLETS
    `CREATE TABLE IF NOT EXISTS "wallets" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
      "balance" bigint DEFAULT 0 NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // ADMINS
    `CREATE TABLE IF NOT EXISTS "admins" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
      "role" "user_role" DEFAULT 'admin' NOT NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // RESELLERS
    `CREATE TABLE IF NOT EXISTS "resellers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
      "commission_rate" integer DEFAULT 100 NOT NULL,
      "total_profit" bigint DEFAULT 0 NOT NULL,
      "is_approved" boolean DEFAULT false NOT NULL,
      "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // REFERRALS
    `CREATE TABLE IF NOT EXISTS "referrals" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "referrer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "referred_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
      "reward_amount" bigint DEFAULT 0 NOT NULL,
      "reward_paid" boolean DEFAULT false NOT NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // CATEGORIES
    `CREATE TABLE IF NOT EXISTS "categories" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" varchar(100) NOT NULL UNIQUE,
      "icon" varchar(10) DEFAULT '📦' NOT NULL,
      "description" text,
      "sort_order" integer DEFAULT 0 NOT NULL,
      "is_active" boolean DEFAULT true NOT NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // PRODUCTS
    `CREATE TABLE IF NOT EXISTS "products" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
      "name" varchar(200) NOT NULL,
      "description" text,
      "price" bigint NOT NULL,
      "reseller_price" bigint NOT NULL,
      "stock" integer DEFAULT 0 NOT NULL,
      "is_active" boolean DEFAULT true NOT NULL,
      "is_instant" boolean DEFAULT false NOT NULL,
      "image_url" text,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // PRODUCT KEYS
    `CREATE TABLE IF NOT EXISTS "product_keys" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
      "key_value" text NOT NULL,
      "is_used" boolean DEFAULT false NOT NULL,
      "used_at" timestamptz,
      "created_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // COUPONS
    `CREATE TABLE IF NOT EXISTS "coupons" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "code" varchar(50) NOT NULL UNIQUE,
      "type" varchar(20) DEFAULT 'percentage' NOT NULL,
      "value" bigint NOT NULL,
      "min_purchase" bigint DEFAULT 0 NOT NULL,
      "max_uses" integer,
      "uses_count" integer DEFAULT 0 NOT NULL,
      "is_active" boolean DEFAULT true NOT NULL,
      "expires_at" timestamptz,
      "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "created_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // COUPON USAGES
    `CREATE TABLE IF NOT EXISTS "coupon_usages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "coupon_id" uuid NOT NULL REFERENCES "coupons"("id") ON DELETE CASCADE,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "used_at" timestamptz DEFAULT now() NOT NULL,
      UNIQUE("coupon_id", "user_id")
    )`,

    // ORDERS
    `CREATE TABLE IF NOT EXISTS "orders" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "order_id" varchar(20) NOT NULL UNIQUE,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "reseller_id" uuid REFERENCES "resellers"("id") ON DELETE SET NULL,
      "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
      "coupon_id" uuid REFERENCES "coupons"("id") ON DELETE SET NULL,
      "quantity" integer DEFAULT 1 NOT NULL,
      "unit_price" bigint NOT NULL,
      "total_price" bigint NOT NULL,
      "discount_amount" bigint DEFAULT 0 NOT NULL,
      "status" "order_status" DEFAULT 'pending' NOT NULL,
      "delivery_data" text,
      "notes" text,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // TRANSACTIONS
    `CREATE TABLE IF NOT EXISTS "transactions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "type" "transaction_type" NOT NULL,
      "amount" bigint NOT NULL,
      "balance_before" bigint NOT NULL,
      "balance_after" bigint NOT NULL,
      "status" "transaction_status" DEFAULT 'pending' NOT NULL,
      "payment_method" "payment_method",
      "tx_reference" varchar(200),
      "screenshot_file_id" text,
      "notes" text,
      "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "verified_at" timestamptz,
      "created_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // CUSTOMERS
    `CREATE TABLE IF NOT EXISTS "customers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "reseller_id" uuid NOT NULL REFERENCES "resellers"("id") ON DELETE CASCADE,
      "name" varchar(100) NOT NULL,
      "contact" varchar(100),
      "notes" text,
      "created_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // SETTINGS
    `CREATE TABLE IF NOT EXISTS "settings" (
      "key" varchar(100) PRIMARY KEY NOT NULL,
      "value" text NOT NULL,
      "description" text,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // LOGS
    `CREATE TABLE IF NOT EXISTS "logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "level" "log_level" DEFAULT 'info' NOT NULL,
      "action" varchar(100) NOT NULL,
      "telegram_user_id" bigint,
      "details" jsonb,
      "created_at" timestamptz DEFAULT now() NOT NULL
    )`,

    // INDEXES
    `CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_id_idx" ON "users" ("telegram_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_idx" ON "users" ("referral_code")`,
    `CREATE INDEX IF NOT EXISTS "users_referred_by_idx" ON "users" ("referred_by")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "wallets_user_id_idx" ON "wallets" ("user_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "admins_user_id_idx" ON "admins" ("user_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "resellers_user_id_idx" ON "resellers" ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "resellers_is_approved_idx" ON "resellers" ("is_approved")`,
    `CREATE INDEX IF NOT EXISTS "referrals_referrer_id_idx" ON "referrals" ("referrer_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referred_id_idx" ON "referrals" ("referred_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "categories_name_idx" ON "categories" ("name")`,
    `CREATE INDEX IF NOT EXISTS "categories_sort_order_idx" ON "categories" ("sort_order")`,
    `CREATE INDEX IF NOT EXISTS "products_category_id_idx" ON "products" ("category_id")`,
    `CREATE INDEX IF NOT EXISTS "products_is_active_idx" ON "products" ("is_active")`,
    `CREATE INDEX IF NOT EXISTS "products_name_idx" ON "products" ("name")`,
    `CREATE INDEX IF NOT EXISTS "product_keys_product_id_idx" ON "product_keys" ("product_id")`,
    `CREATE INDEX IF NOT EXISTS "product_keys_available_idx" ON "product_keys" ("product_id", "is_used")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_idx" ON "coupons" ("code")`,
    `CREATE INDEX IF NOT EXISTS "coupons_is_active_idx" ON "coupons" ("is_active")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "coupon_usages_unique_idx" ON "coupon_usages" ("coupon_id", "user_id")`,
    `CREATE INDEX IF NOT EXISTS "orders_order_id_idx" ON "orders" ("order_id")`,
    `CREATE INDEX IF NOT EXISTS "orders_user_id_idx" ON "orders" ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" ("status")`,
    `CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders" ("created_at")`,
    `CREATE INDEX IF NOT EXISTS "transactions_user_id_idx" ON "transactions" ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "transactions_type_idx" ON "transactions" ("type")`,
    `CREATE INDEX IF NOT EXISTS "transactions_status_idx" ON "transactions" ("status")`,
    `CREATE INDEX IF NOT EXISTS "transactions_created_at_idx" ON "transactions" ("created_at")`,
    `CREATE INDEX IF NOT EXISTS "logs_level_idx" ON "logs" ("level")`,
    `CREATE INDEX IF NOT EXISTS "logs_action_idx" ON "logs" ("action")`,
    `CREATE INDEX IF NOT EXISTS "logs_created_at_idx" ON "logs" ("created_at")`,
    `CREATE INDEX IF NOT EXISTS "customers_reseller_id_idx" ON "customers" ("reseller_id")`,
  ];

  let success = 0;
  let failed = 0;

  for (const stmt of statements) {
    try {
      await sql(stmt);
      success++;
      process.stdout.write("✅");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Ignore "already exists" errors
      if (message.includes("already exists") || message.includes("duplicate")) {
        process.stdout.write("⏭️");
        success++;
      } else {
        console.error(`\n❌ Error: ${message}`);
        console.error(`   SQL: ${stmt.slice(0, 80)}...`);
        failed++;
      }
    }
  }

  console.log(`\n\n✅ Migration complete! ${success} statements OK, ${failed} failed.`);

  if (failed === 0) {
    console.log("🎉 Database is ready!");
  }
}

migrate().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
