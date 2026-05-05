# Story 10.4: Ket noi 7 Event nghiep vu MVP

Status: ready-for-dev

## Story

As a chu cua hang,
I want he thong tu phat hien va canh bao 7 su kien quan trong,
So that toi xu ly bat thuong kip thoi ma khong can canh chung lien tuc.

## Dependencies

- Story 10-2: notification-service-core (done)
- Story 10-3: webhook-telegram-transport (done)
- packages/notifications already has: notify(), router, throttle, retry, 4 transports
- Schema: notificationTypeValues already declares all 7 event types

## Acceptance Criteria (BDD)

### AC1: auth.login.suspicious

**Given** user dang nhap tu IP/User-Agent khac thuong (so voi 5 lan login gan nhat)
**When** auth service detect bat thuong
**Then** emit `auth.login.suspicious` severity `warn` qua notify()
**And** context chua: userId, IP, userAgent

### AC2: auth.pin.locked

**Given** PIN nhap sai 5 lan lien tiep
**When** auth service lock PIN (pinLockedUntil set)
**Then** emit `auth.pin.locked` severity `warn`
**And** context chua: userId, lockedUntil

### AC3: order.high_value

**Given** don hang co tong tien > nguong cau hinh (mac dinh 5.000.000 VND)
**When** order service tao don thanh cong
**Then** emit `order.high_value` severity `info`
**And** context chua: orderId, total, customerName

### AC4: stock.negative

**Given** giao dich khien ton kho SP xuong duoi 0
**When** stock deduction xay ra trong order creation
**Then** emit `stock.negative` severity `error`
**And** context chua: productId, productName, currentStock, previousStock

### AC5: sync.failed_repeatedly

**Given** sync fail 3 lan lien tiep cho cung 1 batch
**When** sync service detect repeated failure
**Then** emit `sync.failed_repeatedly` severity `error`
**And** context chua: failCount, lastError, pendingCount

### AC6: audit.price_override

**Given** nhan vien sua gia duoi gia von (sau PIN override thanh cong)
**When** order service ghi nhan price override below cost
**Then** emit `audit.price_override` severity `warn`
**And** context chua: orderId, productName, originalPrice, newPrice, costPrice, userId

### AC7: system.error.unhandled

**Given** exception khong bat duoc o backend
**When** global error handler catch (non-ApiError, non-ZodError)
**Then** emit `system.error.unhandled` severity `critical`
**And** context chua: errorMessage, stack (truncated 500 chars), requestId

### AC8: Default rules seed

**Given** store moi tao, owner chua cau hinh rule
**When** store khoi tao xong (registerStoreOwner)
**Then** he thong seed 7 default rules map event -> console transport (enabled)
**And** owner co the bat them Telegram/webhook sau

### AC9: Event namespace convention

**Given** event type theo namespace `<domain>.<action>[.<qualifier>]`
**When** developer muon them event moi
**Then** cap nhat enum `notificationTypeValues` + Zod schema + event catalog

## Technical Notes

### Existing Code Touchpoints

| Event                  | File to modify                             | Hook point                                            |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------- |
| auth.login.suspicious  | `apps/api/src/services/auth.service.ts`    | `loginUser()` - after successful login, compare IP/UA |
| auth.pin.locked        | `apps/api/src/services/pin.service.ts`     | Line ~77-99, when `next >= MAX_PIN_ATTEMPTS`          |
| order.high_value       | `apps/api/src/services/orders.service.ts`  | After order creation succeeds                         |
| stock.negative         | `apps/api/src/services/orders.service.ts`  | Line ~366, after newStock calculated, check < 0       |
| sync.failed_repeatedly | `apps/api/src/routes/sync.routes.ts`       | Detect 3 consecutive failures                         |
| audit.price_override   | `apps/api/src/services/orders.service.ts`  | Line ~292, when item.priceOverride < costPrice        |
| system.error.unhandled | `apps/api/src/middleware/error-handler.ts` | Line 35, the catch-all branch                         |

### Architecture Decisions

- **Fire-and-forget**: notify() calls are async but NOT awaited in critical path (order creation). Use `void notify(...)` or `.catch(logger.error)` pattern to avoid blocking business logic.
- **Login history table**: Need new table `login_history` (userId, ip, userAgent, loginAt) to compare last 5 logins. Or use lightweight approach: store last 5 IPs in user metadata.
- **High-value threshold**: Store in `notification_settings` or ENV. Default 5_000_000 VND.
- **Seed on registration**: Call seed function inside `registerStoreOwner()` transaction.

### New files needed

