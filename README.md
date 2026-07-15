# 🤖 Telegram Reseller Bot

Professional Telegram Reseller Bot built with **TypeScript**, **grammY**, **Neon PostgreSQL**, **Upstash Redis**, and deployed 24/7 on **Vercel**.

## ✨ Features

### 👤 User Panel
- Auto-registration with referral tracking
- Wallet balance & deposit (KBZPay, WavePay, AYAPay, TRC20, Binance)
- Product browsing by category + search
- Instant key delivery & manual delivery orders
- Order history & active orders with cancel
- Referral system with MMK rewards
- Promo code / redeem codes
- Support messaging to admins
- Myanmar & English language support

### 👑 Admin Panel
- Live dashboard (users, revenue, pending payments)
- Payment verification (approve/reject with reason)
- Manual order delivery with user notification
- Product & category management
- Key import for instant delivery
- User management (search, ban/unban, wallet adjust)
- Broadcast to all users (rate-limited)
- Coupon/discount management

### 🏪 Reseller Panel
- Wholesale pricing dashboard
- Sell products at retail, earn margin
- Order management
- Referral system

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone <repo>
cd Build
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

Required variables:
- `BOT_TOKEN` — From @BotFather
- `DATABASE_URL` — Neon PostgreSQL connection string
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — From Upstash Console
- `ADMIN_IDS` — Your Telegram ID(s), comma-separated

### 3. Setup Database
```bash
npm run db:push      # Push schema to Neon
npm run db:studio    # (Optional) Open Drizzle Studio
```

### 4. Run Locally (Development)
```bash
npm run dev          # Uses long polling — no webhook needed
```

### 5. Deploy to Vercel
```bash
npm install -g vercel
vercel login
vercel deploy --prod

# Set environment variables in Vercel dashboard, then:
VERCEL_URL=https://your-bot.vercel.app npx tsx scripts/setup-webhook.ts
```

## 📁 Project Structure

```
Build/
├── api/
│   └── webhook.ts              # Vercel serverless webhook entry
├── src/
│   ├── bot/
│   │   ├── bot.ts              # Bot factory (wires everything)
│   │   ├── filters/            # Role-based access filters
│   │   ├── handlers/
│   │   │   ├── admin/          # Admin panel handlers
│   │   │   ├── reseller/       # Reseller panel handlers
│   │   │   └── user/           # User panel handlers
│   │   └── middlewares/        # Auth, rate limiting, logging
│   ├── config/
│   │   ├── bot.config.ts       # Bot context type definitions
│   │   ├── constants.ts        # App-wide constants & CB prefixes
│   │   └── env.ts              # Zod-validated environment config
│   ├── database/
│   │   ├── db.ts               # Neon database connection
│   │   ├── repositories/       # Data access layer
│   │   └── schema/             # Drizzle ORM table definitions
│   ├── locales/
│   │   ├── en.json             # English translations
│   │   └── my.json             # Myanmar translations
│   ├── services/               # Business logic layer
│   ├── types/                  # Shared TypeScript types
│   └── utils/                  # Helpers, formatters, validators
├── scripts/
│   └── setup-webhook.ts        # Register Telegram webhook
├── .env.example                # Environment template
├── drizzle.config.ts           # Drizzle Kit configuration
├── package.json
├── tsconfig.json
└── vercel.json                 # Vercel deployment config
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5 |
| Bot Framework | grammY 1.x |
| Database | Neon (Serverless PostgreSQL) |
| ORM | Drizzle ORM |
| Cache/Session | Upstash Redis |
| Deployment | Vercel (Serverless Functions) |
| Rate Limiting | @upstash/ratelimit |
| Validation | Zod |
| Logging | Pino |

## 📝 Commands

```bash
npm run dev          # Start with long polling (development)
npm run build        # Compile TypeScript
npm run db:generate  # Generate Drizzle migrations
npm run db:push      # Push schema directly to database
npm run db:migrate   # Run migrations
npm run db:studio    # Open Drizzle Studio UI
npm run lint         # Run ESLint
npm run typecheck    # Type check without compiling
```

## 🔒 Security Features

- Webhook secret token validation
- Rate limiting per user (configurable)
- Admin role verification on every admin endpoint
- Zod validation on all user inputs
- Sensitive data redaction in logs

## 💰 Supported Payment Methods

| Method | Type | Verification |
|--------|------|-------------|
| KBZPay | Screenshot upload | Manual (admin) |
| WavePay | Screenshot upload | Manual (admin) |
| AYA Pay | Screenshot upload | Manual (admin) |
| TRC20 USDT | Transaction hash | Auto (cron) |
| Binance Pay | Prepay ID | Auto (API) |
