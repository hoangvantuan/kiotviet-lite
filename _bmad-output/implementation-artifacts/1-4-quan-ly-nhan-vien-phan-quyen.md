# Story 1.4: Quản lý nhân viên & Phân quyền

Status: done

## Story

As a chủ cửa hàng (Owner),
I want quản lý nhân viên, phân quyền theo role và thiết lập mã PIN xác thực,
So that mỗi người chỉ truy cập đúng chức năng được phép, thao tác nhạy cảm có lớp xác thực phụ và tôi theo dõi được toàn bộ hoạt động qua audit log.

## Acceptance Criteria (BDD)

### AC1: Tạo nhân viên mới (Owner-only)

**Given** Owner đã đăng nhập
**When** vào trang Cài đặt > Nhân viên > nhấn "Thêm nhân viên" và điền form: tên (bắt buộc 2-100 ký tự), số điện thoại (bắt buộc, đúng format VN 10 số), role (1 trong 3: owner/manager/staff), mã PIN (bắt buộc, đúng 6 chữ số)
**Then** hệ thống tạo record mới trong `users` liên kết đúng `store_id` của Owner hiện tại
**And** mã PIN được hash bằng bcrypt (rounds = 12) trước khi lưu, KHÔNG trả plaintext qua API
**And** số điện thoại unique trong store hiện tại, duplicate → trả 409 với message "Số điện thoại đã được sử dụng trong cửa hàng"
**And** response trả về user info (id, name, phone, role, isActive, createdAt) KHÔNG có pinHash/passwordHash
**And** UI hiển thị Toast success, đóng dialog, danh sách cập nhật ngay

### AC2: Danh sách nhân viên responsive

**Given** Owner ở trang Nhân viên
**When** trang load xong
**Then** hiển thị bảng (desktop ≥768px) với cột: tên, số điện thoại, vai trò (badge: Owner=tím `bg-purple-100 text-purple-700`, Manager=xanh `bg-blue-100 text-blue-700`, Staff=xám `bg-gray-100 text-gray-700`), trạng thái (Hoạt động/Khoá), ngày tạo, action (Edit/Khoá)
**And** mobile (<768px) chuyển sang dạng card list với cùng thông tin
**And** có ô tìm kiếm theo tên hoặc SĐT (debounce 300ms), filter theo role (dropdown: Tất cả/Owner/Manager/Staff)
**And** filter và search query là client-side trên list đã fetch (store nhỏ <100 NV)
**And** danh sách EmptyState khi chưa có ai khác Owner: icon Users, "Chưa có nhân viên", nút "Thêm nhân viên"

### AC3: Phân quyền 3 roles (RBAC)

**Given** hệ thống phân 3 roles: owner, manager, staff
**When** kiểm tra ma trận quyền

**Then** quyền theo bảng:

| Resource       | Action              | Owner | Manager       | Staff    |
| -------------- | ------------------- | ----- | ------------- | -------- |
| users          | manage (CRUD, lock) | ✅    | ❌            | ❌       |
| store-settings | manage              | ✅    | ❌            | ❌       |
| audit-logs     | viewAll             | ✅    | viewOwn+staff | viewOwn  |
| reports        | view                | ✅    | ✅            | ❌       |
| products       | manage              | ✅    | ✅            | ❌       |
| pos            | sell                | ✅    | ✅            | ✅       |
| orders         | viewAll             | ✅    | ✅            | own only |

**And** API middleware `requireRole(...roles)` kiểm tra `c.get('auth').role` trước handler, không đủ → throw `ApiError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này')` → 403
**And** frontend hook `usePermission(resource, action)` trả boolean để ẩn/hiện menu, button
**And** menu Sidebar/BottomTabBar/SettingsTab ẩn các mục user không có quyền (vd: Staff không thấy "Nhân viên", "Cài đặt cửa hàng", "Báo cáo")
**And** truy cập trực tiếp URL bị cấm → redirect `/` kèm Toast warning "Bạn không có quyền truy cập trang này"

### AC4: Xác thực PIN với rate limit

**Given** nhân viên có mã PIN đã hash trong DB
**When** nhân viên nhập PIN 6 số tại `<PinDialog>` để xác nhận thao tác nhạy cảm
**Then** API `POST /api/v1/users/:id/verify-pin` so khớp PIN bằng `bcrypt.compare`, trả response trong ≤200ms (P95 trên local DB)
**And** đúng → trả 200 `{ data: { ok: true } }`, frontend cho phép tiếp tục thao tác
**And** sai → trả 401 `{ error: { code: 'UNAUTHORIZED', message: 'Mã PIN không đúng', details: { remaining: <số lần còn lại> } } }`
**And** sau 5 lần sai liên tiếp trong 15 phút → user bị khoá PIN (`pin_locked_until = now() + 15 phút`), trả 423 `{ error: { code: 'BUSINESS_RULE_VIOLATION', message: 'Bạn đã nhập sai PIN quá 5 lần. Tài khoản bị khoá PIN đến HH:mm' } }`
**And** nhập PIN đúng → reset `failed_pin_attempts = 0`
**And** PIN dùng cho: sửa giá bán dưới giá vốn, override hạn mức nợ, thao tác xoá dữ liệu (sẽ tích hợp ở các epic sau, story này chỉ build endpoint + dialog)

### AC5: Sửa nhân viên + ràng buộc Owner

