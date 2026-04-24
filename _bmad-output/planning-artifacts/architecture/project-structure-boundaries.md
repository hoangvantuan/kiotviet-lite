# Project Structure & Boundaries

## Complete Project Directory Structure

```
kiotviet-lite/
├── package.json                    # Workspace root
├── pnpm-workspace.yaml            # pnpm workspace config
├── tsconfig.base.json             # Shared TS config
├── .gitignore
├── .env.example
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Lint, test, build
│       └── deploy.yml             # Deploy to production
│
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts           # Public API
│           ├── schemas/           # Zod schemas (shared validation)
│           │   ├── product.ts
│           │   ├── customer.ts
│           │   ├── order.ts
│           │   ├── price-list.ts
│           │   ├── debt.ts
│           │   ├── inventory.ts
│           │   └── auth.ts
│           ├── types/             # TypeScript types (inferred from Zod)
│           │   └── index.ts
│           ├── constants/         # Shared constants
│           │   ├── roles.ts       # Owner, Manager, Staff
│           │   ├── permissions.ts
│           │   ├── sync-status.ts
│           │   └── error-codes.ts
│           └── utils/             # Pure utility functions
│               ├── pricing-engine.ts    # 6-tier pricing logic
│               ├── debt-allocator.ts    # FIFO debt allocation
│               ├── weighted-avg-cost.ts # Giá vốn BQ gia quyền
│               ├── currency.ts          # Format VND
│               └── validators.ts        # Business rule validators
│
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── manifest.json      # PWA manifest
│   │   │   ├── sw.js              # Service Worker (Workbox)
│   │   │   ├── icons/             # PWA icons
│   │   │   └── fonts/             # Vietnamese fonts
│   │   ├── e2e/                   # Playwright E2E tests
│   │   │   ├── pos.spec.ts
│   │   │   ├── pricing.spec.ts
│   │   │   └── offline.spec.ts
│   │   └── src/
│   │       ├── main.tsx           # App entry
│   │       ├── App.tsx            # Root component + providers
│   │       ├── router.tsx         # TanStack Router config
│   │       ├── globals.css        # Tailwind imports
│   │       │
│   │       ├── components/
│   │       │   ├── ui/            # shadcn/ui components
│   │       │   │   ├── Button.tsx
│   │       │   │   ├── Input.tsx
│   │       │   │   ├── Dialog.tsx
│   │       │   │   ├── DataTable.tsx
│   │       │   │   └── ...
│   │       │   ├── layout/
│   │       │   │   ├── AppLayout.tsx
│   │       │   │   ├── Sidebar.tsx
│   │       │   │   ├── Header.tsx
│   │       │   │   ├── MobileNav.tsx
│   │       │   │   └── ErrorBoundary.tsx
│   │       │   └── shared/
│   │       │       ├── SearchInput.tsx
│   │       │       ├── CurrencyDisplay.tsx
│   │       │       ├── SyncStatusBadge.tsx
│   │       │       ├── OfflineBanner.tsx
│   │       │       └── PrintPreview.tsx
│   │       │
│   │       ├── features/
│   │       │   ├── pos/
│   │       │   │   ├── components/
│   │       │   │   │   ├── PosScreen.tsx
│   │       │   │   │   ├── ProductGrid.tsx
│   │       │   │   │   ├── CartPanel.tsx
│   │       │   │   │   ├── CartItem.tsx
│   │       │   │   │   ├── PaymentDialog.tsx
│   │       │   │   │   ├── CustomerSelect.tsx
│   │       │   │   │   ├── BarcodeScanner.tsx
│   │       │   │   │   └── PriceSourceBadge.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   ├── use-cart.ts
│   │       │   │   │   ├── use-barcode.ts
│   │       │   │   │   └── use-payment.ts
│   │       │   │   └── pos.test.tsx
│   │       │   │
│   │       │   ├── products/
│   │       │   │   ├── components/
│   │       │   │   │   ├── ProductList.tsx
│   │       │   │   │   ├── ProductForm.tsx
│   │       │   │   │   ├── ProductDetail.tsx
│   │       │   │   │   ├── VariantEditor.tsx
│   │       │   │   │   ├── UnitConversion.tsx
│   │       │   │   │   └── CategoryTree.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-products.ts
│   │       │   │   └── products.test.tsx
│   │       │   │
│   │       │   ├── customers/
│   │       │   │   ├── components/
│   │       │   │   │   ├── CustomerList.tsx
│   │       │   │   │   ├── CustomerForm.tsx
│   │       │   │   │   ├── CustomerDetail.tsx
│   │       │   │   │   └── CustomerGroupManager.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-customers.ts
│   │       │   │   └── customers.test.tsx
│   │       │   │
│   │       │   ├── orders/
│   │       │   │   ├── components/
│   │       │   │   │   ├── OrderList.tsx
│   │       │   │   │   ├── OrderDetail.tsx
│   │       │   │   │   └── ReturnDialog.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-orders.ts
│   │       │   │   └── orders.test.tsx
│   │       │   │
│   │       │   ├── pricing/
│   │       │   │   ├── components/
│   │       │   │   │   ├── PriceListManager.tsx
│   │       │   │   │   ├── PriceListEditor.tsx
│   │       │   │   │   ├── PriceCompare.tsx
│   │       │   │   │   ├── ChainFormulaEditor.tsx
│   │       │   │   │   └── CascadePreview.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-pricing.ts
│   │       │   │   └── pricing.test.tsx
│   │       │   │
│   │       │   ├── inventory/
│   │       │   │   ├── components/
│   │       │   │   │   ├── PurchaseOrderForm.tsx
│   │       │   │   │   ├── PurchaseOrderList.tsx
│   │       │   │   │   ├── StockCheckForm.tsx
│   │       │   │   │   └── SupplierManager.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-inventory.ts
│   │       │   │   └── inventory.test.tsx
│   │       │   │
│   │       │   ├── debts/
│   │       │   │   ├── components/
│   │       │   │   │   ├── DebtDashboard.tsx
│   │       │   │   │   ├── ReceiptForm.tsx
│   │       │   │   │   ├── DebtAdjustment.tsx
│   │       │   │   │   └── DebtAgingReport.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-debts.ts
│   │       │   │   └── debts.test.tsx
│   │       │   │
│   │       │   ├── reports/
│   │       │   │   ├── components/
│   │       │   │   │   ├── Dashboard.tsx
│   │       │   │   │   ├── RevenueReport.tsx
│   │       │   │   │   ├── ProfitReport.tsx
│   │       │   │   │   ├── InventoryReport.tsx
│   │       │   │   │   └── Charts.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-reports.ts
│   │       │   │   └── reports.test.tsx
│   │       │   │
│   │       │   ├── auth/
│   │       │   │   ├── components/
│   │       │   │   │   ├── LoginForm.tsx
│   │       │   │   │   └── PinDialog.tsx
│   │       │   │   └── hooks/
│   │       │   │       └── use-auth.ts
│   │       │   │
│   │       │   └── settings/
│   │       │       ├── components/
│   │       │       │   ├── StoreSettings.tsx
│   │       │       │   ├── StaffManager.tsx
│   │       │       │   └── PrintSettings.tsx
│   │       │       └── hooks/
│   │       │           └── use-settings.ts
│   │       │
│   │       ├── stores/              # Zustand stores
│   │       │   ├── cart.ts          # POS cart state
│   │       │   ├── ui.ts            # UI state (theme, sidebar, modals)
│   │       │   └── offline.ts       # Offline/sync status
│   │       │
│   │       ├── lib/
│   │       │   ├── api-client.ts    # Hono RPC client / fetch wrapper
│   │       │   ├── pglite.ts        # PGlite instance & setup
│   │       │   ├── sync.ts          # Sync engine
│   │       │   ├── print/
│   │       │   │   ├── thermal.ts   # ESC/POS commands
│   │       │   │   ├── paper.ts     # A4/A5 HTML print
│   │       │   │   └── templates.ts # Print template configs
│   │       │   ├── auth.ts          # Better Auth client
│   │       │   ├── query-client.ts  # TanStack Query config
│   │       │   └── utils.ts         # UI utility functions
│   │       │
│   │       ├── hooks/               # Global hooks
│   │       │   ├── use-offline-status.ts
│   │       │   ├── use-keyboard-shortcuts.ts
│   │       │   └── use-responsive.ts
│   │       │
│   │       └── routes/              # TanStack Router route files
│   │           ├── __root.tsx
│   │           ├── _authenticated.tsx    # Auth layout
│   │           ├── _authenticated/
│   │           │   ├── pos.tsx
│   │           │   ├── products/
│   │           │   │   ├── index.tsx
│   │           │   │   └── $productId.tsx
│   │           │   ├── customers/
│   │           │   │   ├── index.tsx
│   │           │   │   └── $customerId.tsx
│   │           │   ├── orders/
│   │           │   │   ├── index.tsx
│   │           │   │   └── $orderId.tsx
│   │           │   ├── inventory/
│   │           │   │   ├── index.tsx
│   │           │   │   ├── import.tsx
│   │           │   │   └── check.tsx
│   │           │   ├── pricing/
│   │           │   │   ├── index.tsx
│   │           │   │   └── $priceListId.tsx
│   │           │   ├── debts/
│   │           │   │   ├── index.tsx
│   │           │   │   └── receipts.tsx
│   │           │   ├── reports/
│   │           │   │   ├── index.tsx
│   │           │   │   └── dashboard.tsx
│   │           │   └── settings/
│   │           │       ├── index.tsx
│   │           │       ├── staff.tsx
│   │           │       └── printing.tsx
│   │           └── login.tsx
│   │
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       ├── drizzle.config.ts
│       └── src/
│           ├── index.ts               # Entry point (Hono app)
│           ├── app.ts                 # Hono app setup + middleware
│           │
│           ├── db/
│           │   ├── index.ts           # Drizzle client
│           │   ├── schema/            # Drizzle schema definitions
│           │   │   ├── products.ts
│           │   │   ├── customers.ts
│           │   │   ├── orders.ts
│           │   │   ├── price-lists.ts
│           │   │   ├── debts.ts
│           │   │   ├── inventory.ts
│           │   │   ├── users.ts
│           │   │   ├── stores.ts
│           │   │   ├── audit-logs.ts
│           │   │   └── index.ts       # Re-export all schemas
│           │   └── migrations/        # Drizzle Kit migrations
│           │
│           ├── routes/                # Hono route handlers
│           │   ├── auth.ts
│           │   ├── products.ts
│           │   ├── customers.ts
│           │   ├── orders.ts
│           │   ├── price-lists.ts
│           │   ├── debts.ts
│           │   ├── inventory.ts
│           │   ├── reports.ts
│           │   ├── sync.ts
│           │   └── settings.ts
│           │
│           ├── services/              # Business logic
│           │   ├── pricing.ts         # Pricing engine (server-side)
│           │   ├── debt.ts            # Debt management + FIFO
│           │   ├── inventory.ts       # Stock management + WAC
│           │   ├── order.ts           # Order processing
│           │   ├── sync.ts            # Sync logic + conflict resolution
│           │   └── audit.ts           # Audit log service
│           │
│           ├── middleware/
│           │   ├── auth.ts            # JWT verification
│           │   ├── tenant.ts          # Multi-tenant store_id injection
│           │   ├── rate-limit.ts      # Rate limiting
│           │   └── error-handler.ts   # Global error handler
│           │
│           └── __tests__/             # API integration tests
│               ├── auth.test.ts
│               ├── orders.test.ts
│               ├── pricing.test.ts
│               └── sync.test.ts
```

