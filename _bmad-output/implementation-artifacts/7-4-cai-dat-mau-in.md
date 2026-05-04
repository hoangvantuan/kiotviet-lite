# Story 7.4: Cài đặt mẫu in

Status: ready-for-dev

## Story

As a chủ cửa hàng,
I want tùy chỉnh mẫu in hóa đơn với logo, slogan và các trường hiển thị,
so that hóa đơn phản ánh thương hiệu cửa hàng.

## Acceptance Criteria (BDD)

### AC1: Tùy chỉnh template in

**Given** chủ cửa hàng (role=owner/manager) mở Cài đặt > Mẫu in
**When** tùy chỉnh template
**Then** có thể cấu hình các trường sau:

| Trường | Kiểu | Mặc định | Ghi chú |
|--------|------|----------|---------|
| logo | file upload | null | ≤2MB, jpg/png, lưu base64 data URL |
| slogan | text | null | max 100 ký tự |
| defaultPaperSize | select | '58mm' | '58mm', '80mm', 'a4', 'a5' |
| showOldDebt | toggle | false | Hiển thị nợ cũ trên hóa đơn |
| showNewDebt | toggle | true | Hiển thị nợ mới trên hóa đơn |
| showCostPrice | toggle | false | Hiển thị giá vốn (chỉ owner) |
| showDiscount | toggle | true | Hiển thị chiết khấu |
| showNotes | toggle | true | Hiển thị ghi chú cuối hóa đơn |
| showCustomerName | toggle | true | Hiển thị tên KH |
| showCustomerPhone | toggle | true | Hiển thị SĐT KH |
| showSku | toggle | false | Hiển thị mã SKU |
| footerText | text | 'Cảm ơn quý khách!' | max 200 ký tự |

**And** cài đặt lưu vào bảng `print_settings` theo `store_id`
**And** chỉ owner/manager mới truy cập được (permission: `store.manage`)
**And** nhân viên (role=staff) không thấy tab "Mẫu in" trong Cài đặt

### AC2: Preview realtime

**Given** đang ở trang Cài đặt > Mẫu in
**When** thay đổi bất kỳ trường nào (logo, slogan, toggle, footer)
**Then** preview bên phải (desktop) hoặc bên dưới (mobile) hiển thị mẫu in đã cập nhật ngay lập tức
**And** preview hiển thị dữ liệu mẫu (đơn hàng giả) để dễ hình dung
**And** preview hiển thị theo `defaultPaperSize` đã chọn
**And** preview chỉ là visual, KHÔNG trigger window.print()

### AC3: Giá trị mặc định khi mở lần đầu

**Given** cửa hàng chưa có bản ghi trong bảng `print_settings`
**When** mở trang Cài đặt > Mẫu in lần đầu
**Then** API GET trả về giá trị mặc định (không cần INSERT trước)
**And** form hiển thị với giá trị mặc định từ bảng AC1
**And** khi user bấm "Lưu" lần đầu: INSERT bản ghi mới

### AC4: Tích hợp print settings vào luồng in (Story 7.3)

**Given** bảng `print_settings` đã có bản ghi cho cửa hàng
**When** nhân viên bấm "In hóa đơn" (từ POS hoặc chi tiết HĐ)
**Then** `usePrintOrder` hook đọc settings từ TanStack Query cache
**And** áp dụng: logo, slogan, defaultPaperSize, showOldDebt, showNewDebt, showDiscount, showNotes, showCustomerName, showCustomerPhone, showSku, footerText
**And** nếu chưa có settings: dùng DEFAULT_PRINT_OPTIONS hiện tại (backward compatible)

## Tasks / Subtasks