**Given** Owner ở danh sách nhân viên
**When** nhấn icon Edit → mở dialog form pre-filled
**Then** cho phép sửa: tên, role, isActive (lock/unlock), reset PIN (optional, nhập PIN 6 số mới)
**And** field `phone` hiển thị disabled (read-only), không cho sửa (tránh phải migrate refresh tokens)
**And** Owner KHÔNG thể hạ role của chính mình (`auth.userId === target.id && target.role === 'owner' && newRole !== 'owner'`) → API trả 422 "Owner không thể tự hạ vai trò"
**And** Owner CÓ thể sửa thông tin của Owner khác (chuyển quyền cho người khác)
**And** mỗi lần lưu thành công → ghi 1 record vào `audit_logs` với: `action='user.updated'`, `target_type='user'`, `target_id=<id>`, `changes` JSON `{ before: {...}, after: {...} }` (chỉ diff field thay đổi)
**And** reset PIN cũng ghi audit `action='user.pin_reset'` nhưng `changes` KHÔNG chứa PIN plaintext/hash, chỉ ghi `{ pin: 'reset' }`

### AC6: Khoá nhân viên + invalidate session

**Given** Owner xem danh sách
**When** nhấn nút "Khoá" → mở `<AlertDialog>` xác nhận → confirm
**Then** API set `is_active = false` trên user
**And** revoke tất cả refresh tokens của user đó: `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL`
**And** lần request kế tiếp của user đó sẽ fail refresh → frontend redirect `/login` (cơ chế đã có từ Story 1.2)
**And** ghi audit `action='user.locked'` hoặc `user.unlocked` (toggle ngược lại)
**And** Owner KHÔNG thể tự khoá chính mình → 422 "Không thể tự khoá tài khoản của mình"
**And** UI hiển thị badge "Khoá" màu đỏ trên danh sách, action button đổi thành "Mở khoá"

### AC7: Cài đặt cửa hàng

**Given** Owner vào trang Cài đặt > Cửa hàng
**When** trang load xong
**Then** hiển thị form với fields: `name` (bắt buộc 2-100 ký tự), `address` (optional, max 200), `phone` (optional, format VN), `logoUrl` (input upload file ảnh ≤2MB, chỉ chấp nhận `image/jpeg`, `image/png`)
**And** logo upload → tạm thời lưu base64 data URL trong DB (S3/CDN tích hợp ở Epic sau, scope story này dùng base64 ≤2MB)
**And** lưu thành công → API `PATCH /api/v1/store` cập nhật `stores` table, Toast success
**And** Header (top bar) re-fetch `useAuthStore.user` hoặc invalidate query → cập nhật tên cửa hàng ngay
**And** ghi audit `action='store.updated'` với diff fields
**And** API enforce: chỉ owner mới được PATCH store

### AC8: Audit log viewer + append-only

**Given** Owner vào trang Cài đặt > Lịch sử hoạt động (`/settings/audit`)
**When** trang load
**Then** hiển thị bảng `audit_logs` paginated 20 record/trang, sort `created_at DESC`: cột thời gian (format `HH:mm DD/MM/YYYY`), người thực hiện (tên + role badge), hành động (label tiếng Việt từ map), chi tiết (summary string)
**And** filter: người thực hiện (multi-select), loại action (multi-select theo prefix: `user.*`, `store.*`), khoảng thời gian (date range picker, mặc định 7 ngày)
**And** click 1 dòng → mở `<Sheet>` (drawer phải) hiển thị JSON `changes` formatted với diff before/after
**And** Manager: chỉ thấy log của Staff + của chính mình. Staff: chỉ thấy log của chính mình
**And** DB constraint: `audit_logs` chỉ cho INSERT, REVOKE UPDATE/DELETE bằng SQL: `REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC` trong migration
**And** API KHÔNG expose endpoint UPDATE/DELETE cho `audit_logs`, chỉ có GET với filter

## Tasks / Subtasks

### Phase A: Backend Schema + RBAC + Audit constraint