## Architectural Boundaries

**API Boundaries:**

```
Client (apps/web) ──HTTP/JSON──► API (apps/api)
                                    │
                                    ├── routes/ (HTTP layer, validation)
                                    ├── services/ (business logic)
                                    └── db/ (data access via Drizzle)
```

- Routes: parse request, validate input (Zod), call service, format response
- Services: business logic thuần, không biết HTTP, nhận typed params
- DB: Drizzle queries, không business logic

**Component Boundaries:**

- Feature folders tự chứa — không import cross-feature
- Shared code qua `components/shared/` hoặc `packages/shared`
- Hooks encapsulate data fetching — components chỉ render

**Data Flow:**

```
User action → Component → Hook → 
  ├── Online: TanStack Query → API → Service → DB
  └── Offline: PGlite (local) + Sync queue
```

## Requirements to Structure Mapping

| Module PRD     | Frontend                                      | Backend                                    | Shared                                         |
| -------------- | --------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| M1: Hàng hóa   | features/products/                            | routes/products.ts, services/inventory.ts  | schemas/product.ts                             |
| M2: Đơn giá    | features/pricing/                             | routes/price-lists.ts, services/pricing.ts | schemas/price-list.ts, utils/pricing-engine.ts |
| M3: POS        | features/pos/                                 | routes/orders.ts, services/order.ts        | schemas/order.ts                               |
| M4: Khách hàng | features/customers/                           | routes/customers.ts                        | schemas/customer.ts                            |
| M5: Hóa đơn    | features/orders/                              | routes/orders.ts                           | schemas/order.ts                               |
| M6: Công nợ    | features/debts/                               | routes/debts.ts, services/debt.ts          | schemas/debt.ts, utils/debt-allocator.ts       |
| M7: Báo cáo    | features/reports/                             | routes/reports.ts                          | —                                              |
| Offline        | stores/offline.ts, lib/sync.ts, lib/pglite.ts | routes/sync.ts, services/sync.ts           | constants/sync-status.ts                       |
| Auth           | features/auth/                                | routes/auth.ts, middleware/auth.ts         | schemas/auth.ts, constants/roles.ts            |


---