- [ ] Task 1: Tạo DB schema + migration (AC: #1, #3)
  - [ ] 1.1: Tạo `packages/shared/src/schema/print-settings.ts` với Drizzle schema
    - Bảng `print_settings`: id (uuid PK), storeId (uuid FK → stores, unique), logoUrl (text nullable), slogan (varchar 100 nullable), defaultPaperSize (varchar 8, default '58mm'), showOldDebt (boolean, default false), showNewDebt (boolean, default true), showCostPrice (boolean, default false), showDiscount (boolean, default true), showNotes (boolean, default true), showCustomerName (boolean, default true), showCustomerPhone (boolean, default true), showSku (boolean, default false), footerText (varchar 200, default 'Cảm ơn quý khách!'), createdAt, updatedAt
    - Unique index trên storeId
  - [ ] 1.2: Tạo Zod schemas trong cùng file hoặc file riêng: `printSettingsSchema`, `updatePrintSettingsSchema`
  - [ ] 1.3: Export từ `packages/shared/src/schema/index.ts`
  - [ ] 1.4: Chạy `pnpm drizzle-kit generate` để tạo migration
  - [ ] 1.5: Chạy migration

- [ ] Task 2: Tạo API endpoints (AC: #1, #3)
  - [ ] 2.1: Tạo `apps/api/src/services/print-settings.service.ts`
    - `getPrintSettings(db, storeId)`: SELECT từ `print_settings` WHERE storeId. Nếu không có bản ghi: trả về object default (KHÔNG INSERT)
    - `upsertPrintSettings(db, storeId, input)`: INSERT ON CONFLICT storeId DO UPDATE
    - Logo validation: reuse pattern từ `store.service.ts` (validateLogoSize)
  - [ ] 2.2: Tạo `apps/api/src/routes/print-settings.routes.ts`
    - `GET /api/v1/print-settings`: trả về settings hiện tại hoặc defaults
    - `PUT /api/v1/print-settings`: upsert settings, yêu cầu permission `store.manage`
    - Middleware: requireAuth + requirePermission('store.manage') cho PUT
    - Audit log cho PUT (pattern từ store.routes.ts)
  - [ ] 2.3: Mount route vào app router (`apps/api/src/index.ts` hoặc `app.ts`)

- [ ] Task 3: Tạo frontend API + hook (AC: #1, #2, #3)
  - [ ] 3.1: Tạo `apps/web/src/features/settings/print-settings-api.ts`
    - `getPrintSettingsApi()`: GET /api/v1/print-settings
    - `updatePrintSettingsApi(input)`: PUT /api/v1/print-settings
  - [ ] 3.2: Tạo `apps/web/src/features/settings/use-print-settings.ts`
    - `usePrintSettingsQuery()`: TanStack Query, queryKey `['print-settings']`
    - `useUpdatePrintSettingsMutation()`: invalidate `['print-settings']` on success
    - `DEFAULT_PRINT_SETTINGS` constant cho fallback

- [ ] Task 4: Tạo UI trang Cài đặt mẫu in (AC: #1, #2)
  - [ ] 4.1: Tạo `apps/web/src/features/settings/print-settings-form.tsx`
    - Layout 2 cột (desktop): form bên trái, preview bên phải
    - Layout 1 cột (mobile): form trên, preview dưới
    - Form fields theo AC1: logo upload, slogan input, paper size select, toggle switches, footer text
    - Dùng React Hook Form + Zod resolver
    - Logo upload: reuse pattern từ `store-settings-form.tsx` (FileReader → base64 data URL)
    - Toggle switches: dùng shadcn/ui Switch component
    - Paper size: dùng shadcn/ui Select component
    - Nút "Lưu cài đặt" + loading state
  - [ ] 4.2: Preview component trong cùng file hoặc tách riêng
    - Render mẫu thermal (theo paper size đã chọn) với dữ liệu giả
    - Dữ liệu giả: "HĐ-20260504-0001", "Nguyễn Văn A", 3 sản phẩm mẫu, tổng 150.000đ
    - Reactive: mỗi khi form values thay đổi, preview cập nhật ngay (watch form values)
    - Container có border, max-width tương ứng paper size, background trắng

- [ ] Task 5: Thêm tab "Mẫu in" vào Settings (AC: #1)
  - [ ] 5.1: Tạo `apps/web/src/pages/settings-print-page.tsx`
    - Import và render `PrintSettingsForm`
  - [ ] 5.2: Cập nhật `apps/web/src/pages/settings-page.tsx`:
    - Thêm tab `{ value: 'print', label: 'Mẫu in', path: '/settings/print', permission: 'store.manage' }`
  - [ ] 5.3: Cập nhật `apps/web/src/router.tsx`:
    - Import `SettingsPrintPage`
    - Thêm route `settingsPrintRoute` (path: 'print', permission: 'store.manage')
    - Thêm vào routeTree settingsRoute.addChildren

- [ ] Task 6: Tích hợp print settings vào luồng in (AC: #4)
  - [ ] 6.1: Cập nhật `apps/web/src/features/orders/use-print-order.ts`:
    - Import `usePrintSettingsQuery` hoặc pass settings qua params
    - Thay `DEFAULT_PRINT_OPTIONS` bằng settings từ DB (fallback nếu chưa có)
    - Đọc `defaultPaperSize` từ settings thay vì localStorage `kv_print_default_format`
  - [ ] 6.2: Cập nhật `order-invoice-template.tsx`:
    - Truyền print settings xuống components (showCustomerName, showCustomerPhone, showSku, showNotes, v.v.)
    - Conditional render các trường dựa trên settings
  - [ ] 6.3: Cập nhật `thermal-printer.ts`:
    - `buildOrderReceipt` nhận thêm settings object
    - Conditional include/exclude fields dựa trên settings

- [ ] Task 7: Testing (AC: #1, #2, #3, #4)
  - [ ] 7.1: Unit test cho service (getPrintSettings, upsertPrintSettings)
  - [ ] 7.2: Integration test cho API routes (GET default, PUT upsert, GET after update, permission check)
  - [ ] 7.3: Verify typecheck clean: `pnpm typecheck` trong shared + api + web
  - [ ] 7.4: Verify existing tests không bị break

## Dev Notes

### Codebase patterns BẮT BUỘC tuân thủ

**Schema pattern (Drizzle + Zod):**
- Schema table trong `packages/shared/src/schema/` (xem `stores.ts` làm mẫu)
- Import: `pgTable, text, timestamp, uuid, varchar, boolean` từ `drizzle-orm/pg-core`
- PK: `uuid().primaryKey().$defaultFn(() => uuidv7())`
- FK: `.references(() => stores.id, { onDelete: 'restrict' })`
- Timestamps: `createdAt` + `updatedAt` pattern giống `stores.ts`
- Zod schemas cùng file hoặc riêng: response schema + input schema
- Export từ `packages/shared/src/schema/index.ts`

**API routes pattern (Hono):**
- Xem `store.routes.ts` làm mẫu gần nhất
- `createXxxRoutes({ db })` factory function
- Middleware: `requireAuth`, `requirePermission('store.manage')`
- Response: `c.json({ data })` envelope
- Input parsing: `parseJson(c, schema)`
- Error handling: `errorHandler` middleware
- Audit logging: `logAction()` cho mutations

**Frontend pattern:**
- API client: `apiClient.get/put` từ `@/lib/api-client` (xem `store-settings-api.ts`)
- TanStack Query hooks: `useQuery` + `useMutation` pattern (xem `use-store-settings.ts`)
- Form: React Hook Form + zodResolver (xem `store-settings-form.tsx`)
- Toast: `showSuccess()`, `showError()` từ `@/lib/toast`
- Logo upload: pattern base64 data URL đã có trong `store-settings-form.tsx`
- Styling: Tailwind CSS + shadcn/ui components ONLY
- Responsive: `md:` breakpoint cho 2 cột layout

**Settings page pattern:**
- Tab navigation qua `SETTINGS_TABS` array trong `settings-page.tsx`
- Mỗi tab = 1 page component, render qua `<Outlet />`
- Route: child route của `settingsRoute`, path relative (vd: 'print')
- Permission guard: `requirePermissionGuard('store.manage')`

### Previous Story Intelligence (Story 7.3)

Story 7.3 đã tạo:
- `use-print-order.ts` với `DEFAULT_PRINT_OPTIONS` hardcoded
- `thermal-printer.ts` với `buildOrderReceipt(order, store, options)`
- `order-invoice-template.tsx` với `OrderInvoiceThermal`, `OrderInvoiceA4`, `OrderInvoiceA5`
- `print-button.tsx` với dropdown chọn format
- `serial-port.ts` cho Web Serial API
- `number-to-words.ts` cho tổng bằng chữ

Story 7.4 cần tích hợp settings vào các file trên. Thay DEFAULT_PRINT_OPTIONS bằng settings từ DB.

`InvoiceStoreInfo` interface đã có `slogan` field, sẵn sàng cho print settings.

### Files sẽ tạo mới

```
packages/shared/src/schema/print-settings.ts       # Drizzle schema + Zod schemas
apps/api/src/services/print-settings.service.ts     # Business logic
apps/api/src/routes/print-settings.routes.ts        # API endpoints
apps/web/src/features/settings/print-settings-api.ts     # Frontend API client
apps/web/src/features/settings/use-print-settings.ts     # TanStack Query hooks
apps/web/src/features/settings/print-settings-form.tsx   # UI form + preview
apps/web/src/pages/settings-print-page.tsx               # Page component
```

### Files sẽ sửa

```
packages/shared/src/schema/index.ts                    # Export print-settings
apps/api/src/app.ts (hoặc index.ts)                    # Mount print-settings route
apps/web/src/pages/settings-page.tsx                   # Thêm tab "Mẫu in"
apps/web/src/router.tsx                                # Thêm route settings/print
apps/web/src/features/orders/use-print-order.ts        # Tích hợp print settings
apps/web/src/features/orders/order-invoice-template.tsx # Conditional fields
apps/web/src/lib/thermal-printer.ts                    # Nhận settings object
```

### Dữ liệu mẫu cho Preview

```typescript
const SAMPLE_ORDER = {
  orderNumber: 'HD-20260504-0001',
  createdAt: new Date().toISOString(),
  customerName: 'Nguyễn Văn A',
  customerPhone: '0901234567',
  items: [
    { productName: 'Sữa tươi Vinamilk 1L', quantity: 2, unitPrice: 35000, discountAmount: 0, lineTotal: 70000 },
    { productName: 'Mì Hảo Hảo (thùng 30 gói)', quantity: 1, unitPrice: 95000, discountAmount: 5000, lineTotal: 90000 },
    { productName: 'Nước ngọt Coca-Cola 330ml', quantity: 3, unitPrice: 10000, discountAmount: 0, lineTotal: 30000 },
  ],
  subtotal: 190000,
  discountAmount: 5000,
  total: 185000,
  paymentMethod: 'cash',
  paidAmount: 200000,
  change: 15000,
  debtAmount: 0,
}
```

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-7-ha-n-in-n.md#Story 7.4]
- [Source: apps/web/src/features/settings/store-settings-form.tsx] (pattern logo upload, form layout)
- [Source: apps/web/src/features/settings/use-store-settings.ts] (pattern TanStack Query)
- [Source: apps/web/src/features/settings/store-settings-api.ts] (pattern API client)
- [Source: apps/web/src/pages/settings-page.tsx] (pattern tabs navigation)
- [Source: apps/api/src/routes/store.routes.ts] (pattern Hono routes)
- [Source: apps/api/src/services/store.service.ts] (pattern service + logo validation)
- [Source: apps/web/src/features/orders/use-print-order.ts] (DEFAULT_PRINT_OPTIONS cần thay thế)
- [Source: apps/web/src/features/orders/order-invoice-template.tsx] (InvoiceStoreInfo interface)
- [Source: packages/shared/src/schema/stores.ts] (pattern Drizzle schema)

## Dev Agent Record

### Agent Model Used

(chưa assign)

### Debug Log References

### Completion Notes List

### Change Log

### File List