- `apps/api/src/services/notification-emitter.ts` - Central helper wrapping notify() with fire-and-forget + logger
- `apps/api/src/services/login-history.service.ts` - Track login IPs for suspicious detection
- DB migration for `login_history` table

## Tasks / Subtasks

### Phase A: Infrastructure

- [ ] Task 1: Create notification emitter helper (AC: all)
  - [ ] 1.1: Create `apps/api/src/services/notification-emitter.ts`
  - [ ] 1.2: Export `emitEvent(db, event)` wrapping `notify()` with fire-and-forget + error logging
  - [ ] 1.3: Accept partial event (auto-fill id via uuidv7, occurredAt via new Date)

- [ ] Task 2: Create login history tracking (AC: #1)
  - [ ] 2.1: Add migration: table `login_history` (id, userId, storeId, ip, userAgent, loginAt)
  - [ ] 2.2: Create `apps/api/src/services/login-history.service.ts` with `recordLogin()` and `isLoginSuspicious()` (compare with last 5 entries)
  - [ ] 2.3: `isLoginSuspicious()` returns true if BOTH ip AND userAgent are new (not in last 5)

### Phase B: Auth Events

- [ ] Task 3: Emit auth.login.suspicious (AC: #1)
  - [ ] 3.1: In `loginUser()`, after success, call `recordLogin()` then `isLoginSuspicious()`
  - [ ] 3.2: If suspicious, call `emitEvent()` with type `auth.login.suspicious`, severity `warn`
  - [ ] 3.3: Pass IP/UA from request context (need to thread through LoginDeps)

- [ ] Task 4: Emit auth.pin.locked (AC: #2)
  - [ ] 4.1: In `pin.service.ts`, after setting pinLockedUntil (line ~79), call `emitEvent()`
  - [ ] 4.2: Event: type `auth.pin.locked`, severity `warn`, context: { userId, lockedUntil }

### Phase C: Order Events

- [ ] Task 5: Emit order.high_value (AC: #3)
  - [ ] 5.1: In `orders.service.ts`, after order creation succeeds, check total > threshold
  - [ ] 5.2: Threshold from ENV `HIGH_VALUE_ORDER_THRESHOLD` (default 5000000)
  - [ ] 5.3: Emit type `order.high_value`, severity `info`, context: { orderId, total, customerName }

- [ ] Task 6: Emit stock.negative (AC: #4)
  - [ ] 6.1: After stock deduction (~line 366), if newStock < 0, emit event
  - [ ] 6.2: Type `stock.negative`, severity `error`, context: { productId, productName, currentStock: newStock, previousStock }

- [ ] Task 7: Emit audit.price_override (AC: #6)
  - [ ] 7.1: At line ~292 where priceOverride detected, check if priceOverride < costPrice
  - [ ] 7.2: Emit type `audit.price_override`, severity `warn`, context: { orderId, productName, originalPrice, newPrice: priceOverride, costPrice, userId }

### Phase D: System Events

- [ ] Task 8: Emit sync.failed_repeatedly (AC: #5)
  - [ ] 8.1: In sync routes/service, track consecutive failures per batch
  - [ ] 8.2: When failCount >= 3, emit type `sync.failed_repeatedly`, severity `error`
  - [ ] 8.3: Context: { failCount, lastError, pendingCount }

- [ ] Task 9: Emit system.error.unhandled (AC: #7)
  - [ ] 9.1: In `error-handler.ts`, at the catch-all branch (line 35)
  - [ ] 9.2: Emit type `system.error.unhandled`, severity `critical`
  - [ ] 9.3: Context: { errorMessage: err.message, stack: err.stack?.slice(0, 500), requestId }
  - [ ] 9.4: Fire-and-forget, do NOT let notification failure affect error response

### Phase E: Seed & Verification

- [ ] Task 10: Seed default rules on store creation (AC: #8)
  - [ ] 10.1: Create `apps/api/src/services/notification-seed.service.ts`
  - [ ] 10.2: Function `seedDefaultRules(db, storeId)`: create 1 console channel + 7 rules
  - [ ] 10.3: Call in `registerStoreOwner()` inside transaction, after store + user created

- [ ] Task 11: Integration tests
  - [ ] 11.1: Test emitEvent helper (mock notify)
  - [ ] 11.2: Test login suspicious detection
  - [ ] 11.3: Test seed creates correct rules
  - [ ] 11.4: Test stock.negative emitted when stock goes below 0
  - [ ] 11.5: Test system.error.unhandled emitted on unhandled exception

- [ ] Task 12: Typecheck + full test suite pass
  - [ ] 12.1: `pnpm typecheck` all packages pass
  - [ ] 12.2: `pnpm test` full suite pass (no new failures)