- [ ] Task 1: Mở rộng schema users + tạo schema audit_logs (AC: #1, #4, #5, #6, #8)
  - [ ] 1.1: Sửa `packages/shared/src/schema/users.ts`: thêm field `failedPinAttempts: integer().notNull().default(0)`, `pinLockedUntil: timestamp({ withTimezone: true })`. Field `pinHash: text()` đã có sẵn
  - [ ] 1.2: Tạo `packages/shared/src/schema/audit-logs.ts`: table `audit_logs` với fields: `id` (uuidv7 PK), `storeId` (uuid notNull, FK stores), `actorId` (uuid notNull, FK users), `action` (varchar 64 notNull), `targetType` (varchar 32), `targetId` (uuid), `changes` (jsonb), `ipAddress` (varchar 45), `userAgent` (text), `createdAt` (timestamp notNull defaultNow). Index trên `(storeId, createdAt DESC)` và `(actorId, createdAt DESC)`
  - [ ] 1.3: Export `auditLogs` từ `packages/shared/src/schema/index.ts`
  - [ ] 1.4: Tạo Drizzle migration (`pnpm --filter @kiotviet-lite/api db:generate`), kiểm tra SQL output đúng
  - [ ] 1.5: Tạo migration thủ công thêm sau migration generated: `REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;` (file `apps/api/src/db/migrations/XXXX_audit_logs_append_only.sql` hoặc append vào file generated). Test bằng cách thử `UPDATE` trong PGlite test → phải fail. Nếu PGlite không hỗ trợ REVOKE → ghi nhận trong test note, áp dụng REVOKE chỉ trong production migration
  - [ ] 1.6: Chạy `pnpm --filter @kiotviet-lite/api db:migrate` lên dev DB

- [ ] Task 2: Zod schemas cho users + audit (AC: #1, #4, #5, #7, #8)
  - [ ] 2.1: Tạo `packages/shared/src/schema/user-management.ts`:
    - `createUserSchema` (name 2-100, phone VN regex từ `auth.ts`, role enum, pin regex `/^\d{6}$/`)
    - `updateUserSchema` (name?, role?, isActive?, pin? optional)
    - `verifyPinSchema` (pin regex `/^\d{6}$/`)
    - `userListItemSchema` (id, name, phone, role, isActive, createdAt)
    - Export types `CreateUserInput`, `UpdateUserInput`, `VerifyPinInput`, `UserListItem`
  - [ ] 2.2: Tạo `packages/shared/src/schema/store-settings.ts`:
    - `updateStoreSchema` (name 2-100, address? max 200, phone? VN, logoUrl? string url hoặc data URL)
    - `storeSettingsSchema` (id, name, address, phone, logoUrl, updatedAt)
  - [ ] 2.3: Tạo `packages/shared/src/schema/audit-log.ts`:
    - `auditActionSchema` enum: `user.created`, `user.updated`, `user.locked`, `user.unlocked`, `user.pin_reset`, `store.updated`, `auth.pin_failed`, `auth.pin_locked`
    - `auditLogItemSchema` (id, actorId, actorName, actorRole, action, targetType, targetId, changes, createdAt)
    - `auditLogQuerySchema` (page default 1, pageSize default 20 max 100, actorIds[], actions[], from, to)
  - [ ] 2.4: Re-export tất cả từ `packages/shared/src/schema/index.ts`

- [ ] Task 3: RBAC middleware + permission constants (AC: #3)
  - [ ] 3.1: Tạo `packages/shared/src/constants/permissions.ts`:
    ```ts
    export const PERMISSIONS = {
      'users.manage': ['owner'],
      'store.manage': ['owner'],
      'audit.viewAll': ['owner'],
      'audit.viewTeam': ['manager'], // sees own + staff
      'audit.viewOwn': ['owner', 'manager', 'staff'],
      'reports.view': ['owner', 'manager'],
      'products.manage': ['owner', 'manager'],
      'pos.sell': ['owner', 'manager', 'staff'],
    } as const satisfies Record<string, ReadonlyArray<UserRole>>
    export type Permission = keyof typeof PERMISSIONS
    export function hasPermission(role: UserRole, perm: Permission): boolean {
      return (PERMISSIONS[perm] as ReadonlyArray<UserRole>).includes(role)
    }
    ```
  - [ ] 3.2: Tạo `apps/api/src/middleware/rbac.middleware.ts`:
    ```ts
    export function requirePermission(perm: Permission): MiddlewareHandler {
      return async (c, next) => {
        const auth = c.get('auth')
        if (!hasPermission(auth.role, perm)) {
          throw new ApiError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này')
        }
        await next()
      }
    }
    ```
  - [ ] 3.3: Re-export `permissions.ts` từ `packages/shared/src/index.ts`

### Phase B: Backend Services + Routes

- [ ] Task 4: Audit service (AC: #5, #6, #7, #8)
  - [ ] 4.1: Tạo `apps/api/src/services/audit.service.ts`:
    - `logAction({ db, storeId, actorId, action, targetType?, targetId?, changes?, ipAddress?, userAgent? })`: insert vào `audit_logs`
    - `listAudit({ db, storeId, currentUser, query })`: query với filter, scope theo role:
      - owner: tất cả `WHERE store_id = ?`
      - manager: `WHERE store_id = ? AND (actor_id = ? OR actor.role = 'staff')`
      - staff: `WHERE store_id = ? AND actor_id = ?`
    - Helper `diffObjects(before, after)` trả `{ field: { before, after } }` chỉ cho fields thay đổi
  - [ ] 4.2: Helper `getRequestMeta(c)` lấy `c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip')` cho IP, `c.req.header('user-agent')` cho UA. Pass vào mọi `logAction` call

- [ ] Task 5: Users service (AC: #1, #5, #6)
  - [ ] 5.1: Tạo `apps/api/src/services/users.service.ts`:
    - `listUsers({ db, storeId })`: trả `UserListItem[]` (KHÔNG kèm passwordHash, pinHash). Sort `createdAt DESC`
    - `createUser({ db, actorId, storeId, input })`: hash password tạm bằng `crypto.randomUUID()` (user mới chưa có password, chỉ có PIN; sẽ bổ sung flow set password sau), hash PIN, insert. Throw CONFLICT nếu phone trùng trong store. Gọi `audit.logAction({ action: 'user.created', targetType: 'user', targetId: newUser.id, changes: { name, phone, role } })`
    - LƯU Ý: AC1 không yêu cầu password cho NV mới. Thực dụng: tạo `passwordHash` bằng random string không thể login bằng password, chỉ login bằng PIN ở Epic sau. Document quyết định trong Dev Notes.
    - `updateUser({ db, actor, targetId, input })`: load target, check `target.storeId === actor.storeId`. Validate ràng buộc Owner self-demote (`actor.id === targetId && target.role === 'owner' && input.role && input.role !== 'owner'` → throw `BUSINESS_RULE_VIOLATION`). Diff before/after, update, ghi audit. Nếu input có `pin` → hash, set `pinHash`, reset `failedPinAttempts=0`, `pinLockedUntil=null`, ghi audit riêng `user.pin_reset`
    - `lockUser({ db, actor, targetId })`: check `actor.id !== targetId`, set `isActive=false`, revoke tất cả refresh tokens của user đó (`UPDATE refresh_tokens SET revokedAt=now() WHERE userId=? AND revokedAt IS NULL`), audit `user.locked`
    - `unlockUser`: ngược lại, reset `failedPinAttempts=0`, `pinLockedUntil=null`, audit `user.unlocked`

- [ ] Task 6: PIN service với rate limit (AC: #4)
  - [ ] 6.1: Tạo `apps/api/src/services/pin.service.ts`:
    ```ts
    const MAX_ATTEMPTS = 5
    const LOCK_DURATION_MS = 15 * 60 * 1000
    export async function verifyPin({ db, userId, pin }) {
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
      if (!user || !user.pinHash) throw new ApiError('NOT_FOUND', 'Người dùng không có PIN')
      // Check lock
      if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
        throw new ApiError(
          'BUSINESS_RULE_VIOLATION',
          `Bạn đã nhập sai PIN quá ${MAX_ATTEMPTS} lần. Tài khoản bị khoá PIN đến ${formatTime(user.pinLockedUntil)}`,
        )
      }
      const ok = await bcrypt.compare(pin, user.pinHash)
      if (!ok) {
        const next = (user.failedPinAttempts ?? 0) + 1
        if (next >= MAX_ATTEMPTS) {
          await db
            .update(users)
            .set({
              failedPinAttempts: next,
              pinLockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
            })
            .where(eq(users.id, userId))
          // audit auth.pin_locked
          throw new ApiError('BUSINESS_RULE_VIOLATION', '...')
        }
        await db.update(users).set({ failedPinAttempts: next }).where(eq(users.id, userId))
        // audit auth.pin_failed
        throw new ApiError('UNAUTHORIZED', 'Mã PIN không đúng', { remaining: MAX_ATTEMPTS - next })
      }
      // Success: reset
      await db
        .update(users)
        .set({ failedPinAttempts: 0, pinLockedUntil: null })
        .where(eq(users.id, userId))
      return { ok: true }
    }
    ```
  - [ ] 6.2: State `failed_pin_attempts` reset khi: nhập đúng, hoặc admin reset PIN, hoặc qua thời điểm `pinLockedUntil` (lazy reset trên request kế tiếp khi lock đã hết hạn → coi như attempts = 0)

- [ ] Task 7: Store service (AC: #7)
  - [ ] 7.1: Tạo `apps/api/src/services/store.service.ts`:
    - `getStore({ db, storeId })`: trả store info
    - `updateStore({ db, actor, input })`: load before, update với `storeId = actor.storeId`, ghi audit `store.updated` với diff
  - [ ] 7.2: Logo upload: validate base64 data URL prefix `data:image/(png|jpeg);base64,`, decode size ≤2MB. Reject nếu không phải. Trong story này lưu trực tiếp base64 vào `logoUrl` field

- [ ] Task 8: Routes mounting (AC: #1-#8)
  - [ ] 8.1: Tạo `apps/api/src/routes/users.routes.ts`:
    - `GET /` (`requireAuth`, `requirePermission('users.manage')`) → listUsers
    - `POST /` (`requireAuth`, `requirePermission('users.manage')`) → createUser
    - `PATCH /:id` (`requireAuth`, `requirePermission('users.manage')`) → updateUser
    - `POST /:id/lock` (`requireAuth`, `requirePermission('users.manage')`) → lockUser
    - `POST /:id/unlock` (`requireAuth`, `requirePermission('users.manage')`) → unlockUser
    - `POST /verify-pin` (`requireAuth` only, không cần permission, mọi user xác thực PIN của chính mình): verifyPin với `userId = auth.userId`
    - Mount `app.onError(errorHandler)` cho route group
  - [ ] 8.2: Tạo `apps/api/src/routes/store.routes.ts`:
    - `GET /` (requireAuth) → getStore (mọi role được xem)
    - `PATCH /` (requireAuth, requirePermission('store.manage')) → updateStore
  - [ ] 8.3: Tạo `apps/api/src/routes/audit.routes.ts`:
    - `GET /` (requireAuth, requirePermission('audit.viewOwn')) → listAudit (scope theo role bên trong service)
  - [ ] 8.4: Mount vào `apps/api/src/index.ts`:
    ```ts
    app.route('/api/v1/users', createUsersRoutes({ db }))
    app.route('/api/v1/store', createStoreRoutes({ db }))
    app.route('/api/v1/audit-logs', createAuditRoutes({ db }))
    ```

### Phase C: Frontend (web)

- [ ] Task 9: API client + hooks chung (AC: #1-#8)
  - [ ] 9.1: Tạo `apps/web/src/features/users/users-api.ts`:
    - `listUsersApi()`, `createUserApi(input)`, `updateUserApi(id, input)`, `lockUserApi(id)`, `unlockUserApi(id)`, `verifyPinApi(input)`
  - [ ] 9.2: Tạo `apps/web/src/features/users/use-users.ts` (TanStack Query hooks):
    - `useUsersQuery()` (queryKey `['users']`)
    - `useCreateUserMutation()`, `useUpdateUserMutation()`, `useLockUserMutation()`, `useUnlockUserMutation()` → invalidate `['users']` on success
  - [ ] 9.3: Tạo `apps/web/src/features/users/use-verify-pin.ts`: mutation cho verifyPin

- [ ] Task 10: Permission hook + route guard (AC: #3)
  - [ ] 10.1: Tạo `apps/web/src/hooks/use-permission.ts`:
    ```ts
    export function usePermission(perm: Permission): boolean {
      const role = useAuthStore((s) => s.user?.role)
      if (!role) return false
      return hasPermission(role, perm)
    }
    ```
  - [ ] 10.2: Cập nhật `apps/web/src/components/layout/nav-items.ts`: mỗi nav item kèm `requiredPermission?: Permission`. Vd: Settings → `users.manage`. Trong `Sidebar.tsx`/`BottomTabBar.tsx` filter items theo `usePermission`
  - [ ] 10.3: Tạo `apps/web/src/router.tsx` thêm `beforeLoad` cho route mới: `/settings/staff`, `/settings/store`, `/settings/audit` → check permission, throw `redirect({ to: '/', search: { error: 'forbidden' } })` nếu không có quyền. Home page show toast nếu `search.error === 'forbidden'`

- [ ] Task 11: Settings page với tabs (AC: #5, #7, #8)
  - [ ] 11.1: Refactor `apps/web/src/pages/settings-page.tsx` thành layout với `<Tabs>` (shadcn/ui): "Cửa hàng", "Nhân viên", "Lịch sử hoạt động"
  - [ ] 11.2: Thêm sub-routes trong router:
    - `/settings` → redirect `/settings/store`
    - `/settings/store`, `/settings/staff`, `/settings/audit`
  - [ ] 11.3: Mỗi tab render component riêng: `<StoreSettingsForm>`, `<StaffManager>`, `<AuditLogViewer>`

- [ ] Task 12: StaffManager + dialogs (AC: #1, #2, #5, #6)
  - [ ] 12.1: Tạo `apps/web/src/features/users/components/staff-manager.tsx`: header với nút "Thêm nhân viên", search input, role filter, render `<StaffTable>` (desktop) / `<StaffCardList>` (mobile dùng `useMediaQuery('(min-width: 768px)')`). EmptyState khi list rỗng
  - [ ] 12.2: Tạo `apps/web/src/features/users/components/staff-table.tsx`: table với cột name, phone, role badge, status badge, createdAt, action (Edit + Lock/Unlock buttons)
  - [ ] 12.3: Tạo `apps/web/src/features/users/components/staff-card-list.tsx`: card layout cho mobile
  - [ ] 12.4: Tạo `apps/web/src/features/users/components/staff-form-dialog.tsx`: shadcn/ui `<Dialog>` với react-hook-form + zodResolver(createUserSchema | updateUserSchema). Mode `create` hoặc `edit`. Trong edit: phone disabled, optional pin field "Đặt PIN mới (để trống nếu không đổi)". Nút "Lưu" disable khi !isValid. Mapping API errors → form.setError như pattern Story 1.2
  - [ ] 12.5: Tạo `apps/web/src/features/users/components/lock-confirm-dialog.tsx`: shadcn/ui `<AlertDialog>` xác nhận khoá/mở khoá
  - [ ] 12.6: Role badge component `<RoleBadge role={role} />` reusable: map role → label tiếng Việt + màu Tailwind

- [ ] Task 13: PIN Dialog component (AC: #4)
  - [ ] 13.1: Tạo `apps/web/src/features/auth/components/pin-dialog.tsx`: shadcn/ui `<Dialog>` chứa 6 ô input số (dùng `<InputOTP>` từ shadcn/ui hoặc 6 `<Input maxLength=1>`). Auto-focus ô tiếp theo khi gõ, backspace lùi
  - [ ] 13.2: Props: `open`, `onOpenChange`, `onVerified: () => void`, `title?`, `description?`. Submit khi đủ 6 số
  - [ ] 13.3: Hiển thị error message từ API (sai PIN, locked) bên dưới input. Khi locked → disable input + show countdown "Mở khoá sau MM:ss"
  - [ ] 13.4: Reset internal state khi `open` thay đổi
  - [ ] 13.5: Story này KHÔNG tích hợp PinDialog vào flow nghiệp vụ nào (chỉ build component + test). Tích hợp ở các epic sau (sửa giá dưới vốn, override hạn mức nợ)

- [ ] Task 14: StoreSettingsForm (AC: #7)
  - [ ] 14.1: Tạo `apps/web/src/features/settings/store-settings-form.tsx`: react-hook-form + zodResolver(updateStoreSchema)
  - [ ] 14.2: Logo upload: `<input type="file" accept="image/jpeg,image/png">`, đọc bằng FileReader.readAsDataURL, validate size client-side ≤2MB, set `logoUrl` field. Hiển thị preview
  - [ ] 14.3: Sau lưu thành công → invalidate `['store']` và `['me']` queries → Header refetch tên cửa hàng

- [ ] Task 15: AuditLogViewer (AC: #8)
  - [ ] 15.1: Tạo `apps/web/src/features/audit/components/audit-log-viewer.tsx`: header với title + nút Filter (mở Sheet), table list paginated
  - [ ] 15.2: Tạo `apps/web/src/features/audit/components/audit-filter-sheet.tsx`: shadcn/ui `<Sheet>` với form filter: date range, multi-select actor, multi-select action category
  - [ ] 15.3: Tạo `apps/web/src/features/audit/components/audit-detail-sheet.tsx`: drawer hiển thị JSON `changes` formatted (dùng `<pre>` với syntax highlight đơn giản hoặc bảng before/after)
  - [ ] 15.4: Action label map: `apps/web/src/features/audit/action-labels.ts`: `{ 'user.created': 'Tạo nhân viên', 'user.updated': 'Sửa nhân viên', ... }`
  - [ ] 15.5: Pagination: nút Trước/Sau + "Trang X/Y", giữ filter state trong URL search params (TanStack Router `useSearch`)

### Phase D: Tests + Integration

- [ ] Task 16: Unit tests (AC: #1, #3, #4, #5, #6)
  - [ ] 16.1: `packages/shared/src/schema/user-management.test.ts`: validate createUserSchema/updateUserSchema/verifyPinSchema (valid + invalid cases)
  - [ ] 16.2: `packages/shared/src/constants/permissions.test.ts`: ma trận quyền đầy đủ 3 roles × tất cả permissions
  - [ ] 16.3: `apps/api/src/services/pin.service.test.ts` (Vitest + PGlite): verify đúng → ok+reset attempts. Sai 1-4 lần → trả remaining. Sai lần 5 → set lock 15 phút. Đang lock → throw 422. Lock hết hạn → request mới được phép thử lại

- [ ] Task 17: API integration tests (AC: #1-#8)
  - [ ] 17.1: `apps/api/src/__tests__/users.integration.test.ts`:
    - Owner tạo NV thành công, response không leak pinHash
    - Manager/Staff gọi POST /users → 403
    - Tạo NV trùng phone trong store → 409
    - Owner sửa role chính mình từ owner → manager → 422
    - Owner khoá NV → user.isActive=false + tất cả refresh tokens revoked
    - Owner khoá chính mình → 422
    - Verify PIN đúng/sai/lock theo AC4
  - [ ] 17.2: `apps/api/src/__tests__/audit.integration.test.ts`:
    - Mọi action trong test 17.1 ghi đúng vào audit_logs
    - Owner GET audit → thấy tất cả store. Manager → chỉ thấy của staff + own. Staff → chỉ own
    - Test REVOKE UPDATE/DELETE constraint nếu PGlite hỗ trợ. Nếu không hỗ trợ → skip với note "Production migration enforces"
  - [ ] 17.3: `apps/api/src/__tests__/store.integration.test.ts`:
    - Owner PATCH store thành công, audit ghi nhận diff
    - Manager/Staff PATCH store → 403
    - Logo base64 quá 2MB → 400

- [ ] Task 18: Frontend integration + manual verify (AC: all)
  - [ ] 18.1: `pnpm typecheck` pass cho tất cả packages
  - [ ] 18.2: `pnpm lint` pass (0 errors)
  - [ ] 18.3: `pnpm test` pass (toàn bộ suite, không regression)
  - [ ] 18.4: Manual flow Owner: đăng nhập → /settings/staff → tạo Manager + Staff → verify list cập nhật → Edit Staff đổi role → verify audit log ghi nhận
  - [ ] 18.5: Manual flow permission: đăng xuất Owner, đăng nhập Staff (đã tạo) → kiểm tra menu Settings/Báo cáo bị ẩn → truy cập trực tiếp `/settings/staff` → redirect `/`
  - [ ] 18.6: Manual flow PIN: tại trang settings → mở PinDialog (build trang test tạm `/settings/staff` thêm nút "Thử PIN của tôi") → nhập sai 5 lần → verify lock 15 phút
  - [ ] 18.7: Manual flow lock: Owner khoá Staff đang đăng nhập → next request từ Staff browser → bị redirect /login

## Dev Notes

### Pattern reuse từ Story 1.2 và 1.3 (BẮT BUỘC tuân thủ)

| Khu vực          | File hiện có                                                                    | Cách dùng                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| JWT sign/verify  | `apps/api/src/lib/jwt.ts`                                                       | Đã có `verifyAccessToken`, dùng qua `requireAuth` middleware                                                                        |
| Bcrypt           | `apps/api/src/lib/password.ts`: `hashPassword`, `verifyPassword`                | PIN hash dùng `hashPassword(pin)` (rounds 12 từ env). Verify dùng `verifyPassword(plain, hash)` hoặc gọi `bcrypt.compare` trực tiếp |
| Error handler    | `apps/api/src/middleware/error-handler.ts`                                      | Throw `ApiError(code, message, details?)` từ service. KHÔNG return error response thủ công                                          |
| Auth middleware  | `apps/api/src/middleware/auth.middleware.ts`: `requireAuth`                     | Set `c.get('auth')` = `{ userId, storeId, role }`. Mọi service nhận `actor` thay vì re-fetch                                        |
| Cookie helpers   | `apps/api/src/lib/cookies.ts`                                                   | KHÔNG cần ở story này (PIN không tạo cookie)                                                                                        |
| API client web   | `apps/web/src/lib/api-client.ts`: `apiClient.get/post/patch` + `ApiClientError` | Đã handle 401 auto-refresh. PATCH chưa thấy → kiểm tra api-client.ts, bổ sung method nếu cần                                        |
| Auth store       | `apps/web/src/stores/use-auth-store.ts`                                         | `useAuthStore((s) => s.user?.role)` cho permission check                                                                            |
| Form pattern     | `apps/web/src/features/auth/register-form.tsx`                                  | react-hook-form + zodResolver, mode `onTouched`, error inline `text-sm text-destructive`, mapping API error → `form.setError`       |
| Toast            | `apps/web/src/lib/toast.ts`: `showSuccess`, `showError`                         | Dùng cho mọi mutation success/error                                                                                                 |
| Layout           | `apps/web/src/components/layout/app-layout.tsx` + `nav-items.ts`                | Filter nav-items theo permission                                                                                                    |
| Hook media query | `apps/web/src/hooks/use-media-query.ts`                                         | `useMediaQuery('(min-width: 768px)')` cho responsive table/card switch                                                              |

### Files cần TẠO MỚI

**Schema (packages/shared/src/schema/):**

- `audit-logs.ts` (Drizzle table)
- `user-management.ts` (Zod cho create/update/verify PIN)
- `store-settings.ts` (Zod cho update store)
- `audit-log.ts` (Zod cho audit query/response)

**Constants (packages/shared/src/constants/):**

- `permissions.ts` (PERMISSIONS map + hasPermission helper)

**Backend services (apps/api/src/services/):**

- `users.service.ts`
- `audit.service.ts`
- `pin.service.ts`
- `store.service.ts`

**Backend middleware (apps/api/src/middleware/):**

- `rbac.middleware.ts` (`requirePermission`)

**Backend routes (apps/api/src/routes/):**

- `users.routes.ts`
- `store.routes.ts`
- `audit.routes.ts`

**Frontend (apps/web/src/):**

- `hooks/use-permission.ts`
- `features/users/users-api.ts`, `use-users.ts`, `use-verify-pin.ts`
- `features/users/components/staff-manager.tsx`, `staff-table.tsx`, `staff-card-list.tsx`, `staff-form-dialog.tsx`, `lock-confirm-dialog.tsx`, `role-badge.tsx`
- `features/auth/components/pin-dialog.tsx`
- `features/settings/store-settings-form.tsx`, `store-settings-api.ts`
- `features/audit/components/audit-log-viewer.tsx`, `audit-filter-sheet.tsx`, `audit-detail-sheet.tsx`
- `features/audit/action-labels.ts`, `audit-api.ts`, `use-audit-logs.ts`

**Files SỬA:**

- `packages/shared/src/schema/users.ts`: thêm `failedPinAttempts`, `pinLockedUntil`
- `packages/shared/src/schema/index.ts`: export schemas mới
- `packages/shared/src/index.ts`: export `permissions.ts`
- `apps/api/src/index.ts`: mount 3 routes mới
- `apps/web/src/router.tsx`: thêm sub-routes `/settings/store`, `/settings/staff`, `/settings/audit` + permission guards
- `apps/web/src/components/layout/nav-items.ts`: thêm `requiredPermission` cho mỗi item
- `apps/web/src/components/layout/sidebar.tsx`, `bottom-tab-bar.tsx`: filter theo permission
- `apps/web/src/pages/settings-page.tsx`: thêm Tabs layout

### Permission matrix (đầy đủ cho story này)

| Permission       | Owner | Manager | Staff | Resource liên quan              |
| ---------------- | ----- | ------- | ----- | ------------------------------- |
| `users.manage`   | ✅    | ❌      | ❌    | CRUD nhân viên, lock            |
| `store.manage`   | ✅    | ❌      | ❌    | Sửa cài đặt cửa hàng            |
| `audit.viewAll`  | ✅    | ❌      | ❌    | Xem toàn bộ audit log của store |
| `audit.viewTeam` | ❌    | ✅      | ❌    | Xem log staff + own             |
| `audit.viewOwn`  | ✅    | ✅      | ✅    | Xem log của chính mình          |

Cách scope query trong `audit.service.ts`:

```ts
if (hasPermission(role, 'audit.viewAll')) {
  where = eq(auditLogs.storeId, storeId)
} else if (hasPermission(role, 'audit.viewTeam')) {
  // join users, filter actor.role === 'staff' OR actor.id === currentUserId
} else {
  where = and(eq(auditLogs.storeId, storeId), eq(auditLogs.actorId, currentUserId))
}
```

### PIN Security checklist

- [x] Hash bằng `bcrypt` (rounds = 12, cùng config với password)
- [x] KHÔNG bao giờ log PIN plaintext (kể cả trong audit_logs.changes — chỉ ghi `{ pin: 'reset' }`)
- [x] KHÔNG trả `pinHash` qua bất kỳ API response nào (filter ở service layer, không dựa vào frontend)
- [x] Rate limit: 5 lần sai liên tiếp → khoá 15 phút (state lưu trong `users.failedPinAttempts` + `pinLockedUntil`)
- [x] Counter reset khi: nhập đúng, admin reset PIN, hoặc qua thời điểm `pinLockedUntil`
- [x] Endpoint verify-pin chỉ cho user xác thực PIN của chính mình (`auth.userId`), không cho verify PIN người khác
- [x] PIN format strict: đúng 6 chữ số (regex `/^\d{6}$/`), KHÔNG cho phép ký tự khác

### Audit log append-only (DB-level enforcement)

```sql
-- Sau khi Drizzle generate migration tạo table:
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
-- Nếu role app riêng (vd `kiotviet_app`): REVOKE UPDATE, DELETE ON audit_logs FROM kiotviet_app;
```

**Lưu ý PGlite testing:** PGlite có thể không enforce REVOKE đầy đủ. Strategy:

1. Thử test trong PGlite, nếu fail → wrap test với `it.skip()` kèm comment "production migration enforces"
2. Đảm bảo migration cuối cùng (file `.sql` riêng hoặc append vào generated) chứa REVOKE statement
3. Production verify thủ công: connect psql với app role, thử `UPDATE audit_logs SET ... WHERE id = ?` → phải lỗi permission denied

### Decision: NV mới chỉ có PIN, chưa có password login

Story này AC1 chỉ yêu cầu nhập PIN khi tạo NV (không nhập password). Vì `users.passwordHash` notNull, ta:

**Option A (chọn):** Tạo `passwordHash = await hashPassword(crypto.randomUUID())` (random, không ai biết). NV mới không thể login bằng password, chỉ chủ Owner biết PIN của họ. Flow login bằng PIN sẽ implement ở Epic sau.

**Option B (không chọn):** Đổi schema cho `passwordHash` nullable. Phá vỡ login pattern hiện tại của Story 1.2.

→ **Document quyết định trong code comment trên `users.service.ts:createUser`**

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG lưu PIN plaintext trong DB, log, hoặc audit_logs
- KHÔNG cho Owner tự hạ role chính mình xuống dưới owner (validate ở service, KHÔNG chỉ frontend)
- KHÔNG cho Owner tự khoá chính mình (tránh lock-out)
- KHÔNG cho phép UPDATE/DELETE trên `audit_logs` qua bất kỳ API nào
- KHÔNG re-fetch user trong middleware nếu đã có `c.get('auth')` trừ khi cần kiểm tra `isActive` realtime (chấp nhận stale 15 phút bằng access token TTL)
- KHÔNG trả `passwordHash`, `pinHash`, `failedPinAttempts`, `pinLockedUntil` qua API response. Filter trong service `toUserListItem(user)`
- KHÔNG hardcode permission map ở frontend. Dùng từ `@kiotviet-lite/shared/constants/permissions`
- KHÔNG bypass `storeId` filter trong query users/audit (multi-tenant safety)
- KHÔNG dùng PATCH cho lock/unlock (idempotency unclear). Dùng POST `/lock` và POST `/unlock` riêng
- KHÔNG tích hợp PinDialog vào nghiệp vụ trong story này (out of scope, sẽ làm ở Epic 3/5)
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG tạo Zod schema trong `apps/`, luôn ở `packages/shared`

### Project Structure Notes

- Theo architecture docs: feature dùng `features/<domain>/components/PascalCase.tsx`. Pattern hiện tại Story 1.2/1.3 dùng `features/auth/login-form.tsx` (kebab-case, KHÔNG nest `components/`). **Tuân theo pattern hiện tại** (kebab-case flat) để nhất quán với 1.2/1.3, KHÔNG copy nguyên kebab-case theo architecture docs cũ
- Schema files trong `packages/shared/src/schema/` dùng kebab-case (vd `user-management.ts`, không `userManagement.ts`)
- Service files trong `apps/api/src/services/` dùng kebab-case `users.service.ts` (giống `auth.service.ts`)
- Route files: `users.routes.ts` (giống `auth.routes.ts`)

**Variance từ architecture docs đã chấp nhận:**

- Pages ở `apps/web/src/pages/*-page.tsx` (KHÔNG `routes/_authenticated/...` như docs). Đã established từ Story 1.2/1.3
- Code-based TanStack Router (KHÔNG file-based plugin)

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-1-khi-to-d-n-qun-tr-ca-hng.md#Story 1.4]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Auth, #Settings, #audit-logs.ts]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/audit-log-viewer.md] (full UX spec audit viewer)
- [Source: _bmad-output/implementation-artifacts/1-2-dang-ky-cua-hang-dang-nhap.md#Pattern auth service, JWT, error handler, form pattern]
- [Source: _bmad-output/implementation-artifacts/1-3-layout-ung-dung-navigation.md#nav-items.ts, useMediaQuery, Sheet pattern]
- [Source: packages/shared/src/schema/users.ts] (đã có `pinHash` field)
- [Source: packages/shared/src/schema/auth.ts] (phoneSchema, userRoleSchema, UserRole type)
- [Source: apps/api/src/middleware/auth.middleware.ts] (AuthContext type)
- [Source: apps/api/src/lib/errors.ts] (ApiError + codes: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, BUSINESS_RULE_VIOLATION)
- [Source: apps/api/src/services/auth.service.ts] (pattern transaction + audit-style logging)
- [Source: apps/web/src/features/auth/register-form.tsx] (form + RHF + zodResolver pattern, mapping API error)
- [Web: bcryptjs npm](https://www.npmjs.com/package/bcryptjs) (đã cài, dùng `bcrypt.compare` cho PIN)
- [Web: shadcn/ui InputOTP](https://ui.shadcn.com/docs/components/input-otp) cho PIN Dialog
- [Web: shadcn/ui Sheet](https://ui.shadcn.com/docs/components/sheet) cho audit detail drawer
- [Web: shadcn/ui Tabs](https://ui.shadcn.com/docs/components/tabs) cho settings layout
- [Web: PostgreSQL REVOKE](https://www.postgresql.org/docs/current/sql-revoke.html) cho audit_logs append-only

### Review Findings

#### Decision Needed (Resolved)

- [x] [Review][Decision] D1: Cho phép tạo nhiều Owner trong cùng store? → **Cho phép** (by design)
- [x] [Review][Decision] D2: HTTP status code khi PIN bị khoá: 423 vs 422? → **Thêm LOCKED=423** ✅ Fixed
- [x] [Review][Decision] D3: Phone unique scope: toàn hệ thống vs trong store? → **Global unique** (1 SĐT = 1 tài khoản). ✅ Fixed: check global + catch constraint error
- [x] [Review][Decision] D4: Audit log scoping theo role hiện tại hay role lúc ghi? → **Lưu actorRole vào audit_logs** ✅ Fixed: migration 0004, logAction lưu role, query fallback

#### Patch (Fixed)

- [x] [Review][Patch] P1: Race condition PIN verification ✅ Fixed: db.transaction() + SELECT...FOR UPDATE + return outcome thay vì throw trong transaction [pin.service.ts]
- [x] [Review][Patch] P2: Audit log ngoài transaction ✅ Fixed: wrap operation+audit trong db.transaction() [users.service.ts, store.service.ts, pin.service.ts]
- [x] [Review][Patch] P3: isActive check khi verify PIN ✅ Fixed: thêm check user.isActive trước verify [pin.service.ts]
- [x] [Review][Patch] P4: TOCTOU race khi tạo user ✅ Fixed: try-catch DB constraint error, convert sang CONFLICT [users.service.ts]
- [x] [Review][Patch] P5: UUID validation route params ✅ Fixed: Zod uuid validation cho :id [users.routes.ts]
- [x] [Review][Patch] P6: Manager/Staff useUsersQuery 403 ✅ Fixed: conditional fetch khi có permission users.manage [audit-log-viewer.tsx, use-users.ts]
- [x] [Review][Patch] P7: logoUrl empty string ✅ Fixed: `!== undefined && !== null` thay vì truthy check [store.service.ts]
- [x] [Review][Patch] P8: Date filter timezone — Dismissed: behavior hiện tại đúng (local time → UTC conversion)
- [x] [Review][Patch] P9: PIN timing side-channel ✅ Fixed: dummy bcrypt compare khi user không tồn tại [pin.service.ts]
- [x] [Review][Patch] P10: Logo Zod max size ✅ Fixed: `.max(2_800_000)` trước `.regex()` [store-settings.ts]
- [ ] [Review][Patch] P10: Logo Zod schema không có .max() trên string, client-side regex chạy trên chuỗi multi-MB gây lag — Thêm `.max(2_800_000)` vào Zod string trước `.regex()` [store-settings.ts:18-21]

#### Deferred

- [x] [Review][Defer] W1: REVOKE UPDATE, DELETE chỉ áp dụng FROM PUBLIC, không chặn app role cụ thể [0003_curved_vargas.sql] — deferred, production deployment concern, đã ghi nhận trong spec Dev Notes
- [x] [Review][Defer] W2: X-Forwarded-For có thể giả mạo khi không có reverse proxy, audit log ghi IP sai [audit.service.ts:22-27] — deferred, phụ thuộc deployment infrastructure
- [x] [Review][Defer] W3: orders.viewAll thiếu trong permissions.ts dù AC3 ma trận quyền liệt kê — deferred, orders module chưa implement, sẽ thêm ở Epic 3

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
